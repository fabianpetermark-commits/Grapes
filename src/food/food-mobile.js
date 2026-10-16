import { calculateRecipeFood, createEmptyFoodProject, createFoodId, currentTargets, entriesForLocalDay, foodBackupFromJson, foodBackupToJson, normalizeDiaryEntry, normalizeFoodItem, normalizeFoodProject, normalizeRecipe, normalizeTargets, summarizeEntries } from './food-data.js'
import { acceptMealShare, acceptRecipeShare, rememberSharingContact } from './food-sharing.js'
import { listFoodShares, loadFoodShare, setFoodShareState } from './food-sharing-client.js'
import { lookupFatSecretProduct, lookupOpenFoodFactsProduct } from './food-api.js'
import { searchFoodCatalog } from './food-catalog-search.js'
import { searchOfflineBasicFoods } from './food-offline-catalog.js'
import { createMobileYazio } from './food-mobile-yazio.js'
import { healthImportEntries, prepareHealthBridgeImport } from './food-health-import.js'
import { prepareYazioCsvImport, yazioImportEntries } from './yazio-import.js'
import { getGrapesAccount, isGrapesDriveConnected, listGrapesProjects, loadGrapesProject, saveGrapesProject } from '../storage/grapes-drive.js'
import { loadLocalProject, saveLocalProject } from '../storage/local-project-store.js'
import { isGrapesAndroidApp, readAndroidHealthExport, readAndroidSamsungHealthExport } from '../android-bridge.js'
import { mobileIconSvg } from '../android-mobile-icons.js'

const MODULE = 'Ételnapló'
const PROJECT_NAME = 'Ételnapló'
const MEALS = [
  ['breakfast', 'Reggeli', 'breakfast'], ['morningSnack', 'Tízórai', 'morningSnack'], ['lunch', 'Ebéd', 'lunch'],
  ['afternoonSnack', 'Uzsonna', 'afternoonSnack'], ['dinner', 'Vacsora', 'dinner'],
]
const LABELS = Object.fromEntries(MEALS.map(([id, label]) => [id, label]))
const UNIT_LABELS = { g: 'g', ml: 'ml', serving: 'adag', piece: 'db', slice: 'szelet', package: 'csomag' }

const localDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const number = (value, digits = 0) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: digits }).format(Number(value) || 0)
const nutrient = (value, digits = 0, suffix = '') => value === null || value === undefined ? '—' : `${number(value, digits)}${suffix}`

export function createMobileFoodController({ root = document, fab, addSheet, backdrop, showToast, openLegacy, sendMeal = null, sendRecipe = null, onHydrationImport = null, getHydrationExternalKeys = null }) {
  let project = null
  let profile = null
  let driveFileId = null
  let selectedDate = localDate()
  let selectedMeal = ''
  let selectedRecipeId = ''
  let saveTimer = null
  let driveTimer = null
  let driveSaving = null
  let driveRequested = false
  let changeRevision = 0
  let loadGeneration = 0
  let loadedProfileId = ''
  let initialized = false
  let inbox = []
  let activeInboxItem = null
  let activeInboxShare = null
  let activeEditId = ''
  let pendingAddFood = null
  let searchTimer = null
  let searchGeneration = 0
  let pendingHealthImport = null
  let editingRecipeId = ''
  let recipeIngredients = []
  let sheetReturnFocus = null

  const $ = selector => root.querySelector(selector)
  const localProjectId = (profileId = profile?.id) => `food-tracker-${profileId}`
  const accountProfile = () => {
    const account = getGrapesAccount() || {}
    return { id: String(account.id || account.email || 'local-food-profile').trim().toLocaleLowerCase('hu-HU'), name: account.name || account.email?.split('@')[0] || 'Grapes-felhasználó', email: account.email || '', photo: account.photo || '' }
  }

  const yazio = createMobileYazio({ root, getProject: () => project, showToast,
    openSheet: sheet => { closeSheets(); setSheetOpen(sheet, true) }, closeSheet: () => closeSheets(),
    commit: async next => {
      if (next.profile.id !== profile.id) throw new Error('Az aktív profil megváltozott.')
      next.syncState = { ...next.syncState, localDirty: true }
      await persistLocal(next)
      project = next; changeRevision += 1; render()
    },
  })

  function migrateLocalProject(source, nextProfile) {
    const previousProfileId = source.profile.id
    const migrated = structuredClone(source)
    migrated.profile = nextProfile
    migrated.diaryEntries = migrated.diaryEntries.map(entry => ({ ...entry, profileId: entry.profileId === previousProfileId ? nextProfile.id : entry.profileId }))
    migrated.recipes = migrated.recipes.map(recipe => ({ ...recipe, ownerProfileId: recipe.ownerProfileId === previousProfileId ? nextProfile.id : recipe.ownerProfileId }))
    migrated.syncState = { ...migrated.syncState, localDirty: true }
    return normalizeFoodProject(migrated, nextProfile.id)
  }

  async function load({ force = false } = {}) {
    const nextProfile = accountProfile()
    if (!force && project && loadedProfileId === nextProfile.id) {
      render()
      if (isGrapesDriveConnected()) refreshInbox().catch(() => {})
      return
    }

    const generation = ++loadGeneration
    const startingRevision = changeRevision
    const previousProject = project ? structuredClone(project) : null
    if (project) await persistLocal().catch(() => {})
    try {
      const local = await loadLocalProject(localProjectId(nextProfile.id)).catch(() => null)
      let nextProject = local?.data ? normalizeFoodProject(local.data, nextProfile.id) : createEmptyFoodProject(nextProfile)
      let nextDriveFileId = local?.driveFileId || null
      let remoteLoaded = false
      let remoteChecked = false
      if (isGrapesDriveConnected() && !nextProject.syncState?.localDirty) {
        try {
          const files = await listGrapesProjects(MODULE)
          remoteChecked = true
          const candidate = files.find(file => file.id === nextDriveFileId) || files[0]
          if (candidate) {
            const remote = await loadGrapesProject(candidate.id)
            nextProject = normalizeFoodProject(remote.data, nextProfile.id)
            nextProject.syncState = { ...nextProject.syncState, localDirty: false }
            nextDriveFileId = candidate.id
            remoteLoaded = true
          }
        } catch (error) {
          showToast(`A Drive-napló nem tölthető be. A helyi példány maradt meg. ${error.message || ''}`.trim())
        }
      }
      if (!local && !remoteLoaded && remoteChecked && previousProject?.profile?.id === 'local-food-profile' && nextProfile.id !== 'local-food-profile') {
        nextProject = migrateLocalProject(previousProject, nextProfile)
        nextDriveFileId = null
      }
      if (generation !== loadGeneration || (loadedProfileId === nextProfile.id && changeRevision !== startingRevision)) return
      profile = nextProfile
      project = nextProject
      driveFileId = nextDriveFileId
      loadedProfileId = nextProfile.id
      changeRevision = 0
      const legacyHydration = project.diaryEntries.filter(entry => entry.snapshot?.category === 'Folyadék')
      if (legacyHydration.length && onHydrationImport) {
        try {
          onHydrationImport(legacyHydration)
          project.diaryEntries = project.diaryEntries.filter(entry => entry.snapshot?.category !== 'Folyadék')
          project.syncState = { ...project.syncState, localDirty: true }
          changeRevision += 1
        } catch (error) {
          showToast(`A korábbi vízadatok átköltöztetése nem sikerült. ${error?.message || ''}`.trim())
        }
      }
      await persistLocal()
      render()
      if (isGrapesDriveConnected()) {
        if (!remoteLoaded && project.syncState?.localDirty) persistDrive()
        refreshInbox().catch(() => {})
      }
    } catch (error) {
      if (generation === loadGeneration) showToast(`Az ételnapló betöltése nem sikerült. ${error.message || ''}`.trim())
    }
  }

  async function persistLocal(projectValue = project, fileId = driveFileId) {
    if (!projectValue) return
    const data = structuredClone(projectValue)
    await saveLocalProject({ id: localProjectId(data.profile.id), module: MODULE, name: PROJECT_NAME, data, driveFileId: fileId })
  }

  async function persistDrive() {
    if (!project || !isGrapesDriveConnected()) return
    driveRequested = true
    if (driveSaving) return driveSaving
    driveSaving = (async () => {
      while (driveRequested && isGrapesDriveConnected()) {
        driveRequested = false
        const savedRevision = changeRevision
        const snapshot = structuredClone(project)
        snapshot.syncState = { ...snapshot.syncState, localDirty: false }
        try {
          driveFileId = await saveGrapesProject({ module: MODULE, name: PROJECT_NAME, data: snapshot, fileId: driveFileId })
          const changedDuringUpload = changeRevision !== savedRevision
          project.syncState = { ...project.syncState, localDirty: changedDuringUpload }
          if (changedDuringUpload) driveRequested = true
          await persistLocal()
        } catch (error) {
          project.syncState = { ...project.syncState, localDirty: true }
          await persistLocal().catch(() => {})
          showToast(`A Drive-mentés nem sikerült; a változás helyben megmaradt. ${error.message || ''}`.trim())
          break
        }
      }
    })()
    try { await driveSaving } finally { driveSaving = null }
  }

  function scheduleSave() {
    changeRevision += 1
    project.syncState = { ...project.syncState, localDirty: true }
    clearTimeout(saveTimer); clearTimeout(driveTimer)
    saveTimer = setTimeout(() => persistLocal().catch(() => showToast('A helyi mentés nem sikerült.')), 180)
    driveTimer = setTimeout(persistDrive, 1600)
  }

  async function flush({ drive = true } = {}) {
    clearTimeout(saveTimer); clearTimeout(driveTimer)
    await persistLocal()
    if (drive && project?.syncState?.localDirty) await persistDrive()
  }

  function setSheetOpen(sheet, open) {
    if (!sheet) return
    if (open && !root.querySelector('.bottom-sheet.is-open')) sheetReturnFocus = document.activeElement
    sheet.classList.toggle('is-open', open)
    sheet.setAttribute('aria-hidden', String(!open))
    sheet.inert = !open
    if (open) {
      backdrop.classList.add('is-open')
      setTimeout(() => sheet.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus({ preventScroll: true }), 50)
    }
  }

  function selectedEntries() { return entriesForLocalDay(project.diaryEntries, selectedDate, profile.id).filter(entry => entry.snapshot?.category !== 'Folyadék') }
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
    $('[data-food-energy]').textContent = nutrient(totals.energyKcal)
    $('[data-food-energy-target]').textContent = `${number(targets.energyKcal)} kcal`
    const energyPercent = targets.energyKcal ? Math.min(100, (totals.energyKcal || 0) / targets.energyKcal * 100) : 0
    $('[data-food-energy-ring]').style.background = `conic-gradient(var(--accent) 0 ${energyPercent}%, #1d2b38 ${energyPercent}% 100%)`
    const remaining = Math.max(0, (targets.energyKcal || 0) - (totals.energyKcal || 0))
    // A napi cél üzenete csak ismert, pozitív célérték és teljes kalóriaadat mellett lehet sikeres.
    const hasEnergyGoal = Number.isFinite(Number(targets.energyKcal)) && Number(targets.energyKcal) > 0
    const hasCompleteEnergy = entries.length > 0 && totals.energyKcal != null
    const goalReached = hasEnergyGoal && hasCompleteEnergy && totals.energyKcal >= targets.energyKcal
    $('[data-food-message]').textContent = goalReached ? 'Megvan a napi cél!' : !entries.length ? 'Indítsuk jól ezt a napot is!' : 'Jó úton haladsz'
    $('[data-food-remaining]').textContent = totals.energyKcal == null ? 'Néhány ételnél hiányzik a kalóriaadat' : remaining ? `${number(remaining)} kcal maradt mára` : `${number(totals.energyKcal)} kcal naplózva`
    for (const key of ['protein', 'carbohydrate', 'fat']) {
      $(`[data-food-${key}]`).textContent = nutrient(totals[key], 1, ' g')
      setBar(`[data-food-${key}-bar]`, totals[key], targets[key])
    }
    renderMeals(entries)
    renderRecipes()
  }

  function renderMeals(daily) {
    const container = $('[data-food-meals]'); container.replaceChildren()
    for (const [type, label, icon] of MEALS) {
      const entries = daily.filter(item => item.mealType === type)
      const calories = summarizeEntries(entries).energyKcal
      const button = document.createElement('button'); button.type = 'button'; button.className = 'meal'; button.dataset.meal = type
      const names = entries.slice(0, 3).map(item => item.snapshot.name).join(', ')
      const lastTime = entries.length ? new Date(entries.at(-1).occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''
      button.innerHTML = `<span class="meal__icon">${mobileIconSvg(icon)}</span><span><strong>${label}</strong><span>${entries.length ? `${escapeHtml(names)} · ${lastTime}` : 'Még nincs rögzített étel'}</span></span><b>${nutrient(calories)}</b>`
      button.addEventListener('click', () => openMeal(type))
      container.append(button)
    }
  }

  function renderRecipes() {
    const container = $('[data-food-recipes]'); container.replaceChildren()
    const recipes = [...project.recipes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 2)
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
    if (!project.recipes.length) container.innerHTML = '<div class="empty-state">Még nincs saját recepted.</div>'
    for (const recipe of [...project.recipes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'meal'
      button.innerHTML = `<span class="meal__icon">${mobileIconSvg('recipe')}</span><span><strong>${escapeHtml(recipe.name)}</strong><span>${recipe.ingredients.length} hozzávaló · ${escapeHtml(recipe.category)}</span></span><b>›</b>`
      button.addEventListener('click', () => openRecipe(recipe.id)); container.append(button)
    }
    const seen = new Set()
    for (const batch of project.importBatches || []) {
      if (batch.source !== 'yazio' || batch.profileId !== profile.id || batch.status === 'undone') continue
      const archive = batch.sourceArchive || {}
      for (const recipe of archive.recipes || []) {
        const id = String(recipe.recipe_id || '')
        if (!id || seen.has(id) || seen.size >= 400) continue
        seen.add(id)
        const details = document.createElement('details'); details.className = 'sync-status'
        const summary = document.createElement('summary'); summary.textContent = `${recipe.name || 'Névtelen recept'} · YAZIO · csak olvasható`
        details.append(summary)
        for (const ingredient of (archive.recipe_ingredients || []).filter(item => String(item.recipe_id) === id)) {
          const product = (archive.products || []).find(item => String(item.product_id) === String(ingredient.product_id))
          const line = document.createElement('p'); line.textContent = `${product?.name || ingredient.name || 'Ismeretlen hozzávaló'} · ${ingredient.amount ?? '—'} ${ingredient.base_unit || ''}`; details.append(line)
        }
        for (const instruction of (archive.recipe_instructions || []).filter(item => String(item.recipe_id) === id)) {
          const line = document.createElement('p'); line.textContent = instruction.text || ''; details.append(line)
        }
        container.append(details)
      }
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

  function openRecipeEditor(id = '') {
    closeSheets()
    const recipe = project.recipes.find(item => item.id === id)
    editingRecipeId = recipe?.id || ''
    recipeIngredients = recipe ? recipe.ingredients.map(item => ({ ...item })) : []
    $('[data-food-recipe-editor-title]').textContent = recipe ? 'Recept szerkesztése' : 'Új recept'
    $('[data-food-recipe-name-input]').value = recipe?.name || ''
    $('[data-food-recipe-category-input]').value = recipe?.category || 'Saját recept'
    $('[data-food-recipe-instructions-input]').value = recipe?.instructions || ''
    $('[data-food-recipe-weight-input]').value = recipe?.preparedWeight ?? ''
    $('[data-food-recipe-yield-input]').value = recipe?.yieldCount ?? ''
    $('[data-food-recipe-yield-unit]').value = recipe?.yieldUnit || 'serving'
    $('[data-food-recipe-unit-weight]').value = recipe?.averageUnitWeight ?? ''
    $('[data-food-recipe-editor-status]').textContent = ''
    renderRecipeEditorIngredients()
    setSheetOpen($('[data-food-recipe-edit-sheet]'), true)
  }

  function renderRecipeEditorIngredients() {
    const foods = project.customFoods.filter(item => item.kind !== 'recipe')
    const select = $('[data-food-recipe-ingredient-food]'); const selected = select.value
    select.replaceChildren(...foods.map(food => new Option(food.name, food.id)))
    if (foods.some(food => food.id === selected)) select.value = selected
    renderRecipeIngredientUnits()
    const names = new Map(foods.map(food => [food.id, food.name]))
    const container = $('[data-food-recipe-ingredients]'); container.replaceChildren()
    if (!recipeIngredients.length) container.innerHTML = '<div class="food-empty">Adj hozzá legalább egy hozzávalót.</div>'
    for (const ingredient of recipeIngredients) {
      const row = document.createElement('div'); row.className = 'sheet-result'
      row.innerHTML = `<span>${escapeHtml(names.get(ingredient.foodId) || 'Hiányzó étel')} · ${number(ingredient.amount, 2)} ${UNIT_LABELS[ingredient.unit] || ingredient.unit}</span><button class="sheet-result__favorite" type="button" aria-label="Hozzávaló eltávolítása" data-food-recipe-ingredient-delete="${ingredient.id}">×</button>`
      container.append(row)
    }
  }

  function renderRecipeIngredientUnits() {
    const food = project.customFoods.find(item => item.id === $('[data-food-recipe-ingredient-food]').value)
    const units = food ? [{ value: food.baseUnit, label: food.baseUnit }, ...food.servings.map(item => ({ value: item.unit, label: item.name }))] : []
    $('[data-food-recipe-ingredient-unit]').replaceChildren(...units.map(item => new Option(item.label, item.value)))
  }

  function addRecipeIngredient() {
    const food = project.customFoods.find(item => item.id === $('[data-food-recipe-ingredient-food]').value)
    const amount = Number($('[data-food-recipe-ingredient-amount]').value)
    const unit = $('[data-food-recipe-ingredient-unit]').value
    if (!food || !Number.isFinite(amount) || amount <= 0) { $('[data-food-recipe-editor-status]').textContent = 'Válassz ételt és adj meg érvényes mennyiséget.'; return }
    recipeIngredients.push({ id: createFoodId('ingredient'), foodId: food.id, amount, unit, servingId: food.servings.find(item => item.unit === unit)?.id || '' })
    renderRecipeEditorIngredients()
  }

  function saveRecipe() {
    const existing = project.recipes.find(item => item.id === editingRecipeId)
    const optionalNumber = selector => $(selector).value === '' ? null : Number($(selector).value)
    try {
      const now = new Date().toISOString()
      const recipe = normalizeRecipe({
        id: existing?.id || createFoodId('recipe'), foodId: existing?.foodId || createFoodId('food'), ownerProfileId: profile.id,
        variantOfRecipeId: existing?.variantOfRecipeId || '', name: $('[data-food-recipe-name-input]').value,
        category: $('[data-food-recipe-category-input]').value, imageUrl: existing?.imageUrl || '', instructions: $('[data-food-recipe-instructions-input]').value,
        ingredients: recipeIngredients, preparedWeight: optionalNumber('[data-food-recipe-weight-input]'),
        yieldCount: optionalNumber('[data-food-recipe-yield-input]'), yieldUnit: $('[data-food-recipe-yield-unit]').value,
        averageUnitWeight: optionalNumber('[data-food-recipe-unit-weight]'), revision: existing ? existing.revision + 1 : 1,
        createdAt: existing?.createdAt || now, updatedAt: now,
      })
      const calculated = calculateRecipeFood(recipe, project.customFoods.filter(item => item.kind !== 'recipe'))
      project.recipes = existing ? project.recipes.map(item => item.id === recipe.id ? recipe : item) : [...project.recipes, recipe]
      project.customFoods = [...project.customFoods.filter(item => item.id !== recipe.foodId), calculated.food]
      scheduleSave(); closeSheets(); renderOverview(); openRecipe(recipe.id); showToast('A receptet mentettük.')
    } catch (error) { $('[data-food-recipe-editor-status]').textContent = error.message }
  }

  function deleteRecipe() {
    const recipe = project.recipes.find(item => item.id === selectedRecipeId)
    if (!recipe || !window.confirm(`Törlöd ezt a receptet: ${recipe.name}? A korábbi naplóbejegyzések megmaradnak.`)) return
    project.recipes = project.recipes.filter(item => item.id !== recipe.id).map(item => item.variantOfRecipeId === recipe.id ? { ...item, variantOfRecipeId: recipe.variantOfRecipeId || '' } : item)
    project.customFoods = project.customFoods.filter(item => item.id !== recipe.foodId)
    project.favorites = project.favorites.filter(id => id !== recipe.foodId)
    scheduleSave(); openRecipes(); showToast('A receptet töröltük.')
  }

  function renderMealDetail() {
    const container = $('[data-food-entries]'); container.replaceChildren()
    const entries = selectedEntries().filter(item => item.mealType === selectedMeal)
    if (!entries.length) { container.innerHTML = '<div class="empty-state">Ebben az étkezésben még nincs étel. A + gombbal adhatsz hozzá.</div>'; return }
    for (const entry of entries) {
      const card = document.createElement('article'); card.className = 'food-entry-card'
      const time = new Date(entry.occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
      card.innerHTML = `<div class="food-entry-card__head"><div><strong>${escapeHtml(entry.snapshot.name)}</strong><span>${number(entry.amount, 2)} ${UNIT_LABELS[entry.unit] || entry.unit} · ${time}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</span></div><b>${nutrient(entry.snapshot.nutrients.energyKcal, 1, ' kcal')}</b></div><div class="food-entry-card__actions"><button data-entry-edit="${entry.id}">Szerkesztés</button><button data-entry-repeat="${entry.id}">Ismétlés</button><button data-entry-delete="${entry.id}">Törlés</button></div>`
      container.append(card)
    }
  }

  function openAddSheet() {
    if (!selectedMeal) return
    setSheetOpen(addSheet, true)
    $('[data-food-search]').value = ''; startFoodSearch('')
    setTimeout(() => $('[data-food-search]').focus({ preventScroll: true }), 100)
  }

  function closeSheets() {
    setSheetOpen($('[data-food-yazio-sheet]'), false)
    setSheetOpen(addSheet, false)
    setSheetOpen($('[data-food-custom-sheet]'), false)
    setSheetOpen($('[data-food-share-sheet]'), false)
    setSheetOpen($('[data-food-inbox-sheet]'), false)
    setSheetOpen($('[data-food-edit-sheet]'), false)
    setSheetOpen($('[data-food-menu-sheet]'), false)
    setSheetOpen($('[data-food-stats-sheet]'), false)
    setSheetOpen($('[data-food-targets-sheet]'), false)
    setSheetOpen($('[data-food-health-sheet]'), false)
    setSheetOpen($('[data-food-recipe-edit-sheet]'), false)
    backdrop.classList.remove('is-open')
    const returnTarget = sheetReturnFocus; sheetReturnFocus = null
    if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true })
  }

  function openCustomFoodSheet() {
    closeSheets()
    $('[data-food-custom-name]').value = ''
    $('[data-food-custom-category]').value = 'Egyéb'
    $('[data-food-custom-unit]').value = 'g'
    for (const key of ['energy', 'protein', 'carbohydrate', 'fat']) $(`[data-food-custom-${key}]`).value = ''
    $('[data-food-custom-status]').textContent = ''
    setSheetOpen($('[data-food-custom-sheet]'), true)
    setTimeout(() => $('[data-food-custom-name]').focus({ preventScroll: true }), 100)
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
      scheduleSave()
      addFood(food)
    } catch (error) { status.textContent = error.message }
  }

  function renderFoodSearch(query, { favoritesOnly = false, offlineFoods = [], remoteFoods = [], loading = false, remoteError = '' } = {}) {
    const normalized = query.trim().toLocaleLowerCase('hu-HU')
    let localFoods = project.customFoods.filter(item => (!favoritesOnly || project.favorites.includes(item.id)) && (!normalized || `${item.name} ${item.category}`.toLocaleLowerCase('hu-HU').includes(normalized)))
    localFoods = localFoods.sort((a, b) => (project.favorites.includes(b.id) ? 1 : 0) - (project.favorites.includes(a.id) ? 1 : 0)).slice(0, 15)
    const localKeys = new Set(localFoods.map(foodKey))
    const offlineKeys = new Set(offlineFoods.map(foodKey))
    const externalFoods = favoritesOnly ? [] : remoteFoods.filter(food => !localKeys.has(foodKey(food)) && !offlineKeys.has(foodKey(food))).slice(0, 12)
    const container = $('[data-food-search-results]'); container.replaceChildren()
    if (!localFoods.length && !offlineFoods.length && !externalFoods.length) {
      container.innerHTML = `<div class="food-empty">${favoritesOnly ? 'Még nincs kedvencnek jelölt ételed.' : normalized ? 'Nincs találat. A Saját étel gombbal hozhatsz létre újat.' : 'Még nincs saját ételed. A Saját étel gombbal hozhatsz létre egyet.'}</div>`
    }
    for (const food of localFoods) {
      const row = foodSearchRow(food, { favorite: project.favorites.includes(food.id) })
      row.main.addEventListener('click', () => addFood(food))
      row.favorite.addEventListener('click', () => {
        project.favorites = project.favorites.includes(food.id) ? project.favorites.filter(id => id !== food.id) : [...project.favorites, food.id]
        scheduleSave(); renderFoodSearch(query, { favoritesOnly, remoteFoods })
      })
      container.append(row.element)
    }
    for (const food of offlineFoods) {
      const row = foodSearchRow(food, { external: true, offline: true })
      row.main.addEventListener('click', () => addFood(materializeExternalFood(food)))
      container.append(row.element)
    }
    for (const food of externalFoods) {
      const row = foodSearchRow(food, { external: true })
      row.main.addEventListener('click', () => addFood(materializeExternalFood(food)))
      container.append(row.element)
    }
    const status = $('[data-food-search-status]')
    status.textContent = loading ? 'Alapanyagok keresése…' : remoteError
  }

  function foodKey(food) {
    return food.barcode ? `barcode:${food.barcode}` : `${food.source?.type || 'manual'}:${food.source?.id || food.id}`
  }

  function foodSearchRow(food, { favorite = false, external = false, offline = false } = {}) {
    const element = document.createElement('div'); element.className = 'sheet-result'
    const main = document.createElement('button'); main.type = 'button'; main.className = 'sheet-result__main'
    const calories = food.nutrients.energyKcal == null ? 'nincs kalóriaadat' : `${number(food.nutrients.energyKcal, 1)} kcal / 100 ${food.baseUnit}`
    const sourceLabel = offline ? 'Alapadatbázis' : food.source?.type === 'fatsecret' ? 'FatSecret' : 'Open Food Facts'
    main.innerHTML = `<strong>${escapeHtml(food.name)}</strong><span>${calories}${external ? ` · ${sourceLabel}` : ''}</span>`
    const favoriteButton = document.createElement('button'); favoriteButton.type = 'button'; favoriteButton.className = 'sheet-result__favorite'; favoriteButton.hidden = external
    favoriteButton.textContent = favorite ? '★' : '☆'; favoriteButton.setAttribute('aria-label', favorite ? 'Eltávolítás a kedvencekből' : 'Hozzáadás a kedvencekhez')
    element.append(main, favoriteButton)
    return { element, main, favorite: favoriteButton }
  }

  function materializeExternalFood(value) {
    const existing = project.customFoods.find(item => foodKey(item) === foodKey(value))
    if (existing) return existing
    const now = new Date().toISOString()
    const food = normalizeFoodItem({ ...value, id: createFoodId('food'), createdAt: now, updatedAt: now })
    return food
  }

  function startFoodSearch(query) {
    clearTimeout(searchTimer)
    const generation = ++searchGeneration
    const offlineFoods = searchOfflineBasicFoods(query)
    renderFoodSearch(query, { offlineFoods })
    if (query.trim().length < 2) return
    searchTimer = setTimeout(async () => {
      renderFoodSearch(query, { offlineFoods, loading: true })
      let result
      try { result = await searchFoodCatalog(query) }
      catch (error) { if (generation === searchGeneration) renderFoodSearch(query, { offlineFoods, remoteError: error.message }); return }
      if (generation !== searchGeneration || $('[data-food-search]').value !== query) return
      if (result.unavailable) {
        renderFoodSearch(query, { offlineFoods, remoteError: 'Az online termékkereső most nem érhető el; az alapélelmiszerek továbbra is használhatók.' })
        return
      }
      renderFoodSearch(query, { offlineFoods, remoteFoods: result.products, remoteError: result.errors.join(' · ') || (result.products.length ? '' : 'Nincs több online találat.') })
    }, 1100)
  }

  async function lookupBarcode(code) {
    const normalized = String(code || '').replace(/\D/g, '')
    if (!/^\d{7,14}$/.test(normalized)) throw new Error('A vonalkód 7–14 számjegyből állhat.')
    try { return await lookupOpenFoodFactsProduct(normalized) }
    catch (openFoodFactsError) {
      try { return await lookupFatSecretProduct(normalized) }
      catch { throw openFoodFactsError }
    }
  }

  async function addBarcode(code) {
    const status = $('[data-food-search-status]'); status.textContent = 'Termék keresése…'
    try {
      const found = await lookupBarcode(code)
      addFood(materializeExternalFood(found))
    } catch (error) { status.textContent = error.message }
  }

  function requestBarcode() {
    const code = window.prompt('Írd be a termék 7–14 számjegyű vonalkódját:')
    if (code !== null) addBarcode(code)
  }

  async function barcodeImageSource(file) {
    if ('createImageBitmap' in window) return { source: await createImageBitmap(file), release(source) { source.close?.() } }
    const url = URL.createObjectURL(file); const image = new Image(); image.src = url; await image.decode()
    return { source: image, release() { URL.revokeObjectURL(url) } }
  }

  async function selectBarcodePhoto(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
    if (!file) return
    if (!('BarcodeDetector' in window)) { $('[data-food-search-status]').textContent = 'A fotós vonalkódolvasást ez a telefon nem támogatja; add meg kézzel a kódot.'; return }
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) { $('[data-food-search-status]').textContent = 'Legfeljebb 12 MB-os képet válassz.'; return }
    let image
    try {
      $('[data-food-search-status]').textContent = 'Vonalkód keresése a fotón…'
      image = await barcodeImageSource(file)
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
      const codes = await detector.detect(image.source)
      const code = String(codes[0]?.rawValue || '').replace(/\D/g, '')
      await addBarcode(code)
    } catch (error) { $('[data-food-search-status]').textContent = error.message || 'A vonalkód nem olvasható.' }
    finally { image?.release(image.source) }
  }

  function addFood(food) {
    activeEditId = ''
    closeSheets()
    pendingAddFood = food
    const now = new Date()
    $('[data-food-edit-title]').textContent = `${food.name} hozzáadása`
    $('[data-food-edit-amount]').value = 100
    const units = [{ value: food.baseUnit, label: food.baseUnit }, ...food.servings.map(item => ({ value: item.unit, label: item.name }))]
    const unit = $('[data-food-edit-unit]'); unit.replaceChildren(...units.map(item => new Option(item.label, item.value))); unit.value = food.baseUnit
    $('[data-food-edit-time]').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    $('[data-food-edit-note]').value = ''
    $('[data-food-edit-status]').textContent = ''
    $('[data-food-edit-save]').textContent = 'Hozzáadás az étkezéshez'
    $('[data-food-edit-actions]').hidden = true
    setSheetOpen($('[data-food-edit-sheet]'), true)
  }

  function deleteEntry(id) {
    if (!window.confirm('Törlöd ezt a naplóbejegyzést?')) return
    project.diaryEntries = project.diaryEntries.filter(item => item.id !== id)
    scheduleSave(); renderMealDetail(); showToast('A bejegyzés törölve.')
  }

  function openEntryEditor(id) {
    const entry = project.diaryEntries.find(item => item.id === id); if (!entry) return
    closeSheets(); activeEditId = id; pendingAddFood = null
    $('[data-food-edit-title]').textContent = entry.snapshot.name
    $('[data-food-edit-amount]').value = entry.amount
    const food = project.customFoods.find(item => item.id === entry.snapshot.foodId)
    const units = food ? [{ value: food.baseUnit, label: food.baseUnit }, ...food.servings.map(item => ({ value: item.unit, label: item.name }))] : [{ value: entry.unit, label: UNIT_LABELS[entry.unit] || entry.unit }]
    const unit = $('[data-food-edit-unit]'); unit.replaceChildren(...units.map(item => new Option(item.label, item.value))); unit.value = entry.unit
    $('[data-food-edit-time]').value = new Date(entry.occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    $('[data-food-edit-note]').value = entry.note
    $('[data-food-edit-status]').textContent = ''
    $('[data-food-edit-save]').textContent = 'Változások mentése'
    $('[data-food-edit-actions]').hidden = false
    setSheetOpen($('[data-food-edit-sheet]'), true)
  }

  function saveEntryEdit() {
    if (pendingAddFood) {
      try {
        const food = pendingAddFood
        const time = $('[data-food-edit-time]').value || '12:00'
        const unit = $('[data-food-edit-unit]').value
        const entry = normalizeDiaryEntry({
          id: createFoodId('entry'), profileId: profile.id, mealType: selectedMeal,
          amount: $('[data-food-edit-amount]').value, unit,
          servingId: food.servings.find(item => item.unit === unit)?.id || '',
          note: $('[data-food-edit-note]').value,
          occurredAt: new Date(`${selectedDate}T${time}:00`).toISOString(), createdAt: new Date().toISOString(),
        }, food)
        if (!project.customFoods.some(item => item.id === food.id)) project.customFoods.push(food)
        project.diaryEntries.push(entry)
        project.recentFoods = [food.id, ...project.recentFoods.filter(id => id !== food.id)].slice(0, 50)
        scheduleSave(); closeSheets(); renderMealDetail(); showToast(`${food.name} hozzáadva.`)
      } catch (error) { $('[data-food-edit-status]').textContent = error.message }
      return
    }
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
    project.diaryEntries.push(normalizeDiaryEntry({ ...entry, externalKey: '', origin: undefined, id: createFoodId('entry'), occurredAt: new Date(`${selectedDate}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
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
    setSheetOpen(shareSheet, true)
  }

  function openFoodMenu() {
    closeSheets(); setSheetOpen($('[data-food-menu-sheet]'), true)
  }

  function openStats() {
    closeSheets()
    const days = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() - offset)
      const key = localDate(date); const totals = summarizeEntries(entriesForLocalDay(project.diaryEntries, key, profile.id))
      days.push({ key, totals })
    }
    const knownEnergy = days.map(day => day.totals.energyKcal).filter(value => value !== null)
    const average = knownEnergy.length ? knownEnergy.reduce((sum, value) => sum + value, 0) / knownEnergy.length : null
    $('[data-food-stats-content]').innerHTML = `<div class="food-entry-card"><strong>7 napos átlag</strong><span>${nutrient(average, 0, ' kcal / nap')}</span></div>${days.map(day => `<div class="sheet-result"><strong>${new Date(`${day.key}T12:00:00`).toLocaleDateString('hu-HU', { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span>${nutrient(day.totals.energyKcal, 0, ' kcal')}</span></div>`).join('')}`
    setSheetOpen($('[data-food-stats-sheet]'), true)
  }

  function openTargets() {
    closeSheets()
    const targets = currentTargets(project, selectedDate)
    $('[data-food-target-energy]').value = targets.energyKcal ?? ''
    $('[data-food-target-protein]').value = targets.protein ?? ''
    $('[data-food-target-carbohydrate]').value = targets.carbohydrate ?? ''
    $('[data-food-target-fat]').value = targets.fat ?? ''
    $('[data-food-target-status]').textContent = ''
    setSheetOpen($('[data-food-targets-sheet]'), true)
  }

  function saveTargets() {
    try {
      const values = normalizeTargets({
        energyKcal: $('[data-food-target-energy]').value,
        protein: $('[data-food-target-protein]').value,
        carbohydrate: $('[data-food-target-carbohydrate]').value,
        fat: $('[data-food-target-fat]').value,
      })
      const existing = project.targets.find(item => item.effectiveFrom === selectedDate)
      const target = { id: existing?.id || createFoodId('target'), effectiveFrom: selectedDate, values }
      project.targets = existing ? project.targets.map(item => item.id === existing.id ? target : item) : [...project.targets, target]
      scheduleSave(); closeSheets(); renderOverview(); showToast('A napi célokat mentettük.')
    } catch (error) { $('[data-food-target-status]').textContent = error.message }
  }

  function exportBackup() {
    const blob = new Blob([foodBackupToJson(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = `grapes-etelnaplo-${selectedDate}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000); closeSheets(); showToast('A biztonsági mentés elkészült.')
  }

  async function importBackup(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
    if (!file || !window.confirm('A mentés visszaállítása lecseréli a jelenlegi ételnaplót. Folytatod?')) return
    try {
      const restored = foodBackupFromJson(await file.text(), profile.id)
      project = restored; project.syncState = { ...project.syncState, localDirty: true }; changeRevision += 1
      await flush(); render(); showToast('A biztonsági mentést visszaállítottuk.')
    } catch (error) { showToast(error.message) }
  }

  function healthRecordLabel(item) {
    if (item.status === 'invalid') return `Hibás rekord #${item.index + 1}`
    const date = new Date(item.entry.occurredAt).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
    const amount = item.record.type === 'hydration' ? `${number(item.entry.amount)} ml` : nutrient(item.entry.snapshot.nutrients.energyKcal, 1, ' kcal')
    return `${item.entry.snapshot.name} · ${date} · ${amount}`
  }

  function renderHealthPreview() {
    const preview = pendingHealthImport
    if (!preview) return
    $('[data-food-health-summary]').textContent = `Export: ${new Date(preview.generatedAt).toLocaleString('hu-HU')} · ${preview.counts.ready} új · ${preview.counts.duplicate} már importálva · ${preview.counts.invalid} hibás`
    const container = $('[data-food-health-records]'); container.replaceChildren()
    for (const item of preview.records) {
      const row = document.createElement('label'); row.className = 'sheet-result'
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(item.index); checkbox.checked = item.status === 'ready'; checkbox.disabled = item.status !== 'ready'; checkbox.dataset.foodHealthRecord = ''
      const content = document.createElement('span'); content.textContent = `${healthRecordLabel(item)}${item.status === 'duplicate' ? ' · már importálva' : item.status === 'invalid' ? ` · ${item.error}` : ''}`
      row.append(checkbox, content); container.append(row)
    }
    $('[data-food-health-confirm]').disabled = preview.counts.ready === 0
    setSheetOpen($('[data-food-health-sheet]'), true)
  }

  async function prepareHealthImport(source) {
    try {
      const hydrationKeys = typeof getHydrationExternalKeys === 'function' ? getHydrationExternalKeys() : []
      const existingEntries = [
        ...project.diaryEntries.filter(entry => entry.snapshot?.category !== 'Folyadék'),
        ...hydrationKeys.map(externalKey => ({ externalKey })),
      ]
      pendingHealthImport = prepareHealthBridgeImport(source, { profileId: profile.id, existingEntries })
      if (!pendingHealthImport.records.length) throw new Error('Nem érkezett étel- vagy vízadat. Ellenőrizd a Health Connect engedélyeit és a Samsung Health adatmegosztását.')
      closeSheets(); renderHealthPreview()
      return pendingHealthImport
    } catch (error) { pendingHealthImport = null; showToast(error.message); throw error }
  }

  async function openHealthImport({ provider = 'Health Connect', samsung = false, fromDate = selectedDate } = {}) {
    closeSheets()
    if (!isGrapesAndroidApp()) return $('[data-food-health-input]').click()
    showToast(`${provider}-adatok olvasása…`)
    try {
      return await prepareHealthImport(await (samsung ? readAndroidSamsungHealthExport(fromDate) : readAndroidHealthExport(fromDate)))
    } catch (error) { showToast(error.message); throw error }
  }

  async function openSamsungImport({ fromDate = selectedDate } = {}) {
    try {
      return await openHealthImport({ provider: 'Samsung Health', samsung: true, fromDate })
    } catch (error) {
      // The direct Samsung SDK is optional in the distributable APK. Samsung
      // Health can still share the same records through Health Connect.
      if (!/Samsung Health Data SDK|partner hozzáférés/i.test(String(error?.message || ''))) throw error
      showToast('Közvetlen Samsung-kapcsolat nincs; Health Connectből olvasunk.')
      return openHealthImport({ provider: 'Health Connect', fromDate })
    }
  }

  async function selectHealthImport(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
    if (file) await prepareHealthImport(await file.text())
  }

  function applyHealthImport() {
    if (!pendingHealthImport) return
    const selected = [...root.querySelectorAll('[data-food-health-record]:checked')].map(input => Number(input.value))
    const hydrationKeys = typeof getHydrationExternalKeys === 'function' ? getHydrationExternalKeys() : []
    const existingKeys = new Set([...project.diaryEntries.map(entry => entry.externalKey), ...hydrationKeys].filter(Boolean))
    const entries = healthImportEntries(pendingHealthImport, selected).filter(entry => !existingKeys.has(entry.externalKey))
    if (!entries.length) { $('[data-food-health-status]').textContent = 'Nincs új, kijelölt Health-rekord.'; return }
    const hydration = entries.filter(entry => entry.snapshot?.category === 'Folyadék')
    const nutrition = entries.filter(entry => entry.snapshot?.category !== 'Folyadék')
    let importedHydration = 0
    try {
      if (hydration.length) {
        if (!onHydrationImport) throw new Error('A Víz modul nem érhető el az importhoz.')
        importedHydration = onHydrationImport(hydration)
      }
    } catch (error) {
      $('[data-food-health-status]').textContent = error?.message || 'A vízadatok mentése nem sikerült.'
      return
    }
    if (nutrition.length) project.diaryEntries = [...project.diaryEntries, ...nutrition]
    const imported = nutrition.length + importedHydration
    if (!imported) { $('[data-food-health-status]').textContent = 'Nincs új, kijelölt Health-rekord.'; return }
    selectedDate = localDate(new Date([...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0].occurredAt))
    pendingHealthImport = null
    if (nutrition.length) scheduleSave()
    closeSheets(); render(); showToast(`${imported} Health-rekord importálva.`)
  }

  async function importYazioCsv(source) {
    await load()
    const preview = prepareYazioCsvImport(source, { profileId: profile.id, existingEntries: project.diaryEntries })
    const entries = yazioImportEntries(preview)
    if (!entries.length) return { ...preview.counts, imported: 0 }
    if (!window.confirm(`${entries.length} új Yazio-étkezést importálunk az Ételnaplóba. Folytatod?`)) return { ...preview.counts, imported: 0, cancelled: true }
    project.diaryEntries = [...project.diaryEntries, ...entries]
    selectedDate = localDate(new Date([...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0].occurredAt))
    scheduleSave(); render()
    return { ...preview.counts, imported: entries.length }
  }

  async function importYazio(source) {
    if (yazio.isBusy()) throw new Error('Az előző import még folyamatban van.')
    if (!source.trimStart().startsWith('{')) return importYazioCsv(source)
    await load(); await flush()
    return yazio.prepare(source)
  }

  async function undoYazio() { if (yazio.isBusy()) return; await load(); await flush(); return yazio.undo() }

  function handleMenuAction(action) {
    if (action === 'stats') return openStats()
    if (action === 'targets') return openTargets()
    if (action === 'backup-export') return exportBackup()
    if (action === 'backup-import') { closeSheets(); return $('[data-food-backup-input]').click() }
    if (action === 'health') return openHealthImport()
  }

  async function submitShare() {
    const email = $('[data-food-share-email]').value
    try {
      const result = selectedRecipeId
        ? await sendRecipe?.({ project, recipeId: selectedRecipeId, email })
        : await sendMeal?.({ project, date: selectedDate, mealType: selectedMeal, email })
      if (!result) throw new Error('A megosztási postafiók telepítése még nincs kész.')
      rememberSharingContact(project, email, result?.recipientName || '')
      scheduleSave(); closeSheets(); showToast(selectedRecipeId ? 'A receptet elküldtük jóváhagyásra.' : 'Az étkezést elküldtük jóváhagyásra.')
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
    const sheet = $('[data-food-inbox-sheet]'); setSheetOpen(sheet, true)
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

  async function openLegacyAfterSave(module, view, itemId = '', action = '') {
    await flush()
    openLegacy(module, view, itemId, action)
  }

  function handleBack() {
    if (root.querySelector('.bottom-sheet.is-open')) { closeSheets(); return true }
    if (selectedMeal) { closeMeal(); return true }
    if (selectedRecipeId) { openRecipes(); return true }
    if (!$('[data-food-recipes-view]').hidden) { showOverview(); return true }
    return false
  }

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
    $('[data-food-recipe-edit]').addEventListener('click', () => openRecipeEditor(selectedRecipeId))
    $('[data-food-recipe-delete]').addEventListener('click', deleteRecipe)
    $('[data-food-recipes-new]').addEventListener('click', () => openRecipeEditor())
    $('[data-food-overview-new-recipe]').addEventListener('click', () => openRecipeEditor())
    $('[data-food-share]').addEventListener('click', openShareSheet)
    $('[data-food-share-send]').addEventListener('click', submitShare)
    $('[data-food-summary-menu]').addEventListener('click', openFoodMenu)
    $('[data-food-search]').addEventListener('input', event => startFoodSearch(event.currentTarget.value))
    $('[data-food-barcode-photo]').addEventListener('change', selectBarcodePhoto)
    $('[data-food-open-recipes]').addEventListener('click', openRecipes)
    $('[data-food-inbox]').addEventListener('click', () => refreshInbox({ open: true }))
    $('[data-food-inbox-accept]').addEventListener('click', acceptInboxItem)
    $('[data-food-inbox-reject]').addEventListener('click', rejectInboxItem)
    $('[data-food-edit-save]').addEventListener('click', saveEntryEdit)
    $('[data-food-edit-repeat]').addEventListener('click', () => { const id = activeEditId; closeSheets(); repeatEntry(id) })
    $('[data-food-edit-delete]').addEventListener('click', () => { const id = activeEditId; closeSheets(); deleteEntry(id) })
    $('[data-food-custom-save]').addEventListener('click', saveCustomFood)
    $('[data-food-target-save]').addEventListener('click', saveTargets)
    $('[data-food-backup-input]').addEventListener('change', importBackup)
    $('[data-food-health-input]').addEventListener('change', selectHealthImport)
    $('[data-food-health-confirm]').addEventListener('click', applyHealthImport)
    $('[data-food-recipe-ingredient-food]').addEventListener('change', renderRecipeIngredientUnits)
    $('[data-food-recipe-ingredient-add]').addEventListener('click', addRecipeIngredient)
    $('[data-food-recipe-editor-save]').addEventListener('click', saveRecipe)
    fab.addEventListener('click', openAddSheet)
    backdrop.addEventListener('click', closeSheets)
    root.addEventListener('click', event => {
      const remove = event.target.closest('[data-entry-delete]'); if (remove) return deleteEntry(remove.dataset.entryDelete)
      const repeat = event.target.closest('[data-entry-repeat]'); if (repeat) return repeatEntry(repeat.dataset.entryRepeat)
      const edit = event.target.closest('[data-entry-edit]'); if (edit) return openEntryEditor(edit.dataset.entryEdit)
      const ingredientDelete = event.target.closest('[data-food-recipe-ingredient-delete]')
      if (ingredientDelete) { recipeIngredients = recipeIngredients.filter(item => item.id !== ingredientDelete.dataset.foodRecipeIngredientDelete); renderRecipeEditorIngredients(); return }
      const quick = event.target.closest('[data-food-quick]')
      if (quick?.dataset.foodQuick === 'custom') return openCustomFoodSheet()
      if (quick?.dataset.foodQuick === 'favorites') {
        $('[data-food-search]').value = ''
        renderFoodSearch('', { favoritesOnly: true })
        return
      }
      if (quick?.dataset.foodQuick === 'barcode') return requestBarcode()
      if (quick?.dataset.foodQuick === 'photo') return $('[data-food-barcode-photo]').click()
      const menu = event.target.closest('[data-food-menu]'); if (menu) return handleMenuAction(menu.dataset.foodMenu)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush().catch(() => {})
      else if (isGrapesDriveConnected()) refreshInbox().catch(() => {})
    })
  }

  bind()
  return { load, render, closeMeal, handleBack, isDetailOpen: () => Boolean(selectedMeal), flush, openHealthImport, openSamsungImport, importYazioCsv, importYazio, undoYazio }
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
