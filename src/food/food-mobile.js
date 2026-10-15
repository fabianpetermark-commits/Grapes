import { createEmptyFoodProject, createFoodId, currentTargets, entriesForLocalDay, normalizeDiaryEntry, normalizeFoodItem, normalizeFoodProject, summarizeEntries } from './food-data.js'
import { acceptMealShare, acceptRecipeShare, rememberSharingContact } from './food-sharing.js'
import { listFoodShares, loadFoodShare, setFoodShareState } from './food-sharing-client.js'
import { getGrapesAccount, isGrapesDriveConnected, listGrapesProjects, loadGrapesProject, saveGrapesProject } from '../storage/grapes-drive.js'
import { loadLocalProject, saveLocalProject } from '../storage/local-project-store.js'

const MODULE = 'Ételnapló'
const PROJECT_NAME = 'Ételnapló'
const MEALS = [
  ['breakfast', 'Reggeli', '☕'], ['morningSnack', 'Tízórai', '◔'], ['lunch', 'Ebéd', '☀'],
  ['afternoonSnack', 'Uzsonna', '◌'], ['dinner', 'Vacsora', '☾'],
]
const LABELS = Object.fromEntries(MEALS.map(([id, label]) => [id, label]))
const UNIT_LABELS = { g: 'g', ml: 'ml', serving: 'adag', piece: 'db', slice: 'szelet', package: 'csomag' }

const localDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const number = (value, digits = 0) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: digits }).format(Number(value) || 0)

export function createMobileFoodController({ root = document, fab, addSheet, backdrop, showToast, openLegacy, sendMeal = null, sendRecipe = null }) {
  let project = null
  let profile = null
  let driveFileId = null
  let selectedDate = localDate()
  let selectedMeal = ''
  let selectedRecipeId = ''
  let saveTimer = null
  let driveTimer = null
  let initialized = false
  let inbox = []
  let activeInboxItem = null
  let activeInboxShare = null
  let activeEditId = ''

  const $ = selector => root.querySelector(selector)
  const localProjectId = () => `food-tracker-${profile.id}`
  const accountProfile = () => {
    const account = getGrapesAccount() || {}
    return { id: String(account.id || account.email || 'local-food-profile').trim().toLocaleLowerCase('hu-HU'), name: account.name || account.email?.split('@')[0] || 'Grapes-felhasználó', email: account.email || '', photo: account.photo || '' }
  }

  async function load() {
    profile = accountProfile()
    const local = await loadLocalProject(localProjectId()).catch(() => null)
    project = local?.data ? normalizeFoodProject(local.data, profile.id) : createEmptyFoodProject(profile)
    driveFileId = local?.driveFileId || null
    if (isGrapesDriveConnected() && !project.syncState?.localDirty) {
      try {
        const files = await listGrapesProjects(MODULE)
        const candidate = files.find(file => file.id === driveFileId) || files[0]
        if (candidate) {
          const remote = await loadGrapesProject(candidate.id)
          project = normalizeFoodProject(remote.data, profile.id)
          project.syncState = { ...project.syncState, localDirty: false }
          driveFileId = candidate.id
          await persistLocal()
        }
      } catch { /* The local diary remains fully usable offline. */ }
    }
    render()
    if (isGrapesDriveConnected()) refreshInbox().catch(() => {})
  }

  async function persistLocal() {
    await saveLocalProject({ id: localProjectId(), module: MODULE, name: PROJECT_NAME, data: project, driveFileId })
  }

  async function persistDrive() {
    if (!isGrapesDriveConnected()) return
    try {
      const cleanProject = { ...project, syncState: { ...project.syncState, localDirty: false } }
      driveFileId = await saveGrapesProject({ module: MODULE, name: PROJECT_NAME, data: cleanProject, fileId: driveFileId })
      project = cleanProject
      await persistLocal()
    } catch {
      project.syncState = { ...project.syncState, localDirty: true }
      await persistLocal().catch(() => {})
    }
  }

  function scheduleSave() {
    project.syncState = { ...project.syncState, localDirty: true }
    clearTimeout(saveTimer); clearTimeout(driveTimer)
    saveTimer = setTimeout(() => persistLocal().catch(() => showToast('A helyi mentés nem sikerült.')), 180)
    driveTimer = setTimeout(persistDrive, 1600)
  }

  function selectedEntries() { return entriesForLocalDay(project.diaryEntries, selectedDate, profile.id) }
  function setBar(selector, value, target) { $(selector).style.width = `${target ? Math.min(100, (Number(value) || 0) / target * 100) : 0}%` }

  function renderOverview() {
    const entries = selectedEntries()
    const totals = summarizeEntries(entries)
    const targets = currentTargets(project, selectedDate)
    const today = selectedDate === localDate()
    const date = new Date(`${selectedDate}T12:00:00`)
    $('[data-food-day-title]').textContent = today ? 'Ma' : date.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' })
    $('[data-food-day-copy]').textContent = `${date.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })} · ${new Set(entries.map(item => item.mealType)).size} étkezés`
    $('[data-food-date]').value = selectedDate
    $('[data-food-energy]').textContent = number(totals.energyKcal)
    $('[data-food-energy-target]').textContent = `${number(targets.energyKcal)} kcal`
    const energyPercent = targets.energyKcal ? Math.min(100, (totals.energyKcal || 0) / targets.energyKcal * 100) : 0
    $('[data-food-energy-ring]').style.background = `conic-gradient(var(--accent) 0 ${energyPercent}%, #1d2b38 ${energyPercent}% 100%)`
    const remaining = Math.max(0, (targets.energyKcal || 0) - (totals.energyKcal || 0))
    $('[data-food-message]').textContent = !entries.length ? 'Kezdjük a napot' : remaining ? 'Jó úton haladsz' : 'Megvan a napi cél!'
    $('[data-food-remaining]').textContent = remaining ? `${number(remaining)} kcal maradt mára` : `${number(totals.energyKcal)} kcal naplózva`
    for (const key of ['protein', 'carbohydrate', 'fat']) {
      $(`[data-food-${key}]`).textContent = `${number(totals[key], 1)} g`
      setBar(`[data-food-${key}-bar]`, totals[key], targets[key])
    }
    renderMeals(entries)
    renderRecipes()
  }

  function renderMeals(daily) {
    const container = $('[data-food-meals]'); container.replaceChildren()
    for (const [type, label, icon] of MEALS) {
      const entries = daily.filter(item => item.mealType === type)
      const calories = summarizeEntries(entries).energyKcal || 0
      const button = document.createElement('button'); button.type = 'button'; button.className = 'meal'; button.dataset.meal = type
      const names = entries.slice(0, 3).map(item => item.snapshot.name).join(', ')
      const lastTime = entries.length ? new Date(entries.at(-1).occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''
      button.innerHTML = `<span class="meal__icon">${icon}</span><span><strong>${label}</strong><span>${entries.length ? `${escapeHtml(names)} · ${lastTime}` : 'Még nincs rögzített étel'}</span></span><b>${number(calories)}</b>`
      button.addEventListener('click', () => openMeal(type))
      container.append(button)
    }
  }

  function renderRecipes() {
    const container = $('[data-food-recipes]'); container.replaceChildren()
    const recipes = [...project.recipes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 3)
    if (!recipes.length) { container.innerHTML = '<div class="food-empty" style="grid-column:1/-1">Még nincs saját recepted.</div>'; return }
    recipes.forEach((recipe, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'food-recipe'
      button.innerHTML = `<span class="food-recipe__cover" style="filter:hue-rotate(${index * 54}deg)">${escapeHtml(recipe.name)}</span><small>${recipe.ingredients.length} hozzávaló</small>`
      button.addEventListener('click', () => openRecipe(recipe.id))
      container.append(button)
    })
  }

  function openMeal(type) {
    selectedRecipeId = ''
    selectedMeal = type
    $('[data-food-overview]').hidden = true
    $('[data-food-detail]').hidden = false
    $('[data-food-detail-title]').textContent = LABELS[type]
    $('[data-food-detail-copy]').textContent = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })
    fab.hidden = false
    renderMealDetail()
  }

  function closeMeal() {
    selectedMeal = ''
    $('[data-food-detail]').hidden = true
    $('[data-food-overview]').hidden = false
    fab.hidden = true
    closeSheets()
    renderOverview()
  }

  function showOverview() {
    selectedMeal = ''; selectedRecipeId = ''
    $('[data-food-overview]').hidden = false
    $('[data-food-detail]').hidden = true
    $('[data-food-recipes-view]').hidden = true
    $('[data-food-recipe-detail]').hidden = true
    fab.hidden = true; closeSheets(); renderOverview()
  }

  function openRecipes() {
    selectedMeal = ''; selectedRecipeId = ''
    $('[data-food-overview]').hidden = true; $('[data-food-detail]').hidden = true
    $('[data-food-recipe-detail]').hidden = true; $('[data-food-recipes-view]').hidden = false
    fab.hidden = true; renderRecipeList()
  }

  function renderRecipeList() {
    const container = $('[data-food-recipes-list]'); container.replaceChildren()
    if (!project.recipes.length) { container.innerHTML = '<div class="empty-state">Még nincs saját recepted.</div>'; return }
    for (const recipe of [...project.recipes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'meal'
      button.innerHTML = `<span class="meal__icon">♨</span><span><strong>${escapeHtml(recipe.name)}</strong><span>${recipe.ingredients.length} hozzávaló · ${escapeHtml(recipe.category)}</span></span><b>›</b>`
      button.addEventListener('click', () => openRecipe(recipe.id)); container.append(button)
    }
  }

  function openRecipe(id) {
    const recipe = project.recipes.find(item => item.id === id); if (!recipe) return
    selectedMeal = ''; selectedRecipeId = id
    $('[data-food-overview]').hidden = true; $('[data-food-detail]').hidden = true; $('[data-food-recipes-view]').hidden = true; $('[data-food-recipe-detail]').hidden = false
    $('[data-food-recipe-title]').textContent = recipe.name
    $('[data-food-recipe-copy]').textContent = `${recipe.category} · ${recipe.ingredients.length} hozzávaló`
    const foodNames = new Map(project.customFoods.map(item => [item.id, item.name]))
    $('[data-food-recipe-content]').innerHTML = `<strong>Hozzávalók</strong>${recipe.ingredients.map(item => `<span>${escapeHtml(foodNames.get(item.foodId) || 'Ismeretlen hozzávaló')} · ${number(item.amount, 2)} ${UNIT_LABELS[item.unit] || item.unit}</span>`).join('')}${recipe.instructions ? `<br><strong>Elkészítés</strong><span>${escapeHtml(recipe.instructions)}</span>` : ''}`
    fab.hidden = true
  }

  function renderMealDetail() {
    const container = $('[data-food-entries]'); container.replaceChildren()
    const entries = selectedEntries().filter(item => item.mealType === selectedMeal)
    if (!entries.length) { container.innerHTML = '<div class="empty-state">Ebben az étkezésben még nincs étel. A + gombbal adhatsz hozzá.</div>'; return }
    for (const entry of entries) {
      const card = document.createElement('article'); card.className = 'food-entry-card'
      const time = new Date(entry.occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
      card.innerHTML = `<div class="food-entry-card__head"><div><strong>${escapeHtml(entry.snapshot.name)}</strong><span>${number(entry.amount, 2)} ${UNIT_LABELS[entry.unit] || entry.unit} · ${time}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</span></div><b>${number(entry.snapshot.nutrients.energyKcal, 1)} kcal</b></div><div class="food-entry-card__actions"><button data-entry-edit="${entry.id}">Szerkesztés</button><button data-entry-repeat="${entry.id}">Ismétlés</button><button data-entry-delete="${entry.id}">Törlés</button></div>`
      container.append(card)
    }
  }

  function openAddSheet() {
    if (!selectedMeal) return
    addSheet.classList.add('is-open'); backdrop.classList.add('is-open')
    $('[data-food-search]').value = ''; renderFoodSearch('')
    setTimeout(() => $('[data-food-search]').focus(), 100)
  }

  function closeSheets() {
    addSheet.classList.remove('is-open')
    $('[data-food-custom-sheet]').classList.remove('is-open')
    $('[data-food-share-sheet]').classList.remove('is-open')
    $('[data-food-inbox-sheet]').classList.remove('is-open')
    $('[data-food-edit-sheet]').classList.remove('is-open')
    $('[data-food-menu-sheet]').classList.remove('is-open')
    backdrop.classList.remove('is-open')
  }

  function openCustomFoodSheet() {
    closeSheets()
    $('[data-food-custom-name]').value = ''
    $('[data-food-custom-category]').value = 'Egyéb'
    $('[data-food-custom-unit]').value = 'g'
    for (const key of ['energy', 'protein', 'carbohydrate', 'fat']) $(`[data-food-custom-${key}]`).value = ''
    $('[data-food-custom-status]').textContent = ''
    $('[data-food-custom-sheet]').classList.add('is-open'); backdrop.classList.add('is-open')
    setTimeout(() => $('[data-food-custom-name]').focus(), 100)
  }

  function saveCustomFood() {
    const status = $('[data-food-custom-status]')
    try {
      const now = new Date().toISOString()
      const food = normalizeFoodItem({
        id: createFoodId('food'),
        kind: 'manual',
        name: $('[data-food-custom-name]').value,
        category: $('[data-food-custom-category]').value,
        baseUnit: $('[data-food-custom-unit]').value,
        nutrients: {
          energyKcal: $('[data-food-custom-energy]').value,
          protein: $('[data-food-custom-protein]').value,
          carbohydrate: $('[data-food-custom-carbohydrate]').value,
          fat: $('[data-food-custom-fat]').value,
        },
        source: { type: 'manual' },
        createdAt: now,
        updatedAt: now,
      })
      project.customFoods.push(food)
      addFood(food)
    } catch (error) { status.textContent = error.message }
  }

  function renderFoodSearch(query, { favoritesOnly = false } = {}) {
    const normalized = query.trim().toLocaleLowerCase('hu-HU')
    let foods = project.customFoods.filter(item => (!favoritesOnly || project.favorites.includes(item.id)) && (!normalized || `${item.name} ${item.category}`.toLocaleLowerCase('hu-HU').includes(normalized)))
    foods = foods.sort((a, b) => (project.favorites.includes(b.id) ? 1 : 0) - (project.favorites.includes(a.id) ? 1 : 0)).slice(0, 15)
    const container = $('[data-food-search-results]'); container.replaceChildren()
    if (!foods.length) {
      container.innerHTML = `<div class="food-empty">${favoritesOnly ? 'Még nincs kedvencnek jelölt ételed.' : normalized ? 'Nincs találat. A Saját étel gombbal hozhatsz létre újat.' : 'Még nincs saját ételed. A Saját étel gombbal hozhatsz létre egyet.'}</div>`
      return
    }
    for (const food of foods) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sheet-result'
      button.innerHTML = `<strong>${escapeHtml(food.name)}</strong><span>${number(food.nutrients.energyKcal, 1)} kcal / 100 ${food.baseUnit}</span>`
      button.addEventListener('click', () => addFood(food))
      container.append(button)
    }
  }

  function addFood(food) {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const entry = normalizeDiaryEntry({ id: createFoodId('entry'), profileId: profile.id, mealType: selectedMeal, amount: 100, unit: food.baseUnit, occurredAt: new Date(`${selectedDate}T${time}:00`).toISOString(), createdAt: new Date().toISOString() }, food)
    project.diaryEntries.push(entry)
    project.recentFoods = [food.id, ...project.recentFoods.filter(id => id !== food.id)].slice(0, 50)
    scheduleSave(); closeSheets(); renderMealDetail(); showToast(`${food.name} hozzáadva.`)
  }

  function deleteEntry(id) {
    project.diaryEntries = project.diaryEntries.filter(item => item.id !== id)
    scheduleSave(); renderMealDetail(); showToast('A bejegyzés törölve.')
  }

  function openEntryEditor(id) {
    const entry = project.diaryEntries.find(item => item.id === id); if (!entry) return
    activeEditId = id; closeSheets()
    $('[data-food-edit-title]').textContent = entry.snapshot.name
    $('[data-food-edit-amount]').value = entry.amount
    const food = project.customFoods.find(item => item.id === entry.snapshot.foodId)
    const units = food ? [{ value: food.baseUnit, label: food.baseUnit }, ...food.servings.map(item => ({ value: item.unit, label: item.name }))] : [{ value: entry.unit, label: UNIT_LABELS[entry.unit] || entry.unit }]
    const unit = $('[data-food-edit-unit]'); unit.replaceChildren(...units.map(item => new Option(item.label, item.value))); unit.value = entry.unit
    $('[data-food-edit-time]').value = new Date(entry.occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    $('[data-food-edit-note]').value = entry.note
    $('[data-food-edit-status]').textContent = ''
    $('[data-food-edit-sheet]').classList.add('is-open'); backdrop.classList.add('is-open')
  }

  function saveEntryEdit() {
    const entry = project.diaryEntries.find(item => item.id === activeEditId); if (!entry) return
    const food = project.customFoods.find(item => item.id === entry.snapshot.foodId)
    try {
      const time = $('[data-food-edit-time]').value || '12:00'
      const draft = { ...entry, amount: $('[data-food-edit-amount]').value, unit: $('[data-food-edit-unit]').value, note: $('[data-food-edit-note]').value, occurredAt: new Date(`${selectedDate}T${time}:00`).toISOString(), updatedAt: new Date().toISOString() }
      const updated = food ? normalizeDiaryEntry(draft, food) : normalizeDiaryEntry({ ...draft, snapshot: scaledSnapshot(entry.snapshot, Number(draft.amount) / entry.amount) })
      project.diaryEntries = project.diaryEntries.map(item => item.id === entry.id ? updated : item)
      scheduleSave(); closeSheets(); renderMealDetail(); showToast('A bejegyzés módosítva.')
    } catch (error) { $('[data-food-edit-status]').textContent = error.message }
  }

  function repeatEntry(id) {
    const entry = project.diaryEntries.find(item => item.id === id); if (!entry) return
    const now = new Date()
    project.diaryEntries.push(normalizeDiaryEntry({ ...entry, id: createFoodId('entry'), occurredAt: new Date(`${selectedDate}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    scheduleSave(); renderMealDetail(); showToast('Az étel megismételve.')
  }

  function openShareSheet() {
    if (!profile.email) return showToast('A megosztáshoz csatlakoztasd a Google-fiókodat.')
    closeSheets()
    const shareSheet = $('[data-food-share-sheet]')
    const recipe = selectedRecipeId ? project.recipes.find(item => item.id === selectedRecipeId) : null
    $('[data-food-share-title]').textContent = recipe ? `${recipe.name} megosztása` : `${LABELS[selectedMeal]} megosztása`
    $('[data-food-share-email]').value = ''
    $('[data-food-share-status]').textContent = ''
    const list = $('[data-food-share-contacts]'); list.replaceChildren(...(project.sharingContacts || []).map(item => new Option(item.name || item.email, item.email)))
    shareSheet.classList.add('is-open'); backdrop.classList.add('is-open')
  }

  function openFoodMenu() {
    closeSheets(); $('[data-food-menu-sheet]').classList.add('is-open'); backdrop.classList.add('is-open')
  }

  async function submitShare() {
    const email = $('[data-food-share-email]').value
    try {
      const result = selectedRecipeId
        ? await sendRecipe?.({ project, recipeId: selectedRecipeId, email })
        : await sendMeal?.({ project, date: selectedDate, mealType: selectedMeal, email })
      if (!result) throw new Error('A megosztási postafiók telepítése még nincs kész.')
      rememberSharingContact(project, email, result?.recipientName || '')
      scheduleSave(); closeSheets(); showToast('Az étkezést elküldtük jóváhagyásra.')
    } catch (error) { $('[data-food-share-status]').textContent = error.message }
  }

  async function refreshInbox({ open = false } = {}) {
    if (!isGrapesDriveConnected()) {
      if (open) showToast('A beérkező megosztásokhoz csatlakoztasd a Google Drive-ot.')
      return
    }
    const button = $('[data-food-inbox]')
    try {
      inbox = await listFoodShares()
      button.dataset.count = String(inbox.length)
      if (open) openInbox()
    } catch (error) { if (open) showToast(error.message) }
  }

  function openInbox() {
    closeSheets(); activeInboxItem = null; activeInboxShare = null
    const sheet = $('[data-food-inbox-sheet]'); sheet.classList.add('is-open'); backdrop.classList.add('is-open')
    $('[data-food-inbox-preview]').hidden = true
    $('[data-food-inbox-status]').textContent = ''
    renderInboxItems()
  }

  function renderInboxItems() {
    const container = $('[data-food-inbox-items]'); container.replaceChildren()
    if (!inbox.length) { container.innerHTML = '<div class="food-empty">Nincs új megosztás.</div>'; return }
    for (const item of inbox) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sheet-result'
      button.innerHTML = `<strong>${item.type === 'meal' ? 'Étkezés' : 'Recept'}</strong><span>${escapeHtml(item.senderName || item.senderEmail)}</span>`
      button.addEventListener('click', () => previewInboxItem(item))
      container.append(button)
    }
  }

  async function previewInboxItem(item) {
    const status = $('[data-food-inbox-status]'); status.textContent = 'Megosztás betöltése…'
    try {
      activeInboxShare = await loadFoodShare(item); activeInboxItem = item
      const meal = item.type === 'meal'
      $('[data-food-inbox-summary]').textContent = meal
        ? `${item.senderName || item.senderEmail} ${LABELS[activeInboxShare.payload.mealType] || 'étkezés'} étkezése · ${activeInboxShare.payload.entries.length} tétel`
        : `${item.senderName || item.senderEmail} receptje: ${activeInboxShare.payload.recipe.name}`
      $('[data-food-inbox-date-label]').hidden = !meal
      $('[data-food-inbox-replace-label]').hidden = !meal
      $('[data-food-inbox-date]').value = meal ? activeInboxShare.payload.date : ''
      $('[data-food-inbox-replace]').checked = false
      $('[data-food-inbox-preview]').hidden = false; status.textContent = ''
    } catch (error) { status.textContent = error.message }
  }

  async function acceptInboxItem() {
    if (!activeInboxShare || !activeInboxItem) return
    const status = $('[data-food-inbox-status]'); status.textContent = 'Átvétel és mentés…'
    try {
      if (activeInboxShare.type === 'meal') acceptMealShare(project, activeInboxShare, { date: $('[data-food-inbox-date]').value, replace: $('[data-food-inbox-replace]').checked })
      else acceptRecipeShare(project, activeInboxShare)
      project.syncState = { ...project.syncState, localDirty: true }
      await persistLocal()
      await setFoodShareState(activeInboxShare.id, 'accepted')
      inbox = inbox.filter(item => item.id !== activeInboxShare.id)
      $('[data-food-inbox]').dataset.count = String(inbox.length)
      scheduleSave(); activeInboxShare = null; activeInboxItem = null; $('[data-food-inbox-preview]').hidden = true; renderInboxItems(); render()
      status.textContent = 'A megosztás bekerült a saját naplódba.'
    } catch (error) { status.textContent = error.message }
  }

  async function rejectInboxItem() {
    if (!activeInboxShare) return
    const status = $('[data-food-inbox-status]')
    try {
      await setFoodShareState(activeInboxShare.id, 'rejected')
      inbox = inbox.filter(item => item.id !== activeInboxShare.id)
      $('[data-food-inbox]').dataset.count = String(inbox.length)
      activeInboxShare = null; activeInboxItem = null; $('[data-food-inbox-preview]').hidden = true; renderInboxItems(); status.textContent = 'A megosztást elutasítottad.'
    } catch (error) { status.textContent = error.message }
  }

  function shiftDate(days) {
    const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + days); selectedDate = localDate(date); renderOverview()
  }

  function render() { renderOverview(); if (selectedMeal) renderMealDetail() }

  function bind() {
    if (initialized) return
    initialized = true
    $('[data-food-date-prev]').addEventListener('click', () => shiftDate(-1))
    $('[data-food-date-next]').addEventListener('click', () => shiftDate(1))
    $('[data-food-date]').addEventListener('change', event => { selectedDate = event.currentTarget.value || localDate(); renderOverview() })
    $('[data-food-back]').addEventListener('click', closeMeal)
    $('[data-food-recipes-back]').addEventListener('click', showOverview)
    $('[data-food-recipe-back]').addEventListener('click', openRecipes)
    $('[data-food-recipe-share]').addEventListener('click', openShareSheet)
    $('[data-food-recipe-edit]').addEventListener('click', () => openLegacy('food', 'recipes', selectedRecipeId))
    $('[data-food-recipes-new]').addEventListener('click', () => openLegacy('food', 'recipes'))
    $('[data-food-share]').addEventListener('click', openShareSheet)
    $('[data-food-share-send]').addEventListener('click', submitShare)
    $('[data-food-summary-menu]').addEventListener('click', openFoodMenu)
    $('[data-food-search]').addEventListener('input', event => renderFoodSearch(event.currentTarget.value))
    $('[data-food-open-recipes]').addEventListener('click', openRecipes)
    $('[data-food-inbox]').addEventListener('click', () => refreshInbox({ open: true }))
    $('[data-food-inbox-accept]').addEventListener('click', acceptInboxItem)
    $('[data-food-inbox-reject]').addEventListener('click', rejectInboxItem)
    $('[data-food-edit-save]').addEventListener('click', saveEntryEdit)
    $('[data-food-edit-repeat]').addEventListener('click', () => { const id = activeEditId; closeSheets(); repeatEntry(id) })
    $('[data-food-edit-delete]').addEventListener('click', () => { const id = activeEditId; closeSheets(); deleteEntry(id) })
    $('[data-food-custom-save]').addEventListener('click', saveCustomFood)
    fab.addEventListener('click', openAddSheet)
    backdrop.addEventListener('click', closeSheets)
    root.addEventListener('click', event => {
      const remove = event.target.closest('[data-entry-delete]'); if (remove) return deleteEntry(remove.dataset.entryDelete)
      const repeat = event.target.closest('[data-entry-repeat]'); if (repeat) return repeatEntry(repeat.dataset.entryRepeat)
      const edit = event.target.closest('[data-entry-edit]'); if (edit) return openEntryEditor(edit.dataset.entryEdit)
      const quick = event.target.closest('[data-food-quick]')
      if (quick?.dataset.foodQuick === 'custom') return openCustomFoodSheet()
      if (quick?.dataset.foodQuick === 'favorites') {
        $('[data-food-search]').value = ''
        renderFoodSearch('', { favoritesOnly: true })
        return
      }
      if (quick) return showToast('A vonalkód- és fotókereső hamarosan ezen a mobilpanelen is elérhető lesz.')
      const menu = event.target.closest('[data-food-menu]'); if (menu) return openLegacy('food', menu.dataset.foodMenu === 'stats' || menu.dataset.foodMenu === 'targets' ? menu.dataset.foodMenu : 'diary', '', menu.dataset.foodMenu)
    })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && isGrapesDriveConnected()) refreshInbox().catch(() => {}) })
  }

  bind()
  return { load, render, closeMeal, isDetailOpen: () => Boolean(selectedMeal), flush: () => Promise.all([persistLocal(), persistDrive()]) }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function scaledSnapshot(snapshot, factor) {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('A mennyiségnek nullánál nagyobbnak kell lennie.')
  const nutrients = { ...snapshot.nutrients, extras: { ...(snapshot.nutrients?.extras || {}) } }
  for (const [key, value] of Object.entries(nutrients)) {
    if (key === 'extras' || value === null || value === undefined) continue
    nutrients[key] = Number((Number(value) * factor).toFixed(2))
  }
  for (const [key, value] of Object.entries(nutrients.extras)) nutrients.extras[key] = { ...value, amount: Number((Number(value.amount) * factor).toFixed(2)) }
  return { ...snapshot, baseAmount: Number((Number(snapshot.baseAmount) * factor).toFixed(2)), nutrients }
}
