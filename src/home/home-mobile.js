import { createHomeStore } from './home-store.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, quantity, UNITS } from './home-data.js'
import { homeDateHints, homeRecipeHints } from './home-advisor.js'
import { deriveHomeReplenishment, DEFAULT_SHOPPING_LIST_ID } from './home-replenishment.js'
import { derivePurchaseCadenceForecasts } from './home-purchase-forecast.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { untracked: '', fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
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
  let linking = null
  let linkedCandidates = []
  let linkReadSeq = 0
  let linkBusy = false
  let receipts = {status:'idle',rows:[]}
  let receiptCandidates = []
  let receiptSelected = null
  let receiptOperationId = null
  let receiptReadSeq = 0
  let receiptBusy = false
  let lastEventId = null
  let replenishment = null
  let replenishmentError = ''
  let selectedList = DEFAULT_SHOPPING_LIST_ID
  let selectedSuggestions = new Set()
  let forecastAmounts = new Map()
  let suggestionsBusy = false
  let message = ''
  let error = ''
  root.innerHTML = `
    <div class="household-head"><p class="eyebrow">Home / Háztartás</p><h1>Mi van otthon?</h1><p>${freshOwnerMode ? 'Saját Grapes TEST-fiók · csak helyben' : 'Ezen az eszközön tárolva · nincs családi szinkron'}</p></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-tabs" data-household-tabs role="tablist" aria-label="Háztartás nézetei"><button type="button" data-household-tab="inventory" role="tab">Készlet</button><button type="button" data-household-tab="shopping" role="tab">Bevásárlólisták</button>${freshOwnerMode ? '<button type="button" data-household-tab="replenishment" role="tab">Javaslatok</button>' : ''}${freshOwnerMode ? '<button type="button" data-household-tab="advice" role="tab">Mit főzzünk?</button><button type="button" data-household-tab="receipts" role="tab">Blokkok</button>' : ''}</div>
    <section data-household-inventory><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"><button type="button" data-household-add="inventory">+ Élelmiszer</button></div><details class="household-advanced"><summary>Haladó · tárolóhelyek (opcionális)</summary><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div></details><div data-household-lots></div>${freshOwnerMode ? '<h2 class="household-section-title">Elkészített ételek</h2><div data-household-prepared></div>' : ''}</section>
    <section data-household-shopping hidden><div class="household-toolbar"><p>A megvett tételek automatikusan készletre kerülnek. Tárolóhelyet nem kell választani.</p><button type="button" data-household-add="shopping">+ Listaelem</button></div>${freshOwnerMode ? '<div class="household-list-nav"><label>Aktív bevásárlólista<select data-household-list-select aria-label="Bevásárlólista kiválasztása"></select></label><button type="button" data-household-new-list>+ Új lista</button></div><form data-household-list-form class="household-list-create" hidden><label>Új lista neve<input name="name" required maxlength="80" placeholder="Pl. Heti bevásárlás"></label><button type="submit">Létrehozás</button><button type="button" data-household-list-cancel>Mégse</button></form>' : ''}<div data-household-items></div></section>\n    ${freshOwnerMode ? '<section data-household-replenishment hidden><div class="household-replenishment-intro"><strong>Automatikus pótlási javaslatok</strong><p>Ezek nem bevásárlólisták. Csak igazoltan elfogyott mennyiségből készülnek; te döntöd el, mit veszel meg.</p></div><div data-household-replenishment-items aria-live="polite"></div><div class="household-replenishment-move"><label>Cél bevásárlólista<select data-household-suggestion-list aria-label="Cél bevásárlólista"></select></label><button type="button" data-household-move-selected>Listára teszem</button></div><details class="household-replenishment-history"><summary>Korábbi javaslatok</summary><div data-household-replenishment-history></div></details></section>' : ''}
    ${freshOwnerMode ? '<section data-household-advice hidden><p class="household-recipe-notice">Csak olvasó javaslatok a saját Grapes TEST Food-receptek és Home-készlet alapján. A névegyezés nem bizonyítja, hogy egy alapanyag megfelelő, elegendő vagy biztonságos.</p><div data-household-date-hints></div><div data-household-recipe-hints aria-live="polite"></div></section>' : '' }
    ${freshOwnerMode ? '<section data-household-receipts hidden><p class="household-recipe-notice">A saját Pénzügy-fiók képes blokkjai csak külön kérésre olvashatók. OCR-eredményből nem lesz automatikusan készlet, a végösszeg nem termék.</p><div data-household-receipt-items></div><div data-household-receipt-candidates></div></section>' : ''}
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>
    <form class="household-form" data-household-form hidden><h2 data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><details class="household-advanced" data-household-location-label><summary>Tárolóhely (opcionális)</summary><label>Tárolás<select name="storageLocation"><option value="untracked">Nincs megadva</option><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label></details><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form" data-household-split hidden><h2>Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>${freshOwnerMode ? '<form class="household-form" data-household-cooking hidden><h2>Főzés tényleges rögzítése</h2><p>A recept csak javaslat. A valóban felhasznált készlettételeket és mennyiségeket kézzel válaszd ki. Előnézet és megerősítés előtt semmilyen készlet nem változik.</p><label>Készétel neve<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Elkészült adagok<input name="portions" type="number" min="1" step="1" required></label><label class="household-optional-cooking" hidden>Tárolóhely (opcionális)<select name="storageLocation"><option value="untracked">Nincs megadva</option><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label></div><div data-household-cooking-rows></div><button type="button" data-household-cooking-add>+ Felhasznált tétel</button><p data-household-cooking-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elkészítettem · megerősítés</button></div></form><form class="household-form" data-household-diary-link hidden><h2>Food-étkezés hozzárendelése</h2><p>Csak a saját Foodban már elmentett, ugyanahhoz a recepthez tartozó, egész adagú étkezést kapcsolhatod. Ez csak a készétel-adagokat csökkenti, a Food-napló és a nyers készlet változatlan.</p><p data-household-diary-source></p><label>Elmentett étkezés<select name="foodEntryId" required></select></label><p data-household-diary-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elfogyasztott adagok hozzárendelése</button></div></form><form class="household-form" data-household-receipt-form hidden><h2>Bizonylatsor ellenőrzése</h2><p data-household-receipt-source></p><p>Bizonytalan OCR. A készlet csak a név, pontos mennyiség és egység kézi megerősítésével változik. Tárolóhelyet nem kell megadni.</p><label>Termék neve<input name="name" required maxlength="160"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label><label>Egység<select name="unit" required><option value="" disabled selected>Válassz</option>' + units + '</select></label></div><label hidden>Tárolóhely (opcionális)<select name="storageLocation"><option value="untracked">Nincs megadva</option><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Készletbevételezés megerősítése</button></div></form>' : ''}`

  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  const cookingForm = freshOwnerMode ? $('[data-household-cooking]') : null
  const linkForm = freshOwnerMode ? $('[data-household-diary-link]') : null
  const receiptForm = freshOwnerMode ? $('[data-household-receipt-form]') : null
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
  const closeForms = () => { linkReadSeq++; form.hidden = true; splitForm.hidden = true; if (cookingForm) cookingForm.hidden = true; if (linkForm) linkForm.hidden = true; if (receiptForm) receiptForm.hidden = true; editing = null; splitId = null; cooking = null; linking = null; receiptSelected = null; receiptOperationId = null; linkedCandidates = []; formOperationId = null; splitOperationId = null }
  function clearFreshHome() {
    if (!freshOwnerMode) return
    loadEpoch++
    store = null
    lastEventId = null
    advice = { status: 'idle', project: null }
    cookingBusy = false
    receiptReadSeq++
    receiptBusy = false
    receipts = {status:'idle',rows:[]}
    receiptCandidates = []
    $('[data-household-receipt-items]')?.replaceChildren()
    $('[data-household-receipt-candidates]')?.replaceChildren()
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
    $('[data-household-replenishment-items]')?.replaceChildren()
    $('[data-household-replenishment-history]')?.replaceChildren()
    replenishment = null
    replenishmentError = ''
    selectedList = DEFAULT_SHOPPING_LIST_ID
    selectedSuggestions.clear()
    forecastAmounts.clear()
    suggestionsBusy = false
    $('[data-household-prepared]')?.replaceChildren()
    $('[data-household-cooking-rows]')?.replaceChildren()
    $('[data-household-tabs]').hidden = true
    $('[data-household-inventory]').hidden = true
    $('[data-household-shopping]').hidden = true
    $('[data-household-replenishment]')?.setAttribute('hidden','')
    $('[data-household-receipts]')?.setAttribute('hidden','')
    $('[data-household-undo]').hidden = true
    root.inert = true
    root.style.visibility = 'hidden'
  }

  const allSuggestions = (home, prefs) => [
    ...deriveHomeReplenishment(home, prefs),
    ...derivePurchaseCadenceForecasts(home, prefs),
  ]
  function renderReplenishment(current) {
    const metas = replenishment?.getState()
    const lists = metas?.lists || [{ id: DEFAULT_SHOPPING_LIST_ID, name: 'Bevásárlólista' }]
    if (!lists.some(row => row.id === selectedList)) selectedList = DEFAULT_SHOPPING_LIST_ID
    const opts = lists.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('')
    $('[data-household-list-select]').innerHTML = opts
    $('[data-household-list-select]').value = selectedList
    $('[data-household-suggestion-list]').innerHTML = opts
    $('[data-household-suggestion-list]').value = selectedList
    const place = $('[data-household-replenishment-items]')
    const history = $('[data-household-replenishment-history]')
    if (!metas) {
      place.innerHTML = `<div class="household-empty" role="alert">A javaslatok fiókhoz kötött tárolása nem elérhető. ${escape(replenishmentError)} A készlet és a listák változatlanok.</div>`
      history.innerHTML = ''
      $('[data-household-move-selected]').disabled = true
      return
    }
    const proposals = allSuggestions(current, metas)
    const active = proposals.filter(row => row.status === 'active')
    const historyRows = proposals.filter(row => row.status !== 'active')
    const currently = new Set(active.map(row => JSON.stringify([row.key, row.cycleId])))
    selectedSuggestions = new Set([...selectedSuggestions].filter(id => currently.has(id)))
    for (const id of forecastAmounts.keys()) if (!currently.has(id)) forecastAmounts.delete(id)
    const proposalRow = row => {
      const id = JSON.stringify([row.key, row.cycleId])
      const forecast = row.kind === 'forecast'
      const date = forecast ? new Intl.DateTimeFormat('hu-HU', {month:'short',day:'numeric'}).format(new Date(row.predictedAt)) : ''
      return `<article class="household-proposal ${forecast ? 'household-proposal-forecast' : ''}">
        <label class="household-proposal-check">
          <input type="checkbox" data-household-suggestion-pick="${escape(id)}" ${selectedSuggestions.has(id) ? 'checked' : ''} aria-label="${escape(row.name)} kijelölése">
          <span class="household-proposal-copy"><strong>${escape(row.name)}${forecast ? '' : ` · ${escape(String(row.quantity))} ${escape(row.unit)}`}</strong>
            <small>${forecast ? `Várható újravásárlás: kb. ${escape(date)} · ${escape(String(row.observations))} korábbi vásárlás alapján. NEM igazolt hiány.` : 'Igazoltan elfogyott · javasolt pótlás'}</small>
          </span>
        </label>
        ${forecast ? `<label class="household-forecast-amount">Mennyiség (opcionális, nem becsüljük)<input type="number" min="0.001" step="any" inputmode="decimal" data-household-forecast-amount="${escape(id)}" value="${escape(forecastAmounts.get(id) || '')}" placeholder="Mennyiség, ${escape(row.unit)}" aria-label="${escape(row.name)} vásárolandó mennyisége"></label>` : ''}
        <button type="button" class="household-proposal-dismiss" data-household-dismiss-key="${escape(row.key)}" data-household-dismiss-cycle="${escape(row.cycleId)}" aria-label="${escape(row.name)} javaslat elvetése" title="Most nem">✕</button>
      </article>`
    }
    const confirmed = active.filter(row => row.kind !== 'forecast')
    const forecasted = active.filter(row => row.kind === 'forecast')
    place.innerHTML = (confirmed.length ? `<h2 class="household-proposal-section-title">Igazolt készlethiány</h2>${confirmed.map(proposalRow).join('')}` : '') +
      (forecasted.length ? `<h2 class="household-proposal-section-title">Várható újravásárlás · becslés</h2><p class="household-replenishment-muted">Csak vásárlási gyakoriság. Nem bizonyítja a kifogyást, és mennyiséget sem választ helyetted.</p>${forecasted.map(proposalRow).join('')}` : '') ||
      '<div class="household-empty">Most nincs aktív pótlási javaslat. Bizonytalan készletből nem számítunk biztos hiányt, rendszertelen vásárlásból pedig nem készítünk előrejelzést.</div>'
    history.innerHTML = historyRows.length ? historyRows.map(row =>
      `<article class="household-proposal-history"><span><strong>${escape(row.name)}</strong>
        <small>${row.kind === 'forecast' ? 'Becsült újravásárlás · ' : ''}${row.status === 'dismissed' ? 'Elvetve az X-szel' : row.status === 'archived' ? '30 nap után archiválva' : 'Már szerepel egy bevásárlólistán'}</small></span>
        ${row.status === 'dismissed' && !row.archived ?
          `<button type="button" data-household-restore-key="${escape(row.key)}" data-household-restore-cycle="${escape(row.cycleId)}">Visszaállítás</button>` : ''}
      </article>`).join('') : '<p class="household-replenishment-muted">Még nincs korábbi javaslat.</p>'
    $('[data-household-move-selected]').disabled = suggestionsBusy || selectedSuggestions.size === 0
    $('[data-household-move-selected]').textContent = selectedSuggestions.size
      ? `${selectedSuggestions.size} kijelölt listára` : 'Válassz egy terméket'
  }
  async function dismissReplenishment(key, cycleId, restore = false) {
    if (!replenishment) return
    const epoch = loadEpoch
    try {
      if (restore) await replenishment.restore({key,cycleId})
      else await replenishment.dismiss({key,cycleId})
      if (epoch === loadEpoch && store) {
        selectedSuggestions.delete(JSON.stringify([key,cycleId]))
        render()
        alert(restore ? 'Javaslat visszaállítva.' : 'Javaslat elvetve. Új igazolt vásárlási vagy fogyási ciklusig nem tér vissza.')
      }
    } catch (err) { if(epoch===loadEpoch) alert(err.message,true) }
  }
  async function moveSelectedReplenishment() {
    if (!replenishment || !store || suggestionsBusy) return
    const epoch = loadEpoch
    const owner = store
    const target = $('[data-household-suggestion-list]').value
    if (!replenishment.getState().lists.some(list => list.id === target)) return
    suggestionsBusy = true
    let moved = 0
    try {
      await replenishment.assertOwner()
      for (const id of [...selectedSuggestions]) {
        if (epoch !== loadEpoch || store !== owner) break
        const proposal = allSuggestions(owner.getState(), replenishment.getState())
          .find(row => JSON.stringify([row.key,row.cycleId]) === id && row.status === 'active')
        if (!proposal) { selectedSuggestions.delete(id); continue }
        const exists = owner.getState().shopping.some(row => row.status !== 'checked' &&
          row.name.trim().toLocaleLowerCase('hu-HU') === proposal.name.trim().toLocaleLowerCase('hu-HU') &&
          (proposal.kind === 'forecast' || row.dimension === proposal.dimension))
        if (exists) { selectedSuggestions.delete(id); continue }
        const isForecast = proposal.kind === 'forecast'
        const entered = isForecast ? (forecastAmounts.get(id) || '').trim() : String(proposal.quantity)
        if (entered && (!Number.isFinite(Number(entered.replace(',', '.'))) || Number(entered.replace(',', '.')) <= 0)) {
          alert('A megadott mennyiség legyen pozitív, vagy hagyd üresen.', true)
          break
        }
        const result = await run('ShoppingItemAdded', {
          name: proposal.name, quantity: entered ? entered.replace(',', '.') : '',
          unit: proposal.unit, listId: target,
        }, operationId())
        if (!result) break
        moved++
        selectedSuggestions.delete(id)
        forecastAmounts.delete(id)
      }
      if (epoch === loadEpoch && store === owner) {
        selectedList = target
        alert(moved ? `${moved} javaslat a kiválasztott bevásárlólistára került. A készlet csak akkor nő, ha megveszed.` :
          'Nem került új tétel listára.', false)
      }
    } catch(err) { if(epoch===loadEpoch) alert(err.message,true) }
    finally { suggestionsBusy = false; if (epoch===loadEpoch && store===owner) render() }
  }

  function render() {
    if (!store) return
    const current = state()
    $('[data-household-inventory]').hidden = tab !== 'inventory'
    $('[data-household-shopping]').hidden = tab !== 'shopping'
    if (freshOwnerMode) $('[data-household-replenishment]').hidden = tab !== 'replenishment'
    if (freshOwnerMode) { $('[data-household-advice]').hidden = tab !== 'advice'; $('[data-household-receipts]').hidden = tab !== 'receipts' }
    root.querySelectorAll('[data-household-tab]').forEach(node => { node.setAttribute('aria-selected', String(node.dataset.householdTab === tab)); node.classList.toggle('is-active', node.dataset.householdTab === tab) })
    root.querySelectorAll('[data-household-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.householdFilter === filter))
    const lots = current.inventory.filter(lot => (filter === 'all' || lot.storageLocation === filter) && lot.name.toLocaleLowerCase('hu-HU').includes(search))
    $('[data-household-lots]').innerHTML = lots.length ? lots.map(lot => `<article class="household-card"><div><strong>${escape(lot.name)}</strong><p>${escape(displayQuantity(lot))}${lot.storageLocation && lot.storageLocation !== "untracked" ? ` · ${placeNames[lot.storageLocation]}` : ""} · készleten ${escape(lot.observedAt.slice(0, 10))}</p><small>${escape(expiryLabel(lot))}</small></div><div class="household-card-actions"><button type="button" data-household-edit="${escape(lot.id)}">Szerkesztés</button>${lot.storageLocation !== "untracked" ? `<button type="button" data-household-split-id="${escape(lot.id)}">Haladó elosztás</button>` : ""}<button type="button" data-household-delete="${escape(lot.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">Itt még nincs ismert élelmiszer. Adj hozzá egy megerősített mennyiséget.</div>'
    if (freshOwnerMode) $('[data-household-prepared]').innerHTML = current.prepared?.length
      ? current.prepared.map(lot => `<article class="household-card"><strong>${escape(lot.name)}</strong><p>${escape(lot.portionsRemaining)} ${lot.portionUnit === 'slice' ? 'szelet' : lot.portionUnit === 'piece' ? 'darab' : 'adag'} · ${lot.storageLocation !== "untracked" ? placeNames[lot.storageLocation] + " · " : ""}kézzel igazolt főzés</p><small>A készétel-adagok kézi, már mentett Food-étkezéshez rendelhetők; a nyers alapanyag nem vonódik le újra.</small>${lot.recipeRef && lot.portionsRemaining ? `<div class="household-card-actions"><button type="button" data-household-link-prepared="${escape(lot.id)}">Étkezés hozzárendelése</button></div>` : ""}</article>`).join('')
      : '<div class="household-empty">Még nincs megerősített készétel.</div>'
    const visibleShopping = current.shopping.filter(item => !freshOwnerMode || (item.listId || DEFAULT_SHOPPING_LIST_ID) === selectedList)
    if (freshOwnerMode) renderReplenishment(current)
    $('[data-household-items]').innerHTML = visibleShopping.length ? visibleShopping.map(item => `<article class="household-card"><div><strong>${escape(item.name)}</strong><p>${escape(displayQuantity(item))} · ${statusNames[item.status]}${item.status === "checked" ? item.stockIntakeEventId ? " · automatikusan készleten" : " · mennyiség nélkül még nem került készletre" : ""}</p></div><div class="household-card-actions"><button type="button" data-household-check="${escape(item.id)}">${item.status === 'checked' ? 'Vissza a listára' : '✓ Megvettem'}</button><button type="button" data-household-defer="${escape(item.id)}">Később</button><button type="button" data-household-edit-shopping="${escape(item.id)}">Szerkesztés</button><button type="button" data-household-delete-shopping="${escape(item.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">A bevásárlólista üres. Új listaelemet a fenti gombbal vehetsz fel.</div>'
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
    if (freshOwnerMode) {
      const items = $('[data-household-receipt-items]')
      if (receipts.status === 'loading') items.innerHTML = '<div class="household-empty">Saját Pénzügy-bizonylatok olvasása…</div>'
      else if (receipts.status === 'error') items.innerHTML = '<div class="household-empty" role="alert">A saját Pénzügy-bizonylatok nem olvashatók.</div>'
      else if (!receipts.rows.length) items.innerHTML = '<div class="household-empty">Nincs saját mentett képes bizonylat. A végösszegből nem lesz készlet.</div>'
      else items.innerHTML = receipts.rows.map(row => `<article class="household-card"><strong>${escape(row.name)}</strong><p>${escape(row.date)} · ${row.imageAvailable ? 'Képes bizonylat' : 'PDF: tételes beolvasás nem támogatott'}</p>${row.imageAvailable ? `<div class="household-card-actions"><button type="button" data-household-scan-receipt="${escape(row.id)}">Képes blokk OCR-olvasása</button></div>` : ''}</article>`).join('')
      const candidateCard = item => {
        const used = current.events.some(event => event.sourceType === 'finance-receipt' && event.sourceId === item.sourceId)
        return `<article class="household-card"><strong>${escape(item.name || 'Nem azonosított sor')}</strong><p>${item.quantity == null ? 'Mennyiség nem ismert · kézi megadás kell' : `${escape(item.quantity)} ${escape(item.unit)}`} · ${item.lineNumber}. sor</p><small>${escape(item.rawLine)}</small><div class="household-card-actions"><button type="button" data-household-review-receipt="${escape(item.sourceId)}" ${used ? 'disabled' : ''}>${used ? 'Már bevételezve' : 'Ellenőrzés és bevételezés'}</button></div></article>`
      }
      const normal = receiptCandidates.filter(item => item.status !== 'raw')
      const raw = receiptCandidates.filter(item => item.status === 'raw')
      $('[data-household-receipt-candidates]').innerHTML = receiptCandidates.length
        ? `<h2 class="household-section-title">Javasolt sorok · ellenőrizendő</h2>${normal.map(candidateCard).join('')}${raw.length ? `<details data-household-unmatched-receipt><summary>Ismeretlen OCR-sorok (${raw.length})</summary>${raw.map(candidateCard).join('')}</details>` : ''}` : ''
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
      if (kind === 'shopping' && freshOwnerMode) selectedList = record.listId || DEFAULT_SHOPPING_LIST_ID
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
  async function openDiaryLink(preparedId) {
    if (!linkForm || !store) return
    closeForms()
    const session = store
    const epoch = loadEpoch
    const request = ++linkReadSeq
    const prepared = session.getState().prepared.find(lot => lot.id === preparedId)
    if (!prepared?.recipeRef || prepared.portionsRemaining <= 0) { alert("Nincs kapcsolható készétel.", true); return }
    alert("A saját Food-napló ellenőrzése…")
    try {
      const { openGrapesTestFreshFood } = await import("../food/grapes-test-fresh-food.js")
      const { eligibleSavedFoodDiaryEntries } = await import("./home-food-diary-link.js")
      const food = await openGrapesTestFreshFood({enabled: true})
      if (food.ownerId !== session.ownerId) throw new Error("A Food és Home fiók eltér.")
      const project = await food.load()
      await food.assertOwner()
      await session.assertOwner()
      if (epoch !== loadEpoch || session !== store || request !== linkReadSeq) return
      const currentPrepared = session.getState().prepared.find(lot => lot.id === preparedId)
      const matches = eligibleSavedFoodDiaryEntries(project, session.ownerId, currentPrepared, session.getState().events)
      if (!matches.length) { alert("Nincs megfelelő, korábban mentett saját Food-étkezés; előbb naplózd a recept adagját a Foodban.", true); return }
      linking = {preparedId, operationId: operationId()}
      linkedCandidates = matches
      linkForm.elements.foodEntryId.replaceChildren(...matches.map(entry => new Option(`${entry.occurredAt.slice(0,10)} · ${entry.portions} adag`, entry.entryId)))
      $("[data-household-diary-source]").textContent = `${currentPrepared.name} · ${currentPrepared.portionsRemaining} adag maradt.`
      linkForm.hidden = false
      previewDiaryLink()
      linkForm.scrollIntoView({block:"nearest"})
      alert("")
    } catch(err) {
      if (epoch !== loadEpoch || session !== store || request !== linkReadSeq) return
      try { await session.assertOwner(); alert(err.message, true) } catch { clearFreshHome() }
    }
  }
  function previewDiaryLink() {
    if (!linkForm || !linking) return
    const entry = linkedCandidates.find(entry => entry.entryId === linkForm.elements.foodEntryId.value)
    const lot = state().prepared.find(lot => lot.id === linking.preparedId)
    $("[data-household-diary-preview]").textContent = entry && lot
      ? `${entry.portions} adag levonása: ${lot.portionsRemaining} → ${lot.portionsRemaining - entry.portions} adag. Mentés csak megerősítés után.`
      : "A Food-bejegyzés már nem kapcsolható."
  }
  async function refreshReceipts() {
    if (!freshOwnerMode || !store) return
    const current = store, epoch=loadEpoch, request=++receiptReadSeq
    receipts = {status:'loading',rows:[]}
    receiptCandidates = []
    render()
    try {
      const rows = await current.listReceipts()
      if (epoch!==loadEpoch || current!==store || request!==receiptReadSeq) return
      receipts = {status:'ready',rows}
    } catch(err) {
      if (epoch!==loadEpoch || current!==store || request!==receiptReadSeq) return
      try { await current.assertOwner(); receipts = {status:'error',rows:[]} } catch { clearFreshHome(); return }
    }
    render()
  }
  async function scanReceipt(id) {
    if (!freshOwnerMode || !store) return
    closeForms()
    const current=store, epoch=loadEpoch, request=++receiptReadSeq
    receiptCandidates=[]
    render()
    alert('Képes blokk helyi OCR-olvasása folyamatban…')
    try {
      const result = await current.scanReceipt(id)
      if (epoch!==loadEpoch || current!==store || request!==receiptReadSeq) return
      receiptCandidates=result.candidates
      render()
      alert(receiptCandidates.length ? 'A felismert sorok csak javítható javaslatok, készlet nem változott.' : 'Nincs felismerhető terméksor; végösszegből nem lesz készlet.',!receiptCandidates.length)
    } catch(err) {
      if (epoch!==loadEpoch || current!==store || request!==receiptReadSeq) return
      try { await current.assertOwner(); alert(err.message,true) } catch { clearFreshHome() }
    }
  }
  function reviewReceipt(sourceId) {
    const row=receiptCandidates.find(candidate=>candidate.sourceId===sourceId)
    if (!row || state().events.some(event=>event.sourceType==='finance-receipt' && event.sourceId===sourceId)) { alert('Ez a blokksor már feldolgozott vagy nem elérhető.',true); return }
    closeForms()
    receiptSelected=row
    receiptOperationId=operationId()
    receiptForm.reset()
    receiptForm.elements.name.value=row.name
    receiptForm.elements.quantity.value=row.quantity==null ? '' : String(row.quantity)
    receiptForm.elements.unit.value=row.unit || ''
    receiptForm.elements.storageLocation.value='untracked'
    $('[data-household-receipt-source]').textContent = `Pénzügy blokk: ${row.receiptId} · ${row.lineNumber}. sor · ${row.rawLine}`
    receiptForm.hidden=false
    receiptForm.scrollIntoView({block:'nearest'})
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (d.householdTab) { tab = d.householdTab; closeForms(); render(); if (tab==='receipts') refreshReceipts().catch(()=>{}) }
    else if (d.householdFilter) { filter = d.householdFilter; render() }
    else if (d.householdCook && freshOwnerMode) openCooking(d.householdCook)
    else if (d.householdLinkPrepared && freshOwnerMode) await openDiaryLink(d.householdLinkPrepared)
    else if (d.householdScanReceipt && freshOwnerMode) await scanReceipt(d.householdScanReceipt)
    else if (d.householdReviewReceipt && freshOwnerMode) reviewReceipt(d.householdReviewReceipt)
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
    else if (d.householdNewList !== undefined && freshOwnerMode) {
      $('[data-household-list-form]').hidden = false
      $('[data-household-list-form] [name=name]').focus()
    }
    else if (d.householdListCancel !== undefined && freshOwnerMode)
      $('[data-household-list-form]').hidden = true
    else if (d.householdDismissKey !== undefined && freshOwnerMode)
      await dismissReplenishment(d.householdDismissKey, d.householdDismissCycle)
    else if (d.householdRestoreKey !== undefined && freshOwnerMode)
      await dismissReplenishment(d.householdRestoreKey, d.householdRestoreCycle, true)
    else if (d.householdMoveSelected !== undefined && freshOwnerMode)
      await moveSelectedReplenishment()
    else if (d.householdAdd) openForm(d.householdAdd)
    else if (d.householdEdit) openForm('inventory', d.householdEdit)
    else if (d.householdEditShopping) openForm('shopping', d.householdEditShopping)
    else if (d.householdCancel !== undefined) closeForms()
    else if (d.householdDelete && confirm('Eltávolítod ezt a készlettételt?')) await run('LotDeleted', { id: d.householdDelete })
    else if (d.householdDeleteShopping && confirm('Eltávolítod ezt a listaelemet?')) await run('ShoppingItemDeleted', { id: d.householdDeleteShopping })
    else if (d.householdCheck) { const item = state().shopping.find(row => row.id === d.householdCheck); if (item) await run('ShoppingItemStatusChanged', { id: item.id, status: item.status === 'checked' ? 'planned' : 'checked' }) }
    else if (d.householdDefer) await run('ShoppingItemStatusChanged', { id: d.householdDefer, status: 'deferred' })
    else if (d.householdSplitId) { closeForms(); splitId = d.householdSplitId; splitOperationId = operationId(); const lot = state().inventory.find(row => row.id === splitId); $('[data-household-split-source]').textContent = `${lot.name} · ${displayQuantity(lot)}. A megosztás tárolóváltás, nem vásárlás.`; for (const option of splitForm.elements.unit.options) option.disabled = UNITS[option.value][0] !== lot.dimension; splitForm.elements.unit.value = lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit; splitForm.elements.fridgeQuantity.value = String(lot.quantityBase / UNITS[splitForm.elements.unit.value][1]); splitForm.hidden = false; previewSplit(); splitForm.scrollIntoView({ block: 'nearest' }) }
    else if (d.householdPreset) { const lot = state().inventory.find(row => row.id === splitId); const p = splitPreset(lot, d.householdPreset); splitForm.elements.fridgeQuantity.value = String(p.fridgeBase / UNITS[splitForm.elements.unit.value][1]); previewSplit() }
    else if (d.householdUndo !== undefined && lastEventId) { const result = await run('Reversed', { eventId: lastEventId }); if (result) { lastEventId = null; render() } }
  })
  $('[data-household-search]').addEventListener('input', event => { search = event.target.value.toLocaleLowerCase('hu-HU'); render() })
  if (freshOwnerMode) {
    root.addEventListener('input', event => {
      if (event.target.matches('[data-household-forecast-amount]'))
        forecastAmounts.set(event.target.dataset.householdForecastAmount, event.target.value)
    })
    root.addEventListener('change', event => {
      if (event.target.matches('[data-household-list-select]')) {
        selectedList = event.target.value; closeForms(); render()
      } else if (event.target.matches('[data-household-suggestion-list]')) {
        selectedList = event.target.value; render()
      } else if (event.target.matches('[data-household-suggestion-pick]')) {
        const id = event.target.dataset.householdSuggestionPick
        if (event.target.checked) selectedSuggestions.add(id)
        else selectedSuggestions.delete(id)
        const button = $('[data-household-move-selected]')
        button.disabled = !selectedSuggestions.size || suggestionsBusy
        button.textContent = selectedSuggestions.size
          ? `${selectedSuggestions.size} kijelölt listára` : 'Válassz egy terméket'
      }
    })
    $('[data-household-list-form]').addEventListener('submit', async event => {
      event.preventDefault()
      if (!replenishment || suggestionsBusy) return
      const label = event.currentTarget.elements.name.value
      const epoch = loadEpoch
      try {
        const data = await replenishment.createList(label)
        if (epoch !== loadEpoch || !store) return
        selectedList = data.lists.at(-1).id
        $('[data-household-list-form]').reset()
        $('[data-household-list-form]').hidden = true
        render()
        alert('Az új bevásárlólista elkészült.')
      } catch (err) { if(epoch===loadEpoch) alert(err.message,true) }
    })
  }
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
      const result = await run(editing.id ? 'ShoppingItemEdited' : 'ShoppingItemAdded', { ...data, id: editing.id, ...(freshOwnerMode ? { listId: selectedList } : {}) }, formOperationId)
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
  if (linkForm) {
    linkForm.elements.foodEntryId.addEventListener("change", previewDiaryLink)
    linkForm.addEventListener("submit", async event => {
      event.preventDefault()
      if (linkForm.hidden || !linking || linkBusy || !store) return
      const selected = linkedCandidates.find(entry => entry.entryId === linkForm.elements.foodEntryId.value)
      if (!selected || selected.preparedLotId !== linking.preparedId) { alert("Ez az étkezés nem kapcsolható.", true); return }
      const current = store
      const epoch = loadEpoch
      const operation = linking.operationId
      linkBusy = true
      const submit = linkForm.querySelector('button[type="submit"]')
      submit.disabled = true
      try {
        const result = await run("PreparedConsumptionLinked", selected, operation, {
          sourceType:"food-diary", sourceId:`${current.ownerId}:${selected.foodEntryId}`
        })
        if (result && epoch === loadEpoch && current === store) { closeForms(); tab="inventory"; render() }
      } finally { linkBusy = false; submit.disabled = false }
    })
  }
  if (receiptForm) receiptForm.addEventListener('submit',async event=>{
    event.preventDefault()
    if (receiptForm.hidden || !receiptSelected || receiptBusy || !store) return
    const current=store, epoch=loadEpoch, candidate=receiptSelected, operation=receiptOperationId
    receiptBusy=true
    const button=receiptForm.querySelector('button[type="submit"]')
    button.disabled=true
    try {
      const payload={name:receiptForm.elements.name.value,quantity:receiptForm.elements.quantity.value,unit:receiptForm.elements.unit.value,storageLocation:receiptForm.elements.storageLocation.value,receiptId:candidate.receiptId,lineId:candidate.lineId}
      const result=await run('StockReceived',payload,operation,{sourceType:'finance-receipt',sourceId:candidate.sourceId})
      if (result && epoch===loadEpoch && current===store) { closeForms(); tab='inventory'; render() }
    } finally {receiptBusy=false;button.disabled=false}
  })
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
          try {
            const { openHomeReplenishmentStore } = await import('./home-replenishment-store.js')
            const meta = await openHomeReplenishmentStore({ enabled: true })
            if (epoch !== loadEpoch || meta.ownerId !== session.ownerId) return
            replenishment = meta
          } catch (err) { if (epoch === loadEpoch) replenishmentError = err.message }
          if (epoch !== loadEpoch) return
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
      if (!['inventory', 'shopping', ...(freshOwnerMode ? ['advice','receipts','replenishment'] : [])].includes(name)) return
      tab = name
      closeForms()
      render()
    },
    handleBack() {
      if (!form.hidden || !splitForm.hidden || (cookingForm && !cookingForm.hidden) || (linkForm && !linkForm.hidden) || (receiptForm && !receiptForm.hidden)) { closeForms(); return true }
      return false
    },
  }
}
