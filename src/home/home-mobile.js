import { createHomeStore } from './home-store.js'
import { displayQuantity, expiryLabel, splitPreset, splitPreview, UNITS } from './home-data.js'
import { createHomeM2Mobile } from './home-m2-mobile.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const placeNames = { fridge: 'Hűtő', freezer: 'Fagyasztó', pantry: 'Kamra' }
const statusNames = { planned: 'Tervezett', checked: 'Elintézve', deferred: 'Később' }
const units = Object.keys(UNITS).map(unit => `<option value="${unit}">${unit}</option>`).join('')
const operationId = () => globalThis.crypto?.randomUUID?.() || `home-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createHomeMobile(root, storage) {
  let store = null
  let tab = 'inventory'
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
    <div class="household-head"><p class="eyebrow">Home / Háztartás</p><h1>Mi van otthon?</h1><p>Ezen az eszközön tárolva · nincs családi szinkron</p></div>
    <div class="household-alert" data-household-alert role="status" aria-live="polite" hidden></div>
    <div class="household-tabs" data-household-tabs role="tablist" aria-label="Háztartás nézetei"><button type="button" data-household-tab="inventory" role="tab">Készlet</button><button type="button" data-household-tab="shopping" role="tab">Bevásárlólista</button></div>
    <section data-household-inventory><div class="household-toolbar"><input data-household-search type="search" placeholder="Élelmiszer keresése" aria-label="Élelmiszer keresése"><button type="button" data-household-add="inventory">+ Élelmiszer</button></div><div class="household-filters" aria-label="Tároló szűrő"><button type="button" data-household-filter="all">Összes</button><button type="button" data-household-filter="fridge">Hűtő</button><button type="button" data-household-filter="freezer">Fagyasztó</button><button type="button" data-household-filter="pantry">Kamra</button></div><div data-household-lots></div></section>
    <section data-household-shopping hidden><div class="household-toolbar"><p>Bevásárlási tervek. A kipipálás nem növeli a készletet.</p><button type="button" data-household-add="shopping">+ Listaelem</button></div><div data-household-items></div></section>
    <button type="button" class="household-undo" data-household-undo hidden>Utolsó művelet visszavonása</button>
    <form class="household-form" data-household-form hidden><h2 data-household-form-title>Új tétel</h2><label>Név<input name="name" required maxlength="160" autocomplete="off"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Ismeretlen, ha üres"></label><label>Egység<select name="unit">${units}</select></label></div><label data-household-location-label>Tárolás<select name="storageLocation"><option value="fridge">Hűtő</option><option value="freezer">Fagyasztó</option><option value="pantry">Kamra</option></select></label><div data-household-expiry><label>Címkén szereplő dátum<input name="expiryDate" type="date"></label><label>Dátum típusa<select name="expiryKind"><option value="bestBefore">Minőségmegőrzési</option><option value="useBy">Fogyaszthatósági</option></select></label></div><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Megerősítés és mentés</button></div></form>
    <form class="household-form" data-household-split hidden><h2>Hűtő / Fagyasztó elosztás</h2><p data-household-split-source></p><div class="household-filters"><button type="button" data-household-preset="fridge">Mind hűtő</button><button type="button" data-household-preset="half">Fele-fele</button><button type="button" data-household-preset="freezer">Mind fagyasztó</button></div><div class="household-fields"><label>Hűtőbe kerülő mennyiség<input name="fridgeQuantity" type="number" min="0" step="any" inputmode="decimal" required></label><label>Egység<select name="unit">${units}</select></label></div><p data-household-split-preview role="status"></p><div class="household-actions"><button type="button" data-household-cancel>Mégse</button><button type="submit">Elosztás megerősítése</button></div></form>`

  root.querySelector('[data-household-tabs]').insertAdjacentHTML('beforeend', '<button type="button" data-household-tab="m2" role="tab">M2 · Főzés</button>')
  const m2 = createHomeM2Mobile(root, {
    getState: () => store?.getState(),
    dispatch: (type, payload, eventId, meta = {}) => run(type, payload, eventId, meta),
    report: (text, isError = false) => alert(text, isError),
  })
  const $ = selector => root.querySelector(selector)
  const form = $('[data-household-form]')
  const splitForm = $('[data-household-split]')
  const state = () => store.getState()
  const alert = (text, isError = false) => { message = isError ? '' : text; error = isError ? text : ''; const node = $('[data-household-alert]'); node.hidden = !text; node.textContent = text; node.classList.toggle('is-error', isError) }
  const run = (type, payload, eventId, meta = {}) => {
    if (!store) return
    try {
      const result = store.dispatch({ type, payload, ...meta, ...(eventId ? { eventId } : {}) })
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
    $('[data-household-inventory]').hidden = tab !== 'inventory'
    $('[data-household-shopping]').hidden = tab !== 'shopping'
    m2.section.hidden = tab !== 'm2'
    if (tab === 'm2') m2.render()
    root.querySelectorAll('[data-household-tab]').forEach(node => { node.setAttribute('aria-selected', String(node.dataset.householdTab === tab)); node.classList.toggle('is-active', node.dataset.householdTab === tab) })
    root.querySelectorAll('[data-household-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.householdFilter === filter))
    const lots = current.inventory.filter(lot => (filter === 'all' || lot.storageLocation === filter) && lot.name.toLocaleLowerCase('hu-HU').includes(search))
    $('[data-household-lots]').innerHTML = lots.length ? lots.map(lot => `<article class="household-card"><div><strong>${escape(lot.name)}</strong><p>${escape(displayQuantity(lot))} · ${placeNames[lot.storageLocation]} · kézi, megerősített ${escape(lot.observedAt.slice(0, 10))}</p><small>${escape(expiryLabel(lot))}</small></div><div class="household-card-actions"><button type="button" data-household-edit="${escape(lot.id)}">Szerkesztés</button><button type="button" data-household-split-id="${escape(lot.id)}">Elosztás</button><button type="button" data-household-delete="${escape(lot.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">Itt még nincs ismert élelmiszer. Adj hozzá egy megerősített mennyiséget.</div>'
    $('[data-household-items]').innerHTML = current.shopping.length ? current.shopping.map(item => `<article class="household-card"><div><strong>${escape(item.name)}</strong><p>${escape(displayQuantity(item))} · ${statusNames[item.status]} · tervezett, nem készlet</p></div><div class="household-card-actions"><button type="button" data-household-check="${escape(item.id)}">${item.status === 'checked' ? 'Újra listára' : 'Elintézve'}</button><button type="button" data-household-defer="${escape(item.id)}">Később</button><button type="button" data-household-edit-shopping="${escape(item.id)}">Szerkesztés</button><button type="button" data-household-delete-shopping="${escape(item.id)}">Törlés</button></div></article>`).join('') : '<div class="household-empty">A bevásárlólista üres. Itt tervezhetsz vásárlást készletváltozás nélkül.</div>'
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
  root.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button || !root.contains(button)) return
    const d = button.dataset
    if (d.householdTab) { tab = d.householdTab; closeForms(); render() }
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
  return { load() { try { store = createHomeStore(storage); $('[data-household-tabs]').hidden = false; alert(message || '', !!error); render() } catch (err) { store = null; closeForms(); $('[data-household-tabs]').hidden = true; $('[data-household-inventory]').hidden = true; $('[data-household-shopping]').hidden = true; $('[data-household-undo]').hidden = true; alert(err.message, true) } }, openTab(name) { if (!['inventory', 'shopping', 'm2'].includes(name)) return; tab = name; closeForms(); render() }, handleBack() { if (m2.handleBack()) return true; if (!form.hidden || !splitForm.hidden) { closeForms(); return true } return false } }
}
