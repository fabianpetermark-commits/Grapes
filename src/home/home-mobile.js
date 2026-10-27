import { createHomeStore } from './home-store.js'
import { projectOneHomeFamilyPreview } from './home-family-preview-model.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, UNITS } from './home-data.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
const statusNames = { planned: 'Tervezett', checked: 'Elintézve', deferred: 'Később' }
const units = Object.keys(UNITS).map(unit => `<option value="${unit}">${unit}</option>`).join('')
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createHomeMobile(root, storage, { familyPreview = null } = {}) {
  let store = null
  const familyQA = familyPreview?.enabled === true
  let familyState = null
  let familyLoadEpoch = 0
  let familyError = ''
  // Approved One Home screen: all three real widgets visible simultaneously.
  let filter = 'all'
  let search = ''
  let editing = null
  let splitId = null
  let formOperationId = null
  let splitOperationId = null
  let lastEventId = null
  let message = ''
  let error = ''
  root.innerHTML = `
    <div class="household-head"><div><h1>Otthonunk</h1><p data-household-source>Helyi adatok · a családi megosztás még nincs bekapcsolva</p></div><button type="button" data-household-share disabled title="A családi megosztás Supabase-integráció után kapcsolható be">1 fő</button></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-totals" aria-label="Otthon aktuális adatai"><div><strong data-household-shopping-count>0</strong><span>Bevásárolandó</span></div><div><strong data-household-inventory-count>0</strong><span>Készleten</span></div><div><strong data-household-suggestion-count>0</strong><span>Igazolt hiány</span></div></div>
    <section class="household-widget" data-household-shopping aria-labelledby="home-shopping-title"><div class="household-widget-head"><h2 id="home-shopping-title">Bevásárlás</h2><button type="button" data-household-add="shopping">+ Listaelem</button></div><div data-household-items></div></section>
    <section class="household-widget" data-household-inventory aria-labelledby="home-inventory-title"><div class="household-widget-head"><h2 id="home-inventory-title">Készlet</h2><button type="button" data-household-add="inventory">+ Készlet</button></div><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"></div><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div><div data-household-lots></div></section>
    <section class="household-widget" data-household-suggestions aria-labelledby="home-suggestions-title"><div class="household-widget-head"><h2 id="home-suggestions-title">Javaslatok</h2></div><div data-household-suggestion-list></div></section>
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>
    <nav class="household-quick" aria-label="Otthon gyorsműveletek"><button type="button" data-household-jump="shopping">Bevásárlás</button><button type="button" data-household-jump="inventory">Készlet</button><button type="button" data-household-share disabled title="Családi megosztás később">Megosztás</button><button type="button" class="household-quick-add" data-household-add="shopping" aria-label="Listaelem hozzáadása">+</button></nav>
    <form class="household-form" data-household-form hidden><h2 data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><label data-household-location-label>Tárolás<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form" data-household-split hidden><h2>Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>`

  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  // Never promote remote v2 into the local v1 store. One Home UI, two
  // physically separate stores, with only one explicitly selected for display.
  const state = () => familyState || store.getState()
  const alert = (text, isError = false) => { message = isError ? '' : text; error = isError ? text : ''; const node = $('[data-household-alert]'); node.hidden = !text; node.textContent = text; node.classList.toggle('is-error', isError) }
  const run = (type, payload, eventId) => {
    if (!store) return
    if (familyQA) {
      alert('A közös Otthon TEST-előnézete még csak olvasható. Nem történt mentés.', true)
      return null
    }
    try {
      const result = store.dispatch({ type, payload, ...(eventId ? { eventId } : {}) })
      if (!result.duplicate) lastEventId = result.event.eventId
      alert(result.duplicate ? 'A művelet már végrehajtva.' : 'Mentve ezen az eszközön.')
      render()
      return result
    } catch (err) { alert(err.message, true); return null }
  }
  const closeForms = () => { form.hidden = true; splitForm.hidden = true; editing = null; splitId = null; formOperationId = null; splitOperationId = null }
  function render() {
    if (!store) return
    const current = state()
    const source = $('[data-household-source]')
    if (source) source.textContent = familyQA
      ? familyState
        ? `TEST közös Otthon · revízió ${familyState.revision} · csak olvasás`
        : familyError || 'TEST közös Otthon ellenőrzése · csak olvasás'
      : 'Helyi adatok · a családi megosztás még nincs bekapcsolva'
    root.dataset.homeSource = familyQA
      ? (familyState ? 'family-test-readonly' : 'family-test-unverified')
      : 'local'
    const memberTag = root.querySelector('[data-household-share]')
    if (memberTag) memberTag.textContent = familyState ? 'TEST' : '1 fő'
    root.querySelectorAll('[data-household-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.householdFilter === filter))
    const lots = current.inventory.filter(lot => (filter === 'all' || lot.storageLocation === filter) && lot.name.toLocaleLowerCase('hu-HU').includes(search))
    $('[data-household-lots]').innerHTML = lots.length ? lots.map(lot => `<article class="household-card"><div><strong>${escape(lot.name)}</strong><p>${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]} · kézi, megerősített ${escape(lot.observedAt.slice(0, 10))}</p><small>${escape(expiryLabel(lot))}</small></div><div class="household-card-actions"><button type="button" data-household-edit="${escape(lot.id)}">Szerkesztés</button><button type="button" data-household-split-id="${escape(lot.id)}">Elosztás</button><button type="button" data-household-delete="${escape(lot.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">Itt még nincs ismert élelmiszer. Adj hozzá egy megerősített mennyiséget.</div>'
    const planned = current.shopping.filter(item => item.status !== 'checked')
    const checked = current.shopping.filter(item => item.status === 'checked')
    const shoppingCard = item => `<article class="household-card"><div><strong>${escape(item.name)}</strong><p>${escape(displayQuantity(item))} · ${statusNames[item.status]} · nem készlet</p></div><div class="household-card-actions"><button type="button" data-household-check="${escape(item.id)}">${item.status === 'checked' ? 'Újra listára' : 'Megvettem'}</button><button type="button" data-household-defer="${escape(item.id)}">Később</button><button type="button" data-household-edit-shopping="${escape(item.id)}">Szerkesztés</button><button type="button" data-household-delete-shopping="${escape(item.id)}">Törlés</button></div></article>`
    $('[data-household-items]').innerHTML = (planned.length ? planned.map(shoppingCard).join('') : '<div class="household-empty">Minden beszerzés elintézve, vagy még üres a lista.</div>') +
      (checked.length ? `<details class="household-done"><summary>Elintézve (${checked.length}) – visszanyitható</summary>${checked.map(shoppingCard).join('')}</details>` : '')
    // Only evidence-backed zero counts can suggest replenishment. No fictitious
    // estimated depletion date or silent stock transfer into the shopping list.
    const plannedNames = new Set(current.shopping.filter(x => x.status !== 'checked').map(x => x.name.trim().toLocaleLowerCase('hu-HU')))
    const missing = current.inventory.filter(lot => lot.quantityBase === 0 && lot.evidenceStatus === 'confirmed' && !plannedNames.has(lot.name.trim().toLocaleLowerCase('hu-HU')))
    $('[data-household-suggestion-list]').innerHTML = missing.length ? missing.map(lot => `<article class="household-suggestion"><div><strong>${escape(lot.name)}</strong><small>Igazolt hiány · megerősített 0 ${escape(lot.displayUnit)}</small></div><button type="button" data-household-suggestion-add="${escape(lot.id)}" aria-label="${escape(lot.name)} felvétele a bevásárlólistára">+ Listára</button></article>`).join('') : '<div class="household-empty">Nincs igazolt hiány. Becsült utánpótlást csak megfelelő fogyási adatok alapján ajánlunk.</div>'
    $('[data-household-shopping-count]').textContent = String(current.shopping.filter(x => x.status === 'planned' || x.status === 'deferred').length)
    $('[data-household-inventory-count]').textContent = String(current.inventory.filter(x => x.quantityBase > 0).length)
    $('[data-household-suggestion-count]').textContent = String(missing.length)
    $('[data-household-undo]').hidden = familyQA || !lastEventId
    if (familyQA) {
      // All controls that write either local v1 or shared v2 are inert;
      // filters, scroll and detail text still work on the SAME three widgets.
      root.querySelectorAll(
        '[data-household-add], [data-household-check], [data-household-defer], ' +
        '[data-household-edit], [data-household-edit-shopping], ' +
        '[data-household-delete], [data-household-delete-shopping], ' +
        '[data-household-split-id], [data-household-suggestion-add], ' +
        '[data-household-undo], [data-household-preset]'
      ).forEach(button => { button.disabled = true })
    }
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
  root.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (familyQA && !d.householdJump && !d.householdFilter &&
        d.householdCancel === undefined) {
      alert('A közös Otthon TEST-előnézete még csak olvasható.', true)
      return
    }
    if (d.householdJump) { $('[data-household-' + d.householdJump + ']').scrollIntoView({ block: 'start', behavior: 'smooth' }) }
    else if (d.householdSuggestionAdd) {
      const lot = state().inventory.find(row => row.id === d.householdSuggestionAdd && row.quantityBase === 0 && row.evidenceStatus === 'confirmed')
      if (lot && !state().shopping.some(item => item.status !== 'checked' && item.name.trim().toLocaleLowerCase('hu-HU') === lot.name.trim().toLocaleLowerCase('hu-HU'))) run('ShoppingItemAdded', { name: lot.name, quantity: '', unit: lot.displayUnit })
    }
    else if (d.householdFilter) { filter = d.householdFilter; render() }
    else if (d.householdAdd) openForm(d.householdAdd)
    else if (d.householdEdit) openForm('inventory', d.householdEdit)
    else if (d.householdEditShopping) openForm('shopping', d.householdEditShopping)
    else if (d.householdCancel !== undefined) closeForms()
    else if (d.householdDelete && confirm('Eltávolítod ezt a készlettételt?')) run('LotDeleted', { id: d.householdDelete })
    else if (d.householdDeleteShopping && confirm('Eltávolítod ezt a listaelemet?')) run('ShoppingItemDeleted', { id: d.householdDeleteShopping })
    else if (d.householdCheck) { const item = state().shopping.find(row => row.id === d.householdCheck); run('ShoppingItemStatusChanged', { id: item.id, status: item.status === 'checked' ? 'planned' : 'checked' }) }
    else if (d.householdDefer) run('ShoppingItemStatusChanged', { id: d.householdDefer, status: 'deferred' })
    else if (d.householdSplitId) { closeForms(); splitId = d.householdSplitId; splitOperationId = operationId(); const lot = state().inventory.find(row => row.id === splitId); $('[data-household-split-source]').textContent = `${lot.name} · ${displayQuantity(lot)}. A megosztás tárolóváltás, nem vásárlás.`; for (const option of splitForm.elements.unit.options) option.disabled = UNITS[option.value][0] !== lot.dimension; splitForm.elements.unit.value = lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit; splitForm.elements.fridgeQuantity.value = String(lot.quantityBase / UNITS[splitForm.elements.unit.value][1]); splitForm.hidden = false; previewSplit(); splitForm.scrollIntoView({ block: 'nearest' }) }
    else if (d.householdPreset) { const lot = state().inventory.find(row => row.id === splitId); const p = splitPreset(lot, d.householdPreset); splitForm.elements.fridgeQuantity.value = String(p.fridgeBase / UNITS[splitForm.elements.unit.value][1]); previewSplit() }
    else if (d.householdUndo !== undefined && lastEventId) { const result = run('Reversed', { eventId: lastEventId }); if (result) { lastEventId = null; render() } }
  })
  $('[data-household-search]').addEventListener('input', event => { search = event.target.value.toLocaleLowerCase('hu-HU'); render() })
  splitForm.elements.fridgeQuantity.addEventListener('input', previewSplit)
  splitForm.elements.unit.addEventListener('change', previewSplit)
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
  async function refreshFamilyPreview(epoch) {
    const ownerCheck = async () => {
      const expected = String(familyPreview.expectedUserId || '').toLowerCase()
      const active = await familyPreview.getActiveOwner()
      if (!expected || String(active || '').toLowerCase() !== expected)
        throw new Error('Fiókváltás: a korábbi közös Otthon nem látható.')
    }
    try {
      if (typeof familyPreview.getActiveOwner !== 'function' ||
          typeof familyPreview.gateway?.read !== 'function')
        throw new Error('A családi TEST-kapu nem hitelesített.')
      await ownerCheck()
      const snapshot = await familyPreview.gateway.read(familyPreview.householdId)
      await ownerCheck()
      if (epoch !== familyLoadEpoch || !store) return
      const verified = projectOneHomeFamilyPreview(snapshot, familyPreview.householdId)
      familyState = verified
      familyError = ''
      alert('A közös Otthon TEST-adatainak visszaolvasása sikeres; módosítás még nem engedélyezett.')
    } catch {
      if (epoch !== familyLoadEpoch || !store) return
      familyState = null
      familyError = 'A közös TEST Otthon nem ellenőrizhető. A helyi Home megőrizve; nincs felhőszinkron.'
      alert(familyError, true)
    }
    render()
  }
  function invalidateFamilyPreview() {
    familyLoadEpoch++
    familyState = null
    if (familyQA) {
      familyError = 'A korábbi családi munkamenet lezárult. Új ellenőrzés szükséges.'
      closeForms()
      if (store) render()
      alert(familyError, true)
    }
  }
  return {
    load() {
      invalidateFamilyPreview()
      try {
        store = createHomeStore(storage)
        root.querySelectorAll('.household-widget').forEach(node => { node.hidden = false })
        alert(message || '', !!error)
        render()
        // An injected authenticated TEST-only gate activates the existing
        // One Home widgets for read-only family data. PROD passes no gate.
        if (familyQA) return refreshFamilyPreview(familyLoadEpoch)
      } catch (err) {
        store = null
        closeForms()
        root.querySelectorAll('.household-widget').forEach(node => { node.hidden = true })
        $('[data-household-undo]').hidden = true
        alert(err.message, true)
      }
    },
    invalidateFamilyPreview,
    openTab(name) {
      if (name !== 'inventory' && name !== 'shopping') return
      closeForms()
      $('[data-household-' + name + ']').scrollIntoView({ block: 'start' })
    },
    handleBack() {
      if (!form.hidden || !splitForm.hidden) { closeForms(); return true }
      return false
    },
  }
}
