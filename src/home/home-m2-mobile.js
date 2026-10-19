import { displayQuantity, UNITS, quantity } from './home-data.js'
import { readOwnFoodRecipes, readFinanceReceiptCandidates, reviewFoodRecipeAvailability } from './home-m2-bridges.js'

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-m2-${Date.now()}-${Math.random().toString(36).slice(2)}`
const labels = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }

export function createHomeM2Mobile(root, { getState, dispatch, report }) {
  const section = root.ownerDocument.createElement('section')
  section.dataset.householdM2 = ''
  section.hidden = true
  section.innerHTML = `
    <div class="household-head"><h2>Home M2 · Recept és főzés</h2><p>Food és Pénzügy csak kérésre, olvasásra. A tényleges készletmozgáshoz külön jóváhagyás kell.</p></div>
    <div class="household-m2-actions"><button type="button" data-m2-food-read>Saját Food-receptek megtekintése</button><button type="button" data-m2-finance-read>Tételes blokk-javaslatok ellenőrzése</button></div>
    <p class="household-m2-note" data-m2-source-status aria-live="polite">Nincs még engedélyezett adatolvasás. A személyes Food- és Pénzügy-adatok nem kerülnek át a Home-ba.</p>
    <div data-m2-recipes></div>
    <div data-m2-receipts></div>
    <div data-m2-prepared></div>
    <form class="household-form" data-m2-cooking hidden><h2>Főzés megerősítése</h2><div data-m2-cooking-head></div><div data-m2-ingredients></div>
      <div class="household-fields"><label>Kész adagok száma<input name="portions" required type="number" min="1" step="1" inputmode="numeric"></label><label>Készétel helye<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label></div>
      <p>Csak a valóban felhasznált, külön kiválasztott készlettételek kerülnek levonásra. A Food étkezési naplója változatlan.</p>
      <label><input name="confirmed" type="checkbox" required> Valóban elkészítettem, és ellenőriztem minden hozzávaló mennyiségét.</label>
      <div class="household-actions"><button type="button" data-m2-cancel>Mégse</button><button type="submit">Elkészítettem · készletváltozás mentése</button></div>
    </form>`
  root.querySelector('[data-household-undo]').before(section)
  const $ = q => section.querySelector(q)
  const form = $('[data-m2-cooking]')
  let recipes = null
  let receiptCandidates = null
  let selectedRecipe = null
  let sourceStatus = ''
  let cookingEventId = ''
  const sourceMessage = text => { sourceStatus = text; $('[data-m2-source-status]').textContent = text }
  function render() {
    const state = getState()
    if (!state) return
    const lots = state.inventory
    const cooked = state.prepared || []
    $('[data-m2-prepared]').innerHTML = '<h3>Készételek · saját Home események</h3>' +
      (cooked.length ? cooked.map(x => `<article class="household-card"><strong>${esc(x.name)}</strong><p>${x.portionsRemaining} / ${x.portionsPrepared} adag · ${labels[x.storageLocation]} · megerősített főzés</p>${x.portionsRemaining ? `<button type="button" data-m2-use="${esc(x.id)}">1 adag tényleges elfogyasztása</button>` : ''}</article>`).join('') : '<p class="household-empty">Még nincs rögzített elkészített étel. A Food-napló nem hoz létre ilyet automatikusan.</p>')
    if (recipes) $('[data-m2-recipes]').innerHTML = '<h3>Saját Food-receptek · csak olvasás</h3>' +
      (recipes.length ? recipes.map(recipe => {
        const analysis = reviewFoodRecipeAvailability(recipe, state)
        return `<article class="household-card"><strong>${esc(recipe.name)}</strong><p>Hozam: ${recipe.yieldCount == null ? 'ismeretlen' : esc(recipe.yieldCount) + ' ' + (recipe.yieldUnit === 'slice' ? 'szelet' : recipe.yieldUnit === 'piece' ? 'darab' : 'adag')} · ${analysis.status}</p>
          <small>${esc(analysis.reason)}</small>
          <p>${recipe.ingredients.map(i => esc(i.name) + ' · ' + esc(i.amount) + ' ' + esc(i.unit)).join(' · ')}</p>
          <button type="button" data-m2-cook="${esc(recipe.id)}">Főzési előnézet</button></article>`
      }).join('') : '<p class="household-empty">Nincs elérhető saját recept az aktuális profil helyi Food-naplójában.</p>')
    if (receiptCandidates) $('[data-m2-receipts]').innerHTML = '<h3>Pénzügy · tételes javaslatok</h3>' +
      (receiptCandidates.length ? receiptCandidates.map((x,i) => `<article class="household-card"><strong>${esc(x.name)}</strong><p>${esc(x.quantity)} ${esc(x.unit)} · ${esc(x.status)}</p><div class="household-fields"><label>Tárolás<select data-m2-receipt-location="${i}"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><button type="button" data-m2-receive="${i}">Bevételezés megerősítése</button></div></article>`).join('') :
      '<p class="household-empty">A Pénzügy jelenleg nem tárol ellenőrzött, tételes blokksorokat. Az összeg vagy a blokkkép önmagában nem készletadat.</p>')
  }
  function startCooking(recipeId) {
    const recipe = recipes?.find(x => x.id === recipeId)
    if (!recipe) return
    selectedRecipe = recipe
    cookingEventId = operationId()
    form.reset()
    $('[data-m2-cooking-head]').textContent = recipe.name + ' · a recept megtekintése még nem von le semmit.'
    form.elements.portions.value = Number.isSafeInteger(recipe.yieldCount) && recipe.yieldCount > 0 ? recipe.yieldCount : ''
    const lots = getState()?.inventory || []
    $('[data-m2-ingredients]').innerHTML = recipe.ingredients.map((ingredient, index) => {
      const compatible = lots.filter(lot => UNITS[ingredient.unit]?.[0] === lot.dimension)
      const options = compatible.map(lot => `<option value="${esc(lot.id)}">${esc(lot.name)} · ${esc(displayQuantity(lot))} · ${labels[lot.storageLocation]}</option>`).join('')
      const unit = UNITS[ingredient.unit] ? ingredient.unit : 'g'
      return `<fieldset class="household-m2-ingredient"><legend>${esc(ingredient.name)} · Food: ${esc(ingredient.amount)} ${esc(ingredient.unit)}</legend>
        <label>Felhasznált, ellenőrzött Home tétel<select name="lotId-${index}" required><option value="">Válassz tételt</option>${options}</select></label>
        <div class="household-fields"><label>Valóban felhasznált mennyiség<input name="amount-${index}" type="number" min="0" step="any" inputmode="decimal" required value="${UNITS[ingredient.unit] ? esc(ingredient.amount) : ''}"></label>
        <label>Egység<select name="unit-${index}">${Object.keys(UNITS).map(u => `<option value="${u}" ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <small>${compatible.length ? 'Név / termékazonosság nincs automatikusan igazolva: ellenőrizd a tételt.' : 'Nincs igazolt kompatibilis Home készlet; főzés így nem menthető.'}</small></fieldset>`
    }).join('')
    form.hidden = false
    form.scrollIntoView({ block: 'nearest' })
  }
  section.addEventListener('click', async event => {
    const b = event.target.closest('button')
    if (!b || !section.contains(b)) return
    if (b.hasAttribute('data-m2-food-read')) {
      b.disabled = true
      try { recipes = await readOwnFoodRecipes({ allowed: true }); sourceMessage('Csak az aktuális profil saját, helyben mentett Food-receptjeit olvastuk. Semmit nem módosítottunk.'); render() }
      catch(err) { report(err.message, true) }
      finally { b.disabled = false }
    } else if (b.hasAttribute('data-m2-finance-read')) {
      b.disabled = true
      try { receiptCandidates = await readFinanceReceiptCandidates({ allowed: true }); sourceMessage('A Pénzügyből csak tételes, ellenőrzött sorokat néztük meg; a Pénzügy adatait nem módosítottuk.'); render() }
      catch(err) { report(err.message, true) }
      finally { b.disabled = false }
    } else if (b.dataset.m2Cook) startCooking(b.dataset.m2Cook)
    else if (b.hasAttribute('data-m2-cancel')) { form.hidden = true; selectedRecipe = null }
    else if (b.dataset.m2Use) {
      if (confirm('Valóban elfogyasztottál 1 adagot ebből a készételből? A személyes Food-napló ettől NEM változik.')) {
        dispatch('PreparedPortionConsumed', { id: b.dataset.m2Use, portions: 1, confirmed: true }, operationId())
      }
    } else if (b.dataset.m2Receive != null) {
      const x = receiptCandidates?.[Number(b.dataset.m2Receive)]
      if (!x) return
      const location = section.querySelector(`[data-m2-receipt-location="${b.dataset.m2Receive}"]`)?.value
      if (!confirm(`Valóban bekerült ${x.quantity} ${x.unit} ${x.name} a ${labels[location]} készletébe?\nUgyanaz a blokksor csak egyszer vételezhető be.`)) return
      dispatch('PurchaseConfirmed', { confirmed: true, name: x.name, quantity: x.quantity, unit: x.unit, storageLocation: location },
        operationId(), { sourceType: 'financeReceiptLine', sourceId: x.sourceId })
    }
  })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (!selectedRecipe || form.hidden || !form.elements.confirmed.checked) return
    try {
      const ingredients = selectedRecipe.ingredients.map((item, index) => {
        const lotId = form.elements[`lotId-${index}`].value
        const amount = form.elements[`amount-${index}`].value
        const unit = form.elements[`unit-${index}`].value
        if (!lotId || quantity(amount, unit).quantityBase <= 0) throw new Error('Minden hozzávalóhoz igazolt tételt és mennyiséget válassz.')
        return { lotId, quantity: amount, unit }
      })
      const result = dispatch('CookingConfirmed', {
        confirmed: true, recipeId: selectedRecipe.id, recipeName: selectedRecipe.name,
        portions: form.elements.portions.value, storageLocation: form.elements.storageLocation.value, ingredients,
      }, cookingEventId)
      if (result) { form.hidden = true; selectedRecipe = null; render() }
    } catch(err) { report(err.message, true) }
  })
  return { section, render, handleBack() { if (!form.hidden) { form.hidden = true; selectedRecipe = null; return true } return false } }
}
