import './styles/screens/billing.css'
import { loadLocalProject, saveLocalProject } from './storage/local-project-store.js'
import { isGrapesDriveConnected, loadGrapesProject, saveGrapesProject } from './storage/grapes-drive.js'
import { calculateDocument, prepareDocument, convertDocument, DOCUMENT_TYPES } from './billing-data.js'
import { notifyError } from './ui/toast.js'
import { setUxState } from './ui/status.js'

const MODULE = 'Számla és árajánlat', STORAGE = 'billing-current'
let state = { version: 1, seller: {}, customers: [], products: [], documents: [] }
let draft, fileId = null, initialized = false, saving = Promise.resolve()
const root = () => document.querySelector('#billing-app')
const field = name => root().querySelector(`[name="${name}"]`)
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const dateNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const format = value => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: draft.currency }).format(value)
const line = product => ({ name: product?.name || '', quantity: 1, price: product?.price ?? 0, vat: product?.vat ?? 27, discount: 0 })
function nextNumber(type) {
  const prefix = ({ quote: 'AJ', proforma: 'DB', invoice: 'SZT' })[type] + '-' + dateNow().slice(0,4) + '-'
  let number = 1
  while (state.documents.some(item => item.number === prefix + String(number).padStart(4,'0'))) number++
  return prefix + String(number).padStart(4,'0')
}
function newDraft() {
  draft = { type: 'quote', number: nextNumber('quote'), date: dateNow(), dueDate: dateNow(), currency: 'HUF', customer: {}, seller: structuredClone(state.seller), lines: [line()], note: '' }
}
function status(text, state = 'saved') { setUxState(root().querySelector('#billing-status'), state, text) }
function persist() {
  const snapshot = structuredClone(state), driveFileId = fileId
  saving = saving.catch(() => {}).then(() => saveLocalProject({ id: STORAGE, module: MODULE, name: MODULE, data: snapshot, driveFileId }))
  saving.then(() => status('Helyben mentve'), error => { status('A mentés sikertelen', 'error'); notifyError(error.message) })
  return saving
}
const input = (name, title, value, type = 'text', attrs = '') => `<label>${title}<input name="${name}" type="${type}" value="${escape(value)}" ${attrs}></label>`
function render() {
  root().innerHTML = `<header class="billing__header"><div class="module-brand"><img class="toolbar__brand-mark" src="./grapes-logo.svg" alt=""><div><h1>Számla- és árajánlatkészítő</h1><p class="billing__notice">Árajánlatok, díjbekérők és belső számlatervezetek</p></div></div><div class="billing__header-side"><span id="billing-status" class="billing__status" role="status"></span><details class="billing__more"><summary class="btn">Továbbiak</summary><div class="billing__more-panel"><button class="btn" data-action="export">Biztonsági mentés</button><button class="btn" data-action="import">Mentés betöltése</button></div></details><button class="btn btn--primary" data-action="drive">Mentés Drive-ra</button><button class="btn btn--ghost" data-action="menu">Főmenü</button></div></header>
  <div class="billing__body"><section class="billing__panel billing__editor"><div class="billing__panel-head"><div><span class="billing__eyebrow">DOKUMENTUM</span><h2>Szerkesztés</h2></div><span class="billing__document-number">${escape(draft.number)}</span></div><form id="billing-document">
  <fieldset class="billing__section"><legend>Alapadatok</legend><div class="billing__fields"><label>Típus<select name="type">${Object.entries(DOCUMENT_TYPES).map(([key, title]) => `<option value="${key}" ${draft.type === key ? 'selected' : ''}>${title}</option>`).join('')}</select></label>${input('number', 'Azonosító', draft.number, 'text', 'required')}${input('date', 'Kiállítás dátuma', draft.date, 'date', 'required')}${input('dueDate', 'Fizetési határidő', draft.dueDate, 'date', 'required')}<label>Pénznem<select name="currency">${['HUF','EUR','USD'].map(key => `<option ${key === draft.currency ? 'selected' : ''}>${key}</option>`).join('')}</select></label><label>Ügyféltár<select name="customerId"><option value="">Egyedi ügyfél / válassz…</option>${state.customers.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label></div></fieldset>
  <fieldset class="billing__section"><legend>Kiállító és ügyfél</legend><div class="billing__fields">${input('sellerName', 'Kiállító neve', draft.seller.name, 'text', 'required')}${input('customerName', 'Ügyfél neve', draft.customer.name, 'text', 'required')}${input('sellerAddress', 'Kiállító címe', draft.seller.address)}${input('customerAddress', 'Ügyfél címe', draft.customer.address)}${input('sellerTax', 'Kiállító adószáma', draft.seller.tax)}${input('customerTax', 'Ügyfél adószáma', draft.customer.tax)}${input('sellerBank', 'Bankszámlaszám', draft.seller.bank)}${input('customerEmail', 'Ügyfél e-mail', draft.customer.email, 'email')}</div></fieldset>
  <fieldset class="billing__section"><legend>Tételek</legend><div id="billing-lines"></div><div class="billing__actions"><button class="btn" type="button" data-action="line">+ Üres tétel</button><label>Terméktár<select name="productId"><option value="">Termék hozzáadása…</option>${state.products.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label></div></fieldset>
  <label>Megjegyzés<textarea name="note">${escape(draft.note)}</textarea></label><p class="billing__notice">A számlatervezet belső dokumentum. Hivatalos számla kiállításához számlázóintegráció szükséges.</p><div class="billing__document-footer"><p id="billing-total" class="billing__total" aria-live="polite"></p><div class="billing__actions"><button class="btn btn--primary" type="submit">Dokumentum mentése</button><button class="btn" type="button" data-action="pdf">PDF / nyomtatás</button><button class="btn" type="button" data-action="new">Új dokumentum</button></div></div></form></section>
  <aside class="billing__panel billing__sidebar"><details open><summary>Mentett dokumentumok (${state.documents.length})</summary><div id="billing-documents" class="billing__list"></div></details><details><summary>Ügyféltár (${state.customers.length})</summary><form id="billing-customer" class="billing__catalog-form"><input name="id" type="hidden">${input('name','Név','','text','required')}${input('address','Cím','')}${input('tax','Adószám','')}${input('email','E-mail','','email')}<button class="btn" type="submit">Ügyfél mentése</button></form><div class="billing__list">${state.customers.map(item => catalogRow('customer', item)).join('')}</div></details><details><summary>Terméktár (${state.products.length})</summary><form id="billing-product" class="billing__catalog-form"><input name="id" type="hidden">${input('name','Megnevezés','','text','required')}${input('price','Nettó egységár',0,'number','min="0" step="0.01" required')}${input('vat','Áfa (%)',27,'number','min="0" max="100" step="0.01" required')}<button class="btn" type="submit">Termék mentése</button></form><div class="billing__list">${state.products.map(item => catalogRow('product', item)).join('')}</div></details></aside></div><input id="billing-import" type="file" accept="application/json,.json" hidden>`
  renderLines(); renderDocuments(); bind()
}
function catalogRow(kind, item) { return `<div class="billing__actions"><button type="button" class="btn" data-edit="${kind}" data-id="${escape(item.id)}">${escape(item.name)}</button><button type="button" class="btn" data-delete="${kind}" data-id="${escape(item.id)}" aria-label="${escape(item.name)} törlése">×</button></div>` }
function readDraft() {
  for (const key of ['type','number','date','dueDate','currency','note']) draft[key] = field(key).value
  draft.seller = { name: field('sellerName').value, address: field('sellerAddress').value, tax: field('sellerTax').value, bank: field('sellerBank').value }
  draft.customer = { name: field('customerName').value, address: field('customerAddress').value, tax: field('customerTax').value, email: field('customerEmail').value }
}
function renderLines() {
  root().querySelector('#billing-lines').innerHTML = draft.lines.map((item,index) => `<div class="billing__line" data-line="${index}">${input(`name-${index}`,'Megnevezés',item.name,'text','required')}${input(`quantity-${index}`,'Mennyiség',item.quantity,'number','min="0.001" step="0.001" required')}${input(`price-${index}`,'Nettó ár',item.price,'number','min="0" step="0.01" required')}${input(`vat-${index}`,'Áfa (%)',item.vat,'number','min="0" max="100" step="0.01" required')}${input(`discount-${index}`,'Kedv. (%)',item.discount,'number','min="0" max="100" step="0.01" required')}<button type="button" class="btn" data-remove-line="${index}" aria-label="Tétel törlése">×</button></div>`).join('')
  updateTotal()
}
function updateTotal() {
  try {
    const total = calculateDocument(draft.lines.filter(item => item.name.trim()))
    root().querySelector('#billing-total').textContent = `Nettó: ${format(total.net)} · Áfa: ${format(total.tax)} · Összesen: ${format(total.gross)}`
  } catch (error) { root().querySelector('#billing-total').textContent = error.message }
}
function renderDocuments() {
  root().querySelector('#billing-documents').innerHTML = state.documents.length ? state.documents.map(item => `<div><button class="btn" data-open="${escape(item.id)}">${escape(item.number)} · ${escape(item.customer.name)}<br>${DOCUMENT_TYPES[item.type]}</button>${item.type === 'quote' ? `<div class="billing__actions"><button class="btn" data-convert="proforma" data-id="${escape(item.id)}">→ Díjbekérő</button><button class="btn" data-convert="invoice" data-id="${escape(item.id)}">→ Számlatervezet</button></div>` : ''}</div>`).join('') : '<p class="billing__notice">Még nincs mentett dokumentum.</p>'
}
function saveDocument() {
  readDraft()
  draft = prepareDocument(draft, state.documents)
  const index = state.documents.findIndex(item => item.id === draft.id)
  if (index < 0) state.documents.unshift(structuredClone(draft))
  else state.documents[index] = structuredClone(draft)
  state.seller = structuredClone(draft.seller)
  persist(); renderDocuments()
}
function printDocument() {
  readDraft(); const document = prepareDocument(draft, state.documents)
  const total = calculateDocument(document.lines)
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Engedélyezd a felugró ablakot a PDF-mentéshez.')
  popup.opener = null
  const party = item => `<strong>${escape(item.name)}</strong><p>${escape(item.address)}</p><p>Adószám: ${escape(item.tax)}</p>${item.bank ? `<p>Bankszámla: ${escape(item.bank)}</p>` : ''}`
  popup.document.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escape(document.number)}</title><style>@page{size:A4;margin:16mm}body{font:13px Arial;color:#19212e;margin:30px}h1{color:#176b58}.parties{display:flex;justify-content:space-between;gap:30px}table{width:100%;border-collapse:collapse;margin:25px 0}th,td{padding:9px 5px;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}tr{break-inside:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere}.total{text-align:right;font-size:16px}button{padding:12px}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Nyomtatás / Mentés PDF-ként</button><h1>${DOCUMENT_TYPES[document.type]}</h1><p>${escape(document.number)} · ${escape(document.date)}<br>Fizetési határidő: ${escape(document.dueDate)}</p>${document.sourceNumber ? `<p>Hivatkozás: ${escape(document.sourceNumber)}</p>` : ''}<div class="parties"><section><h3>Kiállító</h3>${party(document.seller)}</section><section><h3>Ügyfél</h3>${party(document.customer)}</section></div><table><thead><tr><th>Tétel</th><th>Menny.</th><th>Nettó ár</th><th>Kedv.</th><th>Áfa</th><th>Bruttó</th></tr></thead><tbody>${total.items.map(item => `<tr><td>${escape(item.name)}</td><td>${item.quantity}</td><td>${format(item.price)}</td><td>${item.discount}%</td><td>${item.vat}%</td><td>${format(item.gross)}</td></tr>`).join('')}</tbody></table><p class="total">Nettó: ${format(total.net)}<br>Áfa: ${format(total.tax)}<br><strong>Összesen: ${format(total.gross)}</strong></p><p>${escape(document.note)}</p>${document.type === 'invoice' ? '<p>Belső számlatervezet — nem hivatalos számla.</p>' : ''}</body></html>`)
  popup.document.close()
  popup.focus()
}
async function saveDrive() {
  if (!isGrapesDriveConnected()) throw new Error('Csatlakoztasd a Google Drive-ot a főmenüben.')
  saveDocument()
  await saving
  status('Drive-mentés…', 'saving')
  fileId = await saveGrapesProject({ module: MODULE, name: MODULE, data: structuredClone(state), fileId })
  await persist(); status('Drive-ra mentve')
}
function bind() {
  root().querySelector('#billing-document').onsubmit = event => { event.preventDefault(); try { saveDocument() } catch (error) { notifyError(error.message) } }
  root().querySelector('#billing-document').oninput = event => {
    const row = event.target.closest('[data-line]')
    if (row) { const key = event.target.name.split('-')[0]; draft.lines[Number(row.dataset.line)][key] = key === 'name' ? event.target.value : Number(event.target.value) }
    readDraft(); updateTotal()
  }
  field('type').onchange = () => { draft.type = field('type').value; draft.number = nextNumber(draft.type); field('number').value = draft.number; draft.id = null }
  field('customerId').onchange = () => { readDraft(); const customer = state.customers.find(item => item.id === field('customerId').value); if (customer) { draft.customer = structuredClone(customer); render() } }
  field('productId').onchange = () => { readDraft(); const product = state.products.find(item => item.id === field('productId').value); if (product) { draft.lines.push(line(product)); renderLines(); field('productId').value = '' } }
  for (const kind of ['customer','product']) root().querySelector(`#billing-${kind}`).onsubmit = event => {
    event.preventDefault(); readDraft()
    const values = Object.fromEntries(new FormData(event.target)), collection = state[kind === 'customer' ? 'customers' : 'products']
    values.id ||= crypto.randomUUID()
    if (kind === 'product') { values.price = Number(values.price); values.vat = Number(values.vat) }
    const index = collection.findIndex(item => item.id === values.id)
    if (index < 0) collection.push(values); else collection[index] = values
    persist(); render()
  }
  root().onclick = async event => {
    const button = event.target.closest('button'); if (!button) return
    try {
      if (button.dataset.removeLine !== undefined) { readDraft(); draft.lines.splice(Number(button.dataset.removeLine),1); renderLines() }
      if (button.dataset.open) { readDraft(); if (!confirm('Megnyitod a mentett dokumentumot? A nem mentett szerkesztés elvész.')) return; draft = structuredClone(state.documents.find(item => item.id === button.dataset.open)); render() }
      if (button.dataset.convert) {
        if (!confirm('Átalakítod a mentett árajánlatot? A nem mentett szerkesztés elvész.')) return
        draft = convertDocument(state.documents.find(item => item.id === button.dataset.id),button.dataset.convert); draft.number = nextNumber(draft.type); render()
      }
      if (button.dataset.edit) { const kind = button.dataset.edit; const item = state[kind === 'customer' ? 'customers' : 'products'].find(item => item.id === button.dataset.id); const form = root().querySelector(`#billing-${kind}`); for (const [key,value] of Object.entries(item)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value }
      if (button.dataset.delete && confirm('Törlöd a tárból? A mentett dokumentumok megmaradnak.')) { readDraft(); const key = button.dataset.delete === 'customer' ? 'customers' : 'products'; state[key] = state[key].filter(item => item.id !== button.dataset.id); persist(); render() }
      switch (button.dataset.action) {
        case 'menu': { const { showScreen } = await import('./screens.js'); await showScreen(isGrapesDriveConnected() ? 'splash' : 'login'); break }
        case 'line': readDraft(); draft.lines.push(line()); renderLines(); break
        case 'new': if (confirm('Új dokumentumot kezdesz? A nem mentett szerkesztés elvész.')) { newDraft(); render() } break
        case 'pdf': printDocument(); break
        case 'drive': button.disabled = true; await saveDrive(); break
        case 'export': { const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `grapes-dokumentumok-${dateNow()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); break }
        case 'import': root().querySelector('#billing-import').click(); break
      }
    } catch (error) { notifyError(error.message); status('A művelet sikertelen', 'error') } finally { button.disabled = false }
  }
  root().querySelector('#billing-import').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return
      const data = JSON.parse(await file.text()); validateState(data)
      if (!confirm('A betöltött mentés lecseréli a jelenlegi dokumentum- és adatbázist. Folytatod?')) return
      state = data; fileId = null; newDraft(); await persist(); render()
    } catch (error) { notifyError(error.message) } finally { event.target.value = '' }
  }
}
function validateState(data) {
  if (data?.version !== 1 || !data.seller || !['customers','products','documents'].every(key => Array.isArray(data[key]))) throw new Error('Érvénytelen dokumentummentés.')
  for (const key of ['customers','products']) for (const item of data[key]) {
    if (!item?.id || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Érvénytelen adatbázis.')
    if (key === 'products') calculateDocument([line(item)])
  }
  const checked = []
  for (const document of data.documents) { checked.push(prepareDocument(document, checked)) }
}
export async function initBillingStudio() {
  try {
    const target = JSON.parse(sessionStorage.getItem('grapes-open-project') || 'null')
    if (!initialized || target?.module === MODULE) {
      let project
      if (target?.module === MODULE) { project = await loadGrapesProject(target.id); fileId = target.id; sessionStorage.removeItem('grapes-open-project') }
      else { project = await loadLocalProject(STORAGE); fileId = project?.driveFileId || null }
      if (project?.data) { validateState(project.data); state = project.data }
      newDraft(); initialized = true; render()
    }
  } catch (error) { if (!initialized) { newDraft(); render() }; notifyError(error.message) }
}
