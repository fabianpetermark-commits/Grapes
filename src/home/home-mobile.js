import { createHomeStore } from './home-store.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, UNITS } from './home-data.js'
import { reviewRecipeAgainstInventory } from './home-food-recipes.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
const statusNames = { planned: 'Tervezett', checked: 'Elintézve', deferred: 'Később' }
const units = Object.keys(UNITS).map(unit => `<option value="${unit}">${unit}</option>`).join('')
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createHomeMobile(root, storage, { loadRecipes = null, openRecipe = null, loadFoodDiary = null } = {}) {
  let store = null
  let tab = 'inventory'
  let filter = 'all'
  let search = ''
  let editing = null
  let splitId = null
  let formOperationId = null
  let splitOperationId = null
  let cookingRecipeId = null
  let cookingOperationId = null
  let linkingPreparedId = null
  let linkingOperationId = null
  let foodDiaryEntries = []
  let lastEventId = null
  let message = ''
  let error = ''
  let foodRecipes = { status: 'idle', recipes: [], savedAt: null }
  let recipeReadId = 0
  let linkReadId = 0
  root.innerHTML = `
    <div class="household-head"><p class="eyebrow">Home / Háztartás</p><h1>Mi van otthon?</h1><p>Ezen az eszközön tárolva · nincs családi szinkron</p></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-tabs" data-household-tabs role="tablist" aria-label="Háztartás nézetei"><button type="button" data-household-tab="inventory" role="tab">Készlet</button><button type="button" data-household-tab="shopping" role="tab">Bevásárlólista</button><button type="button" data-household-tab="recipes" role="tab">Receptek</button></div>
    <section data-household-inventory><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"><button type="button" data-household-add="inventory">+ Élelmiszer</button></div><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div><div data-household-lots></div><h2 class="household-section-title">Elkészített ételek</h2><div data-household-prepared></div></section>
    <section data-household-shopping hidden><div class="household-toolbar"><p>Bevásárlási tervek. A kipipálás nem növeli a készletet.</p><button type="button" data-household-add="shopping">+ Listaelem</button></div><div data-household-items></div></section>
    <section data-household-recipes hidden><p class="household-recipe-notice">A Food saját, helyben mentett receptjei. A névegyezés nem igazolja, hogy van elég alapanyag. Recept megnyitása nem módosít készletet.</p><div data-household-recipe-items aria-live="polite"></div></section>
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>
    <form class="household-form" data-household-form hidden><h2 data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><label data-household-location-label>Tárolás<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form" data-household-split hidden><h2>Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>
    <form class="household-form" data-household-cooking hidden><h2>Főzés megerősítése</h2><p>A ténylegesen felhasznált tételeket add meg. Az előnézet nem módosít készletet. A recept többi hozzávalóját külön ellenőrizd.</p><label>Készétel neve<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Elkészült adagok<input name="portions" type="number" min="1" step="1" required></label><label>Készétel tárolása<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label></div><div data-household-cooking-rows></div><button type="button" data-household-cooking-add>+ Felhasznált tétel</button><p data-household-cooking-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elkészítettem · megerősítés</button></div></form>
    <form class="household-form" data-household-link hidden><h2>Food-napló hozzárendelése</h2><p>A Foodban már elmentett saját étkezést kösd ehhez a készételhez. Ez csak a készétel adagjait csökkenti; a nyers készletet és a Food-naplót nem módosítja. A Food-bejegyzés későbbi törlése nem állítja vissza automatikusan az adagokat.</p><p data-household-link-source></p><label>Mentett Food-bejegyzés<select name="foodEntryId" required></select></label><p data-household-link-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Hozzárendelés megerősítése</button></div></form>`

  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  const cookingForm = $('[data-household-cooking]')
  const linkForm = $('[data-household-link]')
  const state = () => store.getState()
  const alert = (text, isError = false) => { message = isError ? '' : text; error = isError ? text : ''; const node = $('[data-household-alert]'); node.hidden = !text; node.textContent = text; node.classList.toggle('is-error', isError) }
  const run = (type, payload, eventId, source = {}) => {
    if (!store) return
    try {
      const result = store.dispatch({ type, payload, ...(eventId ? { eventId } : {}), ...source })
      if (!result.duplicate) lastEventId = result.event.eventId
      alert(result.duplicate ? 'A művelet már végrehajtva.' : 'Mentve ezen az eszközön.')
      render()
      return result
    } catch (err) { alert(err.message, true); return null }
  }
  const closeForms = () => { linkReadId++; form.hidden = true; splitForm.hidden = true; cookingForm.hidden = true; linkForm.hidden = true; editing = null; splitId = null; cookingRecipeId = null; linkingPreparedId = null; formOperationId = null; splitOperationId = null; cookingOperationId = null; linkingOperationId = null; foodDiaryEntries = [] }
  async function refreshRecipes() {
    const requestId = ++recipeReadId
    foodRecipes = { status: 'loading', recipes: [], savedAt: null }
    render()
    if (!loadRecipes) { foodRecipes = { status: 'unavailable', recipes: [], savedAt: null }; render(); return }
    try {
      const result = await loadRecipes()
      if (requestId !== recipeReadId) return
      foodRecipes = result
    } catch (readError) {
      if (requestId !== recipeReadId) return
      foodRecipes = { status: 'error', recipes: [], error: readError.message }
    }
    render()
  }
  function render() {
    if (!store) return
    const current = state()
    $('[data-household-inventory]').hidden = tab !== 'inventory'
    $('[data-household-shopping]').hidden = tab !== 'shopping'
    $('[data-household-recipes]').hidden = tab !== 'recipes'
    root.querySelectorAll('[data-household-tab]').forEach(node => { node.setAttribute('aria-selected', String(node.dataset.householdTab === tab)); node.classList.toggle('is-active', node.dataset.householdTab === tab) })
    root.querySelectorAll('[data-household-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.householdFilter === filter))
    const lots = current.inventory.filter(lot => (filter === 'all' || lot.storageLocation === filter) && lot.name.toLocaleLowerCase('hu-HU').includes(search))
    $('[data-household-lots]').innerHTML = lots.length ? lots.map(lot => `<article class="household-card"><div><strong>${escape(lot.name)}</strong><p>${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]} · kézi, megerősített ${escape(lot.observedAt.slice(0, 10))}</p><small>${escape(expiryLabel(lot))}</small></div><div class="household-card-actions"><button type="button" data-household-edit="${escape(lot.id)}">Szerkesztés</button><button type="button" data-household-split-id="${escape(lot.id)}">Elosztás</button><button type="button" data-household-delete="${escape(lot.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">Itt még nincs ismert élelmiszer. Adj hozzá egy megerősített mennyiséget.</div>'
    $('[data-household-prepared]').innerHTML = current.prepared.length ? current.prepared.map(lot => `<article class="household-card"><strong>${escape(lot.name)}</strong><p>${lot.portionsRemaining} ${lot.portionUnit === 'slice' ? 'szelet' : lot.portionUnit === 'piece' ? 'darab' : 'adag'} · ${placeNames[lot.storageLocation]} · elkészítve ${escape(lot.confirmedAt.slice(0, 10))}</p>${lot.portionsRemaining > 0 && lot.recipeRef ? `<div class="household-card-actions"><button type="button" data-household-link-prepared="${escape(lot.id)}">Food-napló hozzárendelése</button></div>` : ''}</article>`).join('') : '<div class="household-empty">Még nincs megerősített főzésből származó készétel.</div>'
    $('[data-household-items]').innerHTML = current.shopping.length ? current.shopping.map(item => `<article class="household-card"><div><strong>${escape(item.name)}</strong><p>${escape(displayQuantity(item))} · ${statusNames[item.status]} · tervezett, nem készlet</p></div><div class="household-card-actions"><button type="button" data-household-check="${escape(item.id)}">${item.status === 'checked' ? 'Újra listára' : 'Elintézve'}</button><button type="button" data-household-defer="${escape(item.id)}">Később</button><button type="button" data-household-edit-shopping="${escape(item.id)}">Szerkesztés</button><button type="button" data-household-delete-shopping="${escape(item.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">A bevásárlólista üres. Itt tervezhetsz vásárlást készletváltozás nélkül.</div>'
    const recipeItems = $('[data-household-recipe-items]')
    if (foodRecipes.status === 'loading') recipeItems.innerHTML = '<div class="household-empty">A helyi Food-receptek betöltése…</div>'
    else if (foodRecipes.status === 'error') recipeItems.innerHTML = `<div class="household-empty" role="alert">A Food-receptek nem olvashatók: ${escape(foodRecipes.error)}. A Home-készlet változatlan.</div>`
    else if (foodRecipes.status === 'unavailable' || !foodRecipes.recipes.length) recipeItems.innerHTML = '<div class="household-empty">Nincs hozzáférhető, helyben mentett saját Food-recept ehhez a profilhoz. A Drive-on lévő, még nem mentett recepteket itt nem olvassuk.</div>'
    else recipeItems.innerHTML = foodRecipes.recipes.map(recipe => {
      const review = reviewRecipeAgainstInventory(recipe, current.inventory)
      const yieldLabel = recipe.yieldCount == null ? 'Hozam: ismeretlen' : `Hozam: ${escape(recipe.yieldCount)} ${recipe.yieldUnit === 'slice' ? 'szelet' : recipe.yieldUnit === 'piece' ? 'darab' : 'adag'}`
      const ingredients = review.ingredients.map(ingredient => `<li>${escape(ingredient.name || 'Ismeretlen hozzávaló')} · ${escape(ingredient.amount)} ${escape(ingredient.unit)} — ${ingredient.possibleNameMatch ? 'lehetséges névegyezés a készletben' : 'nincs beazonosított készlettétel'}</li>`).join('')
      return `<article class="household-card household-recipe-card"><strong>${escape(recipe.name)}</strong><p>${escape(recipe.category)} · ${yieldLabel} · Elkészítési idő: ismeretlen</p><p><b>Ellenőrizendő</b> · Az alapanyagok megfeleltetése és mennyisége nincs igazolva.</p><details><summary>Miért ezt látom?</summary><ul>${ingredients}</ul></details><div class="household-card-actions"><button type="button" data-household-open-recipe="${escape(recipe.id)}">Recept megtekintése a Foodban</button><button type="button" data-household-cook-recipe="${escape(recipe.id)}">Főzés rögzítése</button></div></article>`
    }).join('')
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
  function addCookingRow() {
    const rows = $('[data-household-cooking-rows]')
    const options = state().inventory.filter(lot => lot.quantityBase > 0).map(lot => `<option value="${escape(lot.id)}">${escape(lot.name)} · ${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]}</option>`).join('')
    const row = document.createElement('div')
    row.className = 'household-cooking-row'
    row.innerHTML = `<label>Felhasznált készlettétel<select name="lotId" required>${options}</select></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><button type="button" data-household-cooking-remove>Tétel eltávolítása</button>`
    rows.append(row)
    row.querySelector('[name="lotId"]').dispatchEvent(new Event('change', { bubbles: true }))
  }
  function cookingPayload() {
    return { name: cookingForm.elements.name.value, portions: cookingForm.elements.portions.value, storageLocation: cookingForm.elements.storageLocation.value, recipeRef: cookingRecipeId, portionUnit: foodRecipes.recipes.find(recipe => recipe.id === cookingRecipeId)?.yieldUnit || 'serving',
      consumed: [...root.querySelectorAll('.household-cooking-row')].map(row => ({ id: row.querySelector('[name="lotId"]').value, quantity: row.querySelector('[name="quantity"]').value, unit: row.querySelector('[name="unit"]').value })) }
  }
  function previewCooking() {
    if (cookingForm.hidden) return
    try {
      const payload = cookingPayload()
      const seen = new Set()
      const parts = payload.consumed.map(used => {
        const lot = state().inventory.find(row => row.id === used.id)
        if (!lot || seen.has(used.id)) throw new Error('Válassz különböző, meglévő készlettételeket.')
        seen.add(used.id)
        const amount = Number(used.quantity.replace(',', '.')) * UNITS[used.unit][1]
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > lot.quantityBase || UNITS[used.unit][0] !== lot.dimension) throw new Error('A felhasznált mennyiség nem egyezik a készlettel.')
        return `${lot.name}: ${used.quantity} ${used.unit} → ${lot.quantityBase - amount} ${lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit} marad`
      })
      $('[data-household-cooking-preview]').textContent = parts.length ? `Előnézet: ${parts.join('; ')}. Készétel: ${payload.portions || '?'} adag. Mentés csak megerősítés után.` : 'Adj hozzá legalább egy felhasznált készlettételt.'
    } catch (err) { $('[data-household-cooking-preview]').textContent = err.message }
  }
  function openCooking(recipeId) {
    const recipe = foodRecipes.recipes.find(row => row.id === recipeId)
    if (!recipe || !state().inventory.some(lot => lot.quantityBase > 0)) { alert('Főzéshez hozzáférhető recept és megerősített, pozitív készlet kell.', true); return }
    closeForms()
    cookingRecipeId = recipe.id
    cookingOperationId = operationId()
    cookingForm.reset()
    cookingForm.elements.name.value = recipe.name
    cookingForm.elements.portions.value = Number.isSafeInteger(recipe.yieldCount) && recipe.yieldCount > 0 ? recipe.yieldCount : ''
    $('[data-household-cooking-rows]').replaceChildren()
    cookingForm.hidden = false
    addCookingRow()
    cookingForm.scrollIntoView({ block: 'nearest' })
  }
  async function openLink(preparedLotId) {
    const lot = state().prepared.find(row => row.id === preparedLotId)
    if (!lot || !lot.recipeRef || !loadFoodDiary) { alert('Ehhez a készételhez nem érhető el mentett Food-napló.', true); return }
    closeForms()
    const readId = ++linkReadId
    alert('A helyben mentett Food-napló olvasása…')
    try {
      const diary = await loadFoodDiary()
      if (readId !== linkReadId) return
      const linked = new Set(state().events.filter(event => event.type === 'PreparedConsumptionLinked').map(event => event.sourceId))
      foodDiaryEntries = diary.filter(entry => entry.recipeRef === lot.recipeRef && entry.unit === (lot.portionUnit || 'serving') && entry.portions <= lot.portionsRemaining && !linked.has(`${entry.profileId}:${entry.id}`))
      if (!foodDiaryEntries.length) { alert('Nincs ehhez a recepthez kapcsolható, mentett saját Food-bejegyzés. Előbb naplózd az étkezést a Foodban.', true); return }
      linkingPreparedId = preparedLotId
      linkingOperationId = operationId()
      linkForm.elements.foodEntryId.replaceChildren(...foodDiaryEntries.map(entry => new Option(`${entry.recipeName} · ${entry.portions} adag · ${entry.occurredAt.slice(0, 10)}`, entry.id)))
      $('[data-household-link-source]').textContent = `${lot.name} · ${lot.portionsRemaining} adag maradt.`
      linkForm.hidden = false
      previewLink()
      linkForm.scrollIntoView({ block: 'nearest' })
      alert('Válassz bejegyzést, majd erősítsd meg a hozzárendelést.')
    } catch (err) { if (readId === linkReadId) alert(`A Food-napló nem olvasható: ${err.message}`, true) }
  }
  function previewLink() {
    const lot = state().prepared.find(row => row.id === linkingPreparedId)
    const entry = foodDiaryEntries.find(row => row.id === linkForm.elements.foodEntryId.value)
    $('[data-household-link-preview]').textContent = lot && entry ? `Előnézet: ${lot.portionsRemaining} → ${lot.portionsRemaining - entry.portions} adag készétel. A nyers készlet változatlan.` : 'Válassz mentett Food-bejegyzést.'
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (d.householdTab) { tab = d.householdTab; closeForms(); render(); if (tab === 'recipes') refreshRecipes() }
    else if (d.householdFilter) { filter = d.householdFilter; render() }
    else if (d.householdAdd) openForm(d.householdAdd)
    else if (d.householdEdit) openForm('inventory', d.householdEdit)
    else if (d.householdEditShopping) openForm('shopping', d.householdEditShopping)
    else if (d.householdCancel !== undefined) closeForms()
    else if (d.householdDelete && confirm('Eltávolítod ezt a készlettételt?')) run('LotDeleted', { id: d.householdDelete })
    else if (d.householdDeleteShopping && confirm('Eltávolítod ezt a listaelemet?')) run('ShoppingItemDeleted', { id: d.householdDeleteShopping })
    else if (d.householdOpenRecipe && openRecipe) openRecipe(d.householdOpenRecipe)
    else if (d.householdCookRecipe) openCooking(d.householdCookRecipe)
    else if (d.householdLinkPrepared) openLink(d.householdLinkPrepared)
    else if (d.householdCookingAdd !== undefined) { addCookingRow(); previewCooking() }
    else if (d.householdCookingRemove !== undefined) { button.closest('.household-cooking-row').remove(); previewCooking() }
    else if (d.householdCheck) { const item = state().shopping.find(row => row.id === d.householdCheck); run('ShoppingItemStatusChanged', { id: item.id, status: item.status === 'checked' ? 'planned' : 'checked' }) }
    else if (d.householdDefer) run('ShoppingItemStatusChanged', { id: d.householdDefer, status: 'deferred' })
    else if (d.householdSplitId) { closeForms(); splitId = d.householdSplitId; splitOperationId = operationId(); const lot = state().inventory.find(row => row.id === splitId); $('[data-household-split-source]').textContent = `${lot.name} · ${displayQuantity(lot)}. A megosztás tárolóváltás, nem vásárlás.`; for (const option of splitForm.elements.unit.options) option.disabled = UNITS[option.value][0] !== lot.dimension; splitForm.elements.unit.value = lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit; splitForm.elements.fridgeQuantity.value = String(lot.quantityBase / UNITS[splitForm.elements.unit.value][1]); splitForm.hidden = false; previewSplit(); splitForm.scrollIntoView({ block: 'nearest' }) }
    else if (d.householdPreset) { const lot = state().inventory.find(row => row.id === splitId); const p = splitPreset(lot, d.householdPreset); splitForm.elements.fridgeQuantity.value = String(p.fridgeBase / UNITS[splitForm.elements.unit.value][1]); previewSplit() }
    else if (d.householdUndo !== undefined && lastEventId) { const result = run('Reversed', { eventId: lastEventId }); if (result) { lastEventId = null; render() } }
  })
  $('[data-household-search]').addEventListener('input', event => { search = event.target.value.toLocaleLowerCase('hu-HU'); render() })
  splitForm.elements.fridgeQuantity.addEventListener('input', previewSplit)
  splitForm.elements.unit.addEventListener('change', previewSplit)
  cookingForm.addEventListener('input', previewCooking)
  linkForm.elements.foodEntryId.addEventListener('change', previewLink)
  cookingForm.addEventListener('change', event => {
    if (event.target.name === 'lotId') {
      const lot = state().inventory.find(row => row.id === event.target.value)
      if (lot) {
        const row = event.target.closest('.household-cooking-row')
        for (const option of row.querySelector('[name="unit"]').options) option.disabled = UNITS[option.value][0] !== lot.dimension
        row.querySelector('[name="unit"]').value = lot.displayUnit
      }
    }
    previewCooking()
  })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (form.hidden || !editing) return
    const data = Object.fromEntries(new FormData(form))
    if (editing.kind === 'inventory') {
      const result = run(editing.id ? 'LotEdited' : 'StockCountConfirmed', { ...data, id: editing.id }, formOperationId)
      if (result) closeForms()
    } else {
      const result = run(editing.id ? 'ShoppingItemEdited' : 'ShoppingItemAdded', { ...data, id: editing.id }, formOperationId)
      if (result) closeForms()
    }
  })
  splitForm.addEventListener('submit', event => {
    event.preventDefault()
    if (splitForm.hidden || !splitId) return
    const lot = state().inventory.find(row => row.id === splitId)
    const result = run('StockSplit', { id: splitId, fridgeQuantity: splitForm.elements.fridgeQuantity.value, unit: splitForm.elements.unit.value }, splitOperationId)
    if (result) closeForms()
  })
  cookingForm.addEventListener('submit', event => {
    event.preventDefault()
    if (cookingForm.hidden || !cookingRecipeId) return
    const result = run('CookingConfirmed', cookingPayload(), cookingOperationId)
    if (result) closeForms()
  })
  linkForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (linkForm.hidden || !linkingPreparedId) return
    const entry = foodDiaryEntries.find(row => row.id === linkForm.elements.foodEntryId.value)
    if (!entry) return alert('Válassz mentett Food-bejegyzést.', true)
    const expectedId = linkingPreparedId
    const expectedOperation = linkingOperationId
    try {
      const latest = (await loadFoodDiary()).find(row => row.id === entry.id && row.profileId === entry.profileId)
      if (!latest || latest.recipeRef !== entry.recipeRef || latest.portions !== entry.portions || latest.unit !== entry.unit) throw new Error('A Food-bejegyzés időközben megváltozott. Olvasd be újra.')
      if (linkingPreparedId !== expectedId || linkingOperationId !== expectedOperation) return
      const result = run('PreparedConsumptionLinked', { preparedLotId: expectedId, profileId: entry.profileId, foodEntryId: entry.id, recipeRef: entry.recipeRef, portions: entry.portions, unit: entry.unit }, expectedOperation, { sourceType: 'food-diary', sourceId: `${entry.profileId}:${entry.id}` })
      if (result) closeForms()
    } catch (err) { alert(err.message, true) }
  })
  return { load() { try { store = createHomeStore(storage); $('[data-household-tabs]').hidden = false; alert(message || '', !!error); render(); if (tab === 'recipes') refreshRecipes() } catch (err) { store = null; closeForms(); $('[data-household-tabs]').hidden = true; $('[data-household-inventory]').hidden = true; $('[data-household-shopping]').hidden = true; $('[data-household-recipes]').hidden = true; $('[data-household-undo]').hidden = true; alert(err.message, true) } }, handleBack() { if (!form.hidden || !splitForm.hidden || !cookingForm.hidden || !linkForm.hidden) { closeForms(); return true } return false } }
}
