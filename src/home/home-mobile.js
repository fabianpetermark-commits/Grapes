import { createHomeStore } from './home-store.js'
import { projectOneHomeFamilyPreview } from './home-family-preview-model.js'
import { createHomeFamilyAutoSync } from './home-family-auto-sync.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, UNITS } from './home-data.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
const statusNames = { planned: 'Tervezett', checked: 'Elintézve', deferred: 'Később' }
const units = Object.keys(UNITS).map(unit => `<option value="${unit}">${unit}</option>`).join('')
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createHomeMobile(root, storage, { familyPreview = null, familySync = null } = {}) {
  let store = null
  const familyWritable = familySync?.enabled === true && familySync?.writesEnabled === true
  const familyQA = familyPreview?.enabled === true || familySync?.enabled === true
  let familyState = null
  let familyLoadEpoch = 0
  let familyError = ''
  let familyController = null
  let familyStatus = 'unverified'
  let familyStatusMessage = ''
  let familyStatusCount = 0
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
  let lastSheetTrigger = null
  root.innerHTML = `
    <div class="household-head"><div><h1>Otthonunk</h1><p data-household-source>Helyi adatok · a családi megosztás még nincs bekapcsolva</p></div><button type="button" data-household-share aria-label="Megosztás és jogosultságok">Megosztás</button></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-sync" data-household-sync role="status" aria-live="polite" hidden><span data-household-sync-text></span><button type="button" data-household-sync-retry hidden>Újrapróbálás</button></div>
    <div class="household-totals" aria-label="Otthon aktuális adatai"><div><strong data-household-shopping-count>0</strong><span>Bevásárolandó</span></div><div><strong data-household-inventory-count>0</strong><span>Készleten</span></div><div><strong data-household-suggestion-count>0</strong><span>Igazolt hiány</span></div></div>
    <section class="household-widget" data-household-shopping aria-labelledby="home-shopping-title"><div class="household-widget-head"><h2 id="home-shopping-title">Bevásárlás</h2><button type="button" data-household-add="shopping">+ Listaelem</button></div><div data-household-items></div></section>
    <section class="household-widget" data-household-inventory aria-labelledby="home-inventory-title"><div class="household-widget-head"><h2 id="home-inventory-title">Készlet</h2><button type="button" data-household-add="inventory">+ Készlet</button></div><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"></div><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div><div data-household-lots></div></section>
    <section class="household-widget" data-household-suggestions aria-labelledby="home-suggestions-title"><div class="household-widget-head"><h2 id="home-suggestions-title">Javaslatok</h2></div><div data-household-suggestion-list></div></section>
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>

    <nav class="household-quick" aria-label="Otthon gyorsműveletek"><button type="button" data-household-jump="shopping"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.5 13.5a2 2 0 0 0 2 1.6H20a2 2 0 0 0 2-1.6L23 6H6"/></svg><span>Bevásárlás</span></button><button type="button" data-household-jump="inventory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v9l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/></svg><span>Készlet</span></button><button type="button" data-household-share><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Megosztás</span></button><button type="button" class="household-quick-add" data-household-add="shopping" aria-label="Listaelem hozzáadása">+</button></nav>
    <div class="household-sheet-backdrop" data-household-sheet-backdrop hidden></div>
    <form class="household-form household-sheet" data-household-form role="dialog" aria-modal="true" aria-labelledby="home-form-title" hidden><h2 id="home-form-title" data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><label data-household-location-label>Tárolás<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form household-sheet" data-household-split role="dialog" aria-modal="true" aria-labelledby="home-split-title" hidden><h2 id="home-split-title">Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>
    <section class="household-sheet household-share-panel" data-household-share-panel role="dialog" aria-modal="true" aria-labelledby="home-share-title" hidden><h2 id="home-share-title">Megosztás</h2><p data-household-share-details></p><p class="household-share-note">A családi meghívók és tagság kezelése külön funkció. Ez a panel nem változtat meg semmilyen jogosultságot.</p><div class="household-actions"><button type="button" data-household-cancel>Bezárás</button></div></section>`

  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  const sharePanel = $('[data-household-share-panel]')
  const backdrop = $('[data-household-sheet-backdrop]')
  const showSheet = (node, trigger) => {
    lastSheetTrigger = trigger || root.ownerDocument.activeElement
    backdrop.hidden = false
    node.hidden = false
    node.querySelector('input:not([type="hidden"]), select, button')?.focus({ preventScroll:true })
  }
  // Never promote remote v2 into the local v1 store. One Home UI, two
  // physically separate stores, with only one explicitly selected for display.
  const state = () => familyQA ? (familyState || { inventory:[], shopping:[] }) : store.getState()
  const alert = (text, isError = false) => { message = isError ? '' : text; error = isError ? text : ''; const node = $('[data-household-alert]'); node.hidden = !text; node.textContent = text; node.classList.toggle('is-error', isError) }
  const run = (type, payload, eventId) => {
    if (!store) return
    if (familyQA) {
      if (!familyWritable || !familyController || !familyState) {
        alert('A közös Otthon most csak olvasható vagy még nincs ellenőrizve.', true)
        return null
      }
      // Never dispatch a shared event into the PROD local v1 Home journal.
      const id = eventId || globalThis.crypto?.randomUUID?.()
      if (!id) { alert('A biztonságos műveletazonosító nem érhető el.', true); return null }
      return familyController.queue({ type, payload, eventId:id })
        .then(job => ({ event:{ eventId:job.operationId }, duplicate:false }))
        .catch(err => { alert(err.message, true); return null })
    }
    try {
      const result = store.dispatch({ type, payload, ...(eventId ? { eventId } : {}) })
      if (!result.duplicate) lastEventId = result.event.eventId
      alert(result.duplicate ? 'A művelet már végrehajtva.' : 'Mentve ezen az eszközön.')
      render()
      return result
    } catch (err) { alert(err.message, true); return null }
  }
  const closeForms = () => {
    form.hidden = true
    splitForm.hidden = true
    sharePanel.hidden = true
    backdrop.hidden = true
    editing = null; splitId = null; formOperationId = null; splitOperationId = null
    const previous = lastSheetTrigger
    lastSheetTrigger = null
    if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll:true })
  }
  function render() {
    if (!store) return
    const current = state()
    const source = $('[data-household-source]')
    if (source) source.textContent = familyQA
      ? familyState
        ? `TEST közös Otthon · revízió ${familyState.revision} · ${familyWritable ? 'családi szinkron' : 'csak olvasás'}`
        : familyError || 'TEST közös Otthon ellenőrzése'
      : 'Helyi adatok · a családi megosztás még nincs bekapcsolva'
    root.dataset.homeSource = familyQA
      ? (familyState ? (familyWritable ? 'family-test-outbox' : 'family-test-readonly') : 'family-test-unverified')
      : 'local'
    const syncBar = $('[data-household-sync]')
    syncBar.hidden = !familyWritable
    if (familyWritable) {
      syncBar.dataset.status = familyStatus
      $('[data-household-sync-text]').textContent = familyStatusMessage
      $('[data-household-sync-retry]').hidden = familyStatus !== 'pending'
      $('[data-household-sync-retry]').disabled = familyStatus !== 'pending'
    }
    root.querySelectorAll('[data-household-share]').forEach(node => {
      // Never advertise a working family feature in the PROD local-only Home.
      // A real, verified TEST family can inspect its role; invites remain gated.
      node.disabled = !familyQA || !familyState
      node.setAttribute('aria-label', 'Megosztás és jogosultságok')
      node.title = node.disabled
        ? 'A családi megosztás ezen az Otthonon még nem elérhető.'
        : 'Közös Otthon és hozzáférési szint'
    })
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
      // TEST preview stays inert. In explicit TEST write mode, only the
      // verified editor/owner with no pending/conflict operation may write.
      const readOnly = !familyWritable || !familyState ||
        !['owner','editor'].includes(familyState.role) ||
        ['pending','conflict','unverified','checking'].includes(familyStatus)
      root.querySelectorAll(
        '[data-household-add], [data-household-check], [data-household-defer], ' +
        '[data-household-edit], [data-household-edit-shopping], ' +
        '[data-household-delete], [data-household-delete-shopping], ' +
        '[data-household-split-id], [data-household-suggestion-add], ' +
        '[data-household-undo], [data-household-preset]'
      ).forEach(button => { button.disabled = readOnly })
    }
  }
  function openForm(kind, id = null, trigger = null) {
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
    showSheet(form, trigger)
    form.elements.name.focus({ preventScroll:true })
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
    if (event.target === backdrop) { closeForms(); return }
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (d.householdSyncRetry !== undefined) {
      void familyController?.retry()
      return
    }
    if (familyQA && !familyWritable && !d.householdJump && !d.householdFilter &&
        d.householdCancel === undefined && d.householdShare === undefined) {
      alert('A közös Otthon TEST-előnézete még csak olvasható.', true)
      return
    }
    if (d.householdShare !== undefined) {
      closeForms()
      $('[data-household-share-details]').textContent = familyQA
        ? familyState
          ? 'Közös családi Otthon. Jogosultság: ' +
            ({ owner:'Tulajdonos', editor:'Szerkesztő', viewer:'Megtekintő' }[familyState.role] || 'Ellenőrzés szükséges') +
            '. A bevásárlás és a készlet a családtagok között szinkronizálódik.'
          : 'A családi Otthon még nincs hitelesítve. Meghívás nem indítható.'
        : 'Ez az Otthon jelenleg ezen az eszközön tárolja az adatokat. A megosztás nincs bekapcsolva.'
      showSheet(sharePanel, button)
    }
    else if (d.householdJump) { $('[data-household-' + d.householdJump + ']').scrollIntoView({ block: 'start', behavior: 'smooth' }) }
    else if (d.householdSuggestionAdd) {
      const lot = state().inventory.find(row => row.id === d.householdSuggestionAdd && row.quantityBase === 0 && row.evidenceStatus === 'confirmed')
      if (lot && !state().shopping.some(item => item.status !== 'checked' && item.name.trim().toLocaleLowerCase('hu-HU') === lot.name.trim().toLocaleLowerCase('hu-HU'))) run('ShoppingItemAdded', { name: lot.name, quantity: '', unit: lot.displayUnit })
    }
    else if (d.householdFilter) { filter = d.householdFilter; render() }
    else if (d.householdAdd) openForm(d.householdAdd, null, button)
    else if (d.householdEdit) openForm('inventory', d.householdEdit, button)
    else if (d.householdEditShopping) openForm('shopping', d.householdEditShopping, button)
    else if (d.householdCancel !== undefined) closeForms()
    else if (d.householdDelete && confirm('Eltávolítod ezt a készlettételt?')) run('LotDeleted', { id: d.householdDelete })
    else if (d.householdDeleteShopping && confirm('Eltávolítod ezt a listaelemet?')) run('ShoppingItemDeleted', { id: d.householdDeleteShopping })
    else if (d.householdCheck) { const item = state().shopping.find(row => row.id === d.householdCheck); run('ShoppingItemStatusChanged', { id: item.id, status: item.status === 'checked' ? 'planned' : 'checked' }) }
    else if (d.householdDefer) run('ShoppingItemStatusChanged', { id: d.householdDefer, status: 'deferred' })
    else if (d.householdSplitId) { closeForms(); splitId = d.householdSplitId; splitOperationId = operationId(); const lot = state().inventory.find(row => row.id === splitId); $('[data-household-split-source]').textContent = `${lot.name} · ${displayQuantity(lot)}. A megosztás tárolóváltás, nem vásárlás.`; for (const option of splitForm.elements.unit.options) option.disabled = UNITS[option.value][0] !== lot.dimension; splitForm.elements.unit.value = lot.dimension === 'mass' ? 'g' : lot.dimension === 'volume' ? 'ml' : lot.displayUnit; splitForm.elements.fridgeQuantity.value = String(lot.quantityBase / UNITS[splitForm.elements.unit.value][1]); showSheet(splitForm, button); previewSplit() }
    else if (d.householdPreset) { const lot = state().inventory.find(row => row.id === splitId); const p = splitPreset(lot, d.householdPreset); splitForm.elements.fridgeQuantity.value = String(p.fridgeBase / UNITS[splitForm.elements.unit.value][1]); previewSplit() }
    else if (d.householdUndo !== undefined && lastEventId) { const result = run('Reversed', { eventId: lastEventId }); if (result) { lastEventId = null; render() } }
  })
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (!form.hidden || !splitForm.hidden || !sharePanel.hidden)) {
      event.preventDefault()
      closeForms()
    }
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
    familyController?.dispose()
    familyController = null
    familyState = null
    familyStatus = 'unverified'
    familyStatusMessage = ''
    familyStatusCount = 0
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
        // PROD passes NO TEST gate. The approved UI and v1 persistence remain
        // unchanged until the native TEST owner handoff has been validated.
        if (familySync?.enabled === true) {
          const epoch = familyLoadEpoch
          try {
            familyController = createHomeFamilyAutoSync({
              sync:familySync.sync,
              householdId:familySync.householdId,
              expectedUserId:familySync.expectedUserId,
              getActiveOwner:familySync.getActiveOwner,
              onChange(next) {
                if (epoch !== familyLoadEpoch || !store) return
                familyState = next.snapshot
                familyStatus = next.status
                familyStatusMessage = next.message
                familyStatusCount = next.count
                familyError = next.status === 'unverified' ? next.message : ''
                // A delayed A→B invalidation must close any open modal too;
                // otherwise a stale form/share role could remain on-screen.
                if (next.status === 'unverified' || next.status === 'conflict') closeForms()
                if (next.status !== 'unverified') alert('')
                render()
              },
            })
            alert('')
            familyController.start()
          } catch (err) {
            familyError = 'A családi szinkron nem indítható: ' + err.message
            familyStatus = 'unverified'
            familyStatusMessage = familyError
            render()
            alert(familyError, true)
          }
          return
        }
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
      if (!form.hidden || !splitForm.hidden || !sharePanel.hidden) { closeForms(); return true }
      return false
    },
  }
}
