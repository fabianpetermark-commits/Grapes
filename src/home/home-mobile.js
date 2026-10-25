import { createHomeStore } from './home-store.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, quantity, UNITS } from './home-data.js'
import { homeDateHints, homeRecipeHints } from './home-advisor.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
const statusNames = { planned: 'Tervezett', checked: 'Elintézve', deferred: 'Később' }
const units = Object.keys(UNITS).map(unit => `<option value="${unit}">${unit}</option>`).join('')
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createHomeMobile(root, storage, { freshOwnerMode = false, openFoodRecipe = null } = {}) {
  let store = null
  let loadEpoch = 0
  let advice = { status: 'idle', project: null }
  let tab = 'inventory'
  let filter = 'all'
  let search = ''
  let editing = null
  let splitId = null
  let formOperationId = null
  let splitOperationId = null
  let cooking = null
  let cookingBusy = false
  let lastEventId = null
  let message = ''
  let error = ''
  root.innerHTML = `
    <div class="household-head"><p class="eyebrow">Home / Háztartás</p><h1>Mi van otthon?</h1><p>${freshOwnerMode ? 'Saját Grapes TEST-fiók · csak helyben' : 'Ezen az eszközön tárolva · nincs családi szinkron'}</p></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-tabs" data-household-tabs role="tablist" aria-label="Háztartás nézetei"><button type="button" data-household-tab="inventory" role="tab">Készlet</button><button type="button" data-household-tab="shopping" role="tab">Bevásárlólista</button>${freshOwnerMode ? '<button type="button" data-household-tab="advice" role="tab">Mit főzzünk?</button>' : ''}</div>
    <section data-household-inventory><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"><button type="button" data-household-add="inventory">+ Élelmiszer</button></div><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div><div data-household-lots></div>${freshOwnerMode ? '<h2 class="household-section-title">Elkészített ételek</h2><div data-household-prepared></div>' : ''}</section>
    <section data-household-shopping hidden><div class="household-toolbar"><p>Bevásárlási tervek. A kipipálás nem növeli a készletet.</p><button type="button" data-household-add="shopping">+ Listaelem</button></div><div data-household-items></div></section>
    ${freshOwnerMode ? '<section data-household-advice hidden><p class="household-recipe-notice">Csak olvasó javaslatok a saját Grapes TEST Food-receptek és Home-készlet alapján. A névegyezés nem bizonyítja, hogy egy alapanyag megfelelő, elegendő vagy biztonságos.</p><div data-household-date-hints></div><div data-household-recipe-hints aria-live="polite"></div></section>' : '' }
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>
    <form class="household-form" data-household-form hidden><h2 data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><label data-household-location-label>Tárolás<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form" data-household-split hidden><h2>Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>${freshOwnerMode ? '<form class="household-form" data-household-cooking hidden><h2>Főzés tényleges rögzítése</h2><p>A recept csak javaslat. A valóban felhasznált készlettételeket és mennyiségeket kézzel válaszd ki. Előnézet és megerősítés előtt semmilyen készlet nem változik.</p><label>Készétel neve<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Elkészült adagok<input name="portions" type="number" min="1" step="1" required></label><label>Tárolóhely<select name="storageLocation" required><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label></div><div data-household-cooking-rows></div><button type="button" data-household-cooking-add>+ Felhasznált tétel</button><p data-household-cooking-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elkészítettem · megerősítés</button></div></form>' : ''}`

  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  const cookingForm = freshOwnerMode ? $('[data-household-cooking]') : null
  const state = () => store.getState()
  const alert = (text, isError = false) => { message = isError ? '' : text; error = isError ? text : ''; const node = $('[data-household-alert]'); node.hidden = !text; node.textContent = text; node.classList.toggle('is-error', isError) }
  const run = async (type, payload, eventId, source = {}) => {
    if (!store) return null
    const current = store
    const epoch = loadEpoch
    try {
      const result = await current.dispatch({ type, payload,
        ...(eventId ? { eventId } : {}), ...source })
      if (epoch !== loadEpoch || current !== store) return null
      if (!result.duplicate) lastEventId = result.event.eventId
      alert(result.duplicate ? 'A művelet már végrehajtva.' :
        (freshOwnerMode ? 'Mentve a saját Home-fióktárhelyre.' : 'Mentve ezen az eszközön.'))
      render()
      return result
    } catch (err) {
      if (epoch !== loadEpoch || current !== store) return null
      if (freshOwnerMode) {
        try { await current.assertOwner() }
        catch {
          clearFreshHome()
          root.inert = false
          root.style.visibility = ''
          alert('A Home mentése vagy fiókellenőrzése megszakadt. Nyisd meg újra a modult.', true)
          return null
        }
      }
      alert(err.message, true)
      return null
    }
  }
  const closeForms = () => { form.hidden = true; splitForm.hidden = true; if (cookingForm) cookingForm.hidden = true; editing = null; splitId = null; cooking = null; formOperationId = null; splitOperationId = null }
  function clearFreshHome() {
    if (!freshOwnerMode) return
    loadEpoch++
    store = null
    lastEventId = null
    advice = { status: 'idle', project: null }
    cookingBusy = false
    $('[data-household-date-hints]')?.replaceChildren()
    $('[data-household-recipe-hints]')?.replaceChildren()
    $('[data-household-advice]')?.setAttribute('hidden', '')
    message = ''
    error = ''
    tab = 'inventory'
    filter = 'all'
    search = ''
    $('[data-household-search]').value = ''
    closeForms()
    $('[data-household-lots]').replaceChildren()
    $('[data-household-items]').replaceChildren()
    $('[data-household-prepared]')?.replaceChildren()
    $('[data-household-cooking-rows]')?.replaceChildren()
    $('[data-household-tabs]').hidden = true
    $('[data-household-inventory]').hidden = true
    $('[data-household-shopping]').hidden = true
    $('[data-household-undo]').hidden = true
    root.inert = true
    root.style.visibility = 'hidden'
  }
  function render() {
    if (!store) return
    const current = state()
    $('[data-household-inventory]').hidden = tab !== 'inventory'
    $('[data-household-shopping]').hidden = tab !== 'shopping'
    if (freshOwnerMode) $('[data-household-advice]').hidden = tab !== 'advice'
    root.querySelectorAll('[data-household-tab]').forEach(node => { node.setAttribute('aria-selected', String(node.dataset.householdTab === tab)); node.classList.toggle('is-active', node.dataset.householdTab === tab) })
    root.querySelectorAll('[data-household-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.householdFilter === filter))
    const lots = current.inventory.filter(lot => (filter === 'all' || lot.storageLocation === filter) && lot.name.toLocaleLowerCase('hu-HU').includes(search))
    $('[data-household-lots]').innerHTML = lots.length ? lots.map(lot => `<article class="household-card"><div><strong>${escape(lot.name)}</strong><p>${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]} · kézi, megerősített ${escape(lot.observedAt.slice(0, 10))}</p><small>${escape(expiryLabel(lot))}</small></div><div class="household-card-actions"><button type="button" data-household-edit="${escape(lot.id)}">Szerkesztés</button><button type="button" data-household-split-id="${escape(lot.id)}">Elosztás</button><button type="button" data-household-delete="${escape(lot.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">Itt még nincs ismert élelmiszer. Adj hozzá egy megerősített mennyiséget.</div>'
    if (freshOwnerMode) $('[data-household-prepared]').innerHTML = current.prepared?.length
      ? current.prepared.map(lot => `<article class="household-card"><strong>${escape(lot.name)}</strong><p>${escape(lot.portionsRemaining)} ${lot.portionUnit === 'slice' ? 'szelet' : lot.portionUnit === 'piece' ? 'darab' : 'adag'} · ${placeNames[lot.storageLocation]} · kézzel igazolt főzés</p><small>A Food-naplóhoz még nincs hozzárendelve; a nyers alapanyag nem vonódik le újra.</small></article>`).join('')
      : '<div class="household-empty">Még nincs megerősített készétel.</div>'
    $('[data-household-items]').innerHTML = current.shopping.length ? current.shopping.map(item => `<article class="household-card"><div><strong>${escape(item.name)}</strong><p>${escape(displayQuantity(item))} · ${statusNames[item.status]} · tervezett, nem készlet</p></div><div class="household-card-actions"><button type="button" data-household-check="${escape(item.id)}">${item.status === 'checked' ? 'Újra listára' : 'Elintézve'}</button><button type="button" data-household-defer="${escape(item.id)}">Később</button><button type="button" data-household-edit-shopping="${escape(item.id)}">Szerkesztés</button><button type="button" data-household-delete-shopping="${escape(item.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">A bevásárlólista üres. Itt tervezhetsz vásárlást készletváltozás nélkül.</div>'
    if (freshOwnerMode) {
      const dateHints = homeDateHints(current.inventory)
      $('[data-household-date-hints]').innerHTML = dateHints.length
        ? `<h2 class="household-section-title">Címkedátum ellenőrzése</h2>${dateHints.map(hint => `<article class="household-card"><strong>${escape(hint.name)}</strong><p>${escape(hint.date)} · ${escape(hint.message)}</p><small>Utoljára megerősítve: ${escape(hint.observedAt?.slice(0,10) || 'ismeretlen')}</small></article>`).join('')}`
        : '<div class="household-empty">Nincs olyan ismert készlettétel, amelynek a megadott címkedátuma elérkezett. Ez nem igazolja az élelmiszerek frissességét.</div>'
      const suggestions = $('[data-household-recipe-hints]')
      if (advice.status === 'loading') suggestions.innerHTML = '<div class="household-empty">Saját Food-receptek biztonságos olvasása…</div>'
      else if (advice.status === 'error') suggestions.innerHTML = '<div class="household-empty" role="status">A saját Food-receptek most nem olvashatók. A Home készlete változatlan.</div>'
      else if (advice.status !== 'ready' || !advice.project?.recipes?.length) suggestions.innerHTML = '<div class="household-empty">Nincs elérhető saját Food-recept ebben a fiókban.</div>'
      else {
        const candidates = homeRecipeHints(current.inventory, advice.project).slice(0, 8)
        suggestions.innerHTML = `<h2 class="household-section-title">Receptötletek · ellenőrizendő</h2>${candidates.map(item => {
          const yieldText = item.yieldCount == null ? 'Adag: ismeretlen' : `${escape(item.yieldCount)} ${item.yieldUnit === 'slice' ? 'szelet' : item.yieldUnit === 'piece' ? 'darab' : 'adag'}`
          return `<article class="household-card"><strong>${escape(item.name)}</strong><p>${yieldText} · Ellenőrizendő · ${item.matched.length} lehetséges névegyezés</p><details><summary>Miért ezt ajánlom?</summary><p>${escape(item.reason)}</p>${item.unresolved.length ? `<small>Nem beazonosított: ${escape(item.unresolved.join(', '))}</small>` : ''}</details><div class="household-card-actions"><button type="button" data-household-open-food-recipe="${escape(item.id)}">Recept megtekintése a Foodban</button><button type="button" data-household-cook="${escape(item.id)}">Főzés rögzítése</button></div></article>`
        }).join('')}`
      }
    }
    $('[data-household-undo]').hidden = !lastEventId
  }
  function openForm(kind, id = null) {
    closeForms()
    editing = { kind, id }
    formOperationId = operationId()
    form.reset()
    const record = id && state()[kind === 'inventory' ? 'inventory' : 'shopping'].find(row => row.id === id)
    if (record) {
      form.elements.name.value = record.name
      form.elements.quantity.value = record.quantityBase == null ? '' : String(record.quantityBase / UNITS[record.displayUnit][1])
      if (record.displayUnit) form.elements.unit.value = record.displayUnit
      if (kind === 'inventory') { form.elements.storageLocation.value = record.storageLocation; form.elements.expiryDate.value = record.expiryDate || ''; form.elements.expiryKind.value = record.expiryKind || 'bestBefore' }
    }
    $('[data-household-form-title]').textContent = `${id ? 'Tétel szerkesztése' : 'Új tétel'} · ${kind === 'inventory' ? 'készlet' : 'bevásárlólista'}`
    $('[data-household-location-label]').hidden = kind !== 'inventory'
    $('[data-household-expiry]').hidden = kind !== 'inventory'
    form.elements.quantity.required = kind === 'inventory'
    form.hidden = false
    form.scrollIntoView({ block: 'nearest' })
    form.elements.name.focus()
  }
  function previewSplit() {
    const lot = state().inventory.find(row => row.id === splitId)
    if (!lot) return
    try {
      const part = splitPreview(lot, splitForm.elements.fridgeQuantity.value, splitForm.elements.unit.value)
      $('[data-household-split-preview]').textContent = `Előnézet: ${part.fridgeBase} ${lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit} hűtő · ${part.freezerBase} ${lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit} fagyasztó. Mentés csak megerősítés után.`
    } catch (err) { $('[data-household-split-preview]').textContent = err.message }
  }
  function appendCookingRow() {
    if (!cookingForm || !cooking) return
    const available = state().inventory.filter(lot => lot.quantityBase > 0)
    const select = available.map(lot => `<option value="${escape(lot.id)}">${escape(lot.name)} · ${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]}</option>`).join("")
    const row = document.createElement("div")
    row.className = "household-cooking-row"
    row.innerHTML = `<label>Valóban felhasznált tétel<select name="lotId" required>${select}</select></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label><label>Egység<select name="unit">${units}</select></label></div><button type="button" data-household-cooking-remove>Eltávolítás</button>`
    cookingForm.querySelector("[data-household-cooking-rows]").append(row)
    setCookingUnit(row)
    previewCooking()
  }
  function setCookingUnit(row) {
    const lot = state().inventory.find(lot => lot.id === row.querySelector("[name=lotId]").value)
    if (!lot) return
    const unitSelect = row.querySelector("[name=unit]")
    for (const option of unitSelect.options) option.disabled = UNITS[option.value][0] !== lot.dimension
    unitSelect.value = lot.displayUnit
  }
  function cookingPayload() {
    return { name: cookingForm.elements.name.value, portions: cookingForm.elements.portions.value, storageLocation: cookingForm.elements.storageLocation.value, recipeRef: cooking.recipeId, portionUnit: cooking.yieldUnit,
      consumed: [...cookingForm.querySelectorAll(".household-cooking-row")].map(row => ({ id: row.querySelector("[name=lotId]").value, quantity: row.querySelector("[name=quantity]").value, unit: row.querySelector("[name=unit]").value })) }
  }
  function previewCooking() {
    if (!cookingForm || cookingForm.hidden || !cooking) return
    try {
      const payload = cookingPayload()
      if (!payload.consumed.length) throw new Error("Legalább egy felhasznált tétel szükséges.")
      const seen = new Set()
      const messages = payload.consumed.map(item => {
        const lot = state().inventory.find(lot => lot.id === item.id)
        if (!lot || seen.has(item.id)) throw new Error("Minden készlettételt csak egyszer válassz ki.")
        seen.add(item.id)
        const used = quantity(item.quantity, item.unit)
        if (used.quantityBase <= 0 || used.dimension !== lot.dimension || used.quantityBase > lot.quantityBase) throw new Error("A mennyiség vagy mértékegység nem egyezik a meglévő készlettel.")
        return `${lot.name}: ${lot.quantityBase} → ${lot.quantityBase - used.quantityBase} ${lot.dimension === "mass" ? "g" : lot.dimension === "volume" ? "ml" : lot.displayUnit}`
      })
      if (!Number.isSafeInteger(Number(payload.portions)) || Number(payload.portions) <= 0) throw new Error("Adj meg pozitív egész számú készételadagot.")
      cookingForm.querySelector("[data-household-cooking-preview]").textContent = `Előnézet: ${messages.join("; ")}. Készétel: ${payload.portions} adag. Mentés csak megerősítés után.`
    } catch(err) { cookingForm.querySelector("[data-household-cooking-preview]").textContent = err.message }
  }
  function openCooking(id) {
    const recipe = advice.status === "ready" && advice.project?.recipes?.find(recipe => recipe.id === id)
    if (!freshOwnerMode || !store || !recipe || !state().inventory.some(lot => lot.quantityBase > 0)) { alert("Főzéshez saját recept és megerősített, pozitív készlet szükséges.", true); return }
    closeForms()
    cooking = { recipeId: id, opId: operationId(), revision: recipe.revision, updatedAt: recipe.updatedAt, ingredients: JSON.stringify(recipe.ingredients), yieldUnit: recipe.yieldUnit || "serving" }
    cookingForm.reset()
    cookingForm.elements.name.value = recipe.name
    cookingForm.elements.portions.value = Number.isSafeInteger(recipe.yieldCount) && recipe.yieldCount > 0 ? String(recipe.yieldCount) : ""
    cookingForm.querySelector("[data-household-cooking-rows]").replaceChildren()
    cookingForm.hidden = false
    appendCookingRow()
    cookingForm.scrollIntoView({ block: "nearest" })
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (d.householdTab) { tab = d.householdTab; closeForms(); render() }
    else if (d.householdFilter) { filter = d.householdFilter; render() }
    else if (d.householdCook && freshOwnerMode) openCooking(d.householdCook)
    else if (d.householdCookingAdd !== undefined && cooking) appendCookingRow()
    else if (d.householdCookingRemove !== undefined && cooking) { button.closest('.household-cooking-row').remove(); previewCooking() }
    else if (d.householdOpenFoodRecipe && freshOwnerMode && openFoodRecipe && advice.status === 'ready') {
      const id = d.householdOpenFoodRecipe
      if (!advice.project.recipes.some(recipe => recipe.id === id)) return
      const current = store
      const epoch = loadEpoch
      try {
        await current.assertOwner()
        if (epoch !== loadEpoch || store !== current) return
        openFoodRecipe(id)
      } catch { clearFreshHome() }
    }
    else if (d.householdAdd) openForm(d.householdAdd)
    else if (d.householdEdit) openForm('inventory', d.householdEdit)
    else if (d.householdEditShopping) openForm('shopping', d.householdEditShopping)
    else if (d.householdCancel !== undefined) closeForms()
    else if (d.householdDelete && confirm('Eltávolítod ezt a készlettételt?')) await run('LotDeleted', { id: d.householdDelete })
    else if (d.householdDeleteShopping && confirm('Eltávolítod ezt a listaelemet?')) await run('ShoppingItemDeleted', { id: d.householdDeleteShopping })
    else if (d.householdCheck) { const item = state().shopping.find(row => row.id === d.householdCheck); await run('ShoppingItemStatusChanged', { id: item.id, status: item.status === 'checked' ? 'planned' : 'checked' }) }
    else if (d.householdDefer) await run('ShoppingItemStatusChanged', { id: d.householdDefer, status: 'deferred' })
    else if (d.householdSplitId) { closeForms(); splitId = d.householdSplitId; splitOperationId = operationId(); const lot = state().inventory.find(row => row.id === splitId); $('[data-household-split-source]').textContent = `${lot.name} · ${displayQuantity(lot)}. A megosztás tárolóváltás, nem vásárlás.`; for (const option of splitForm.elements.unit.options) option.disabled = UNITS[option.value][0] !== lot.dimension; splitForm.elements.unit.value = lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit; splitForm.elements.fridgeQuantity.value = String(lot.quantityBase / UNITS[splitForm.elements.unit.value][1]); splitForm.hidden = false; previewSplit(); splitForm.scrollIntoView({ block: 'nearest' }) }
    else if (d.householdPreset) { const lot = state().inventory.find(row => row.id === splitId); const p = splitPreset(lot, d.householdPreset); splitForm.elements.fridgeQuantity.value = String(p.fridgeBase / UNITS[splitForm.elements.unit.value][1]); previewSplit() }
    else if (d.householdUndo !== undefined && lastEventId) { const result = await run('Reversed', { eventId: lastEventId }); if (result) { lastEventId = null; render() } }
  })
  $('[data-household-search]').addEventListener('input', event => { search = event.target.value.toLocaleLowerCase('hu-HU'); render() })
  splitForm.elements.fridgeQuantity.addEventListener('input', previewSplit)
  splitForm.elements.unit.addEventListener('change', previewSplit)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (form.hidden || !editing) return
    const data = Object.fromEntries(new FormData(form))
    if (editing.kind === 'inventory') {
      const result = await run(editing.id ? 'LotEdited' : 'StockCountConfirmed', { ...data, id: editing.id }, formOperationId)
      if (result) closeForms()
    } else {
      const result = await run(editing.id ? 'ShoppingItemEdited' : 'ShoppingItemAdded', { ...data, id: editing.id }, formOperationId)
      if (result) closeForms()
    }
  })
  splitForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (splitForm.hidden || !splitId) return
    const lot = state().inventory.find(row => row.id === splitId)
    const result = await run('StockSplit', { id: splitId, fridgeQuantity: splitForm.elements.fridgeQuantity.value, unit: splitForm.elements.unit.value }, splitOperationId)
    if (result) closeForms()
  })
  if (cookingForm) {
    cookingForm.addEventListener("input", previewCooking)
    cookingForm.addEventListener("change", event => {
      if (event.target.name === "lotId") setCookingUnit(event.target.closest(".household-cooking-row"))
      previewCooking()
    })
    cookingForm.addEventListener("submit", async event => {
      event.preventDefault()
      if (!cooking || cookingForm.hidden || cookingBusy || !store) return
      const selected = { ...cooking }
      const epoch = loadEpoch
      const current = store
      const payload = cookingPayload()
      cookingBusy = true
      const submit = cookingForm.querySelector('button[type="submit"]')
      submit.disabled = true
      try {
        // Re-read and authenticate the original Food recipe immediately before saving.
        const { openGrapesTestFreshFood } = await import("../food/grapes-test-fresh-food.js")
        const food = await openGrapesTestFreshFood({ enabled: true })
        if (food.ownerId !== current.ownerId) throw new Error("A Home és Food fiók eltér.")
        const project = await food.load()
        const currentRecipe = project.recipes.find(recipe => recipe.id === selected.recipeId)
        if (!currentRecipe || currentRecipe.ownerProfileId !== current.ownerId ||
            currentRecipe.revision !== selected.revision || currentRecipe.updatedAt !== selected.updatedAt ||
            JSON.stringify(currentRecipe.ingredients) !== selected.ingredients) throw new Error("A recept időközben megváltozott. Nyisd meg újra a főzést.")
        if (project.profile?.id !== current.ownerId || currentRecipe.yieldUnit !== selected.yieldUnit) throw new Error("A Food-recept nem egyezik a Home-fiókkal.")
        await food.assertOwner()
        await current.assertOwner()
        if (epoch !== loadEpoch || current !== store || cooking?.opId !== selected.opId) return
        const result = await run("CookingConfirmed", payload, selected.opId, { sourceType: "food-recipe", sourceId: `${current.ownerId}:${selected.recipeId}:${selected.opId}` })
        if (result) { closeForms(); tab = 'inventory'; render() }
      } catch (err) {
        if (epoch === loadEpoch && current === store) {
          try { await current.assertOwner(); alert(err.message, true) } catch { clearFreshHome() }
        }
      } finally { cookingBusy = false; submit.disabled = false }
    })
  }
  async function refreshAdvice(session, epoch) {
    advice = { status: 'loading', project: null }
    render()
    try {
      const { openGrapesTestFreshFood } = await import('../food/grapes-test-fresh-food.js')
      const foodSession = await openGrapesTestFreshFood({ enabled: true })
      if (foodSession.ownerId !== session.ownerId) throw new Error('Eltérő Food/Home tulajdonos.')
      const project = await foodSession.load()
      await foodSession.assertOwner()
      await session.assertOwner()
      if (epoch !== loadEpoch || session !== store) return
      if (project.profile?.id !== session.ownerId) throw new Error('Eltérő Food-profil.')
      advice = { status: 'ready', project }
    } catch {
      if (epoch !== loadEpoch || session !== store) return
      try { await session.assertOwner() } catch { clearFreshHome(); return }
      advice = { status: 'error', project: null }
    }
    if (epoch === loadEpoch && session === store) render()
  }
  return {
    async load() {
      if (freshOwnerMode) {
        clearFreshHome()
        const epoch = loadEpoch
        try {
          const { openGrapesTestFreshHome } =
            await import('./grapes-test-fresh-home.js')
          const session = await openGrapesTestFreshHome({ enabled: true })
          await session.assertOwner()
          if (epoch !== loadEpoch) return
          store = session
          $('[data-household-tabs]').hidden = false
          alert('', false)
          render()
          refreshAdvice(session, epoch).catch(() => {})
        } catch (err) {
          if (epoch !== loadEpoch) return
          store = null
          closeForms()
          $('[data-household-tabs]').hidden = true
          $('[data-household-inventory]').hidden = true
          $('[data-household-shopping]').hidden = true
          $('[data-household-undo]').hidden = true
          alert(err.message, true)
        } finally {
          if (epoch === loadEpoch) {
            root.inert = false
            root.style.visibility = ''
          }
        }
        return
      }
      try {
        store = createHomeStore(storage)
        $('[data-household-tabs]').hidden = false
        alert(message || '', !!error)
        render()
      } catch (err) {
        store = null
        closeForms()
        $('[data-household-tabs]').hidden = true
        $('[data-household-inventory]').hidden = true
        $('[data-household-shopping]').hidden = true
        $('[data-household-undo]').hidden = true
        alert(err.message, true)
      }
    },
    clear: clearFreshHome,
    openTab(name) {
      if (!['inventory', 'shopping', ...(freshOwnerMode ? ['advice'] : [])].includes(name)) return
      tab = name
      closeForms()
      render()
    },
    handleBack() {
      if (!form.hidden || !splitForm.hidden || (cookingForm && !cookingForm.hidden)) { closeForms(); return true }
      return false
    },
  }
}
