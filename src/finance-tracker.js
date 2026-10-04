import './styles/screens/finance-tracker.css'
import { el, create } from './ui/dom.js'
import { notifyError, notifySuccess } from './ui/toast.js'
import { loadLocalProject, saveLocalProject } from './storage/local-project-store.js'
import { isGrapesDriveConnected, loadGrapesProject, saveGrapesProject } from './storage/grapes-drive.js'
import {
  DEFAULT_CATEGORIES, calculateSummary, categorySummary, filterTransactions, getMonthlySeries,
  normalizeTransaction, transactionsFromCsv, transactionsToCsv,
} from './finance-data.js'

const STORAGE_ID = 'finance-tracker-current'
const MODULE_NAME = 'Pénzügyi Napló'
const RECEIPT_LIMIT = 3 * 1024 * 1024
const PROJECT_RECEIPT_LIMIT = 15 * 1024 * 1024

let initialized = false
let transactions = []
let currency = 'HUF'
let driveProjectFileId = null
let localSaveTimer = null
let driveSaveTimer = null
let pendingReceipt = null
let receiptLoading = false
let receiptRequest = 0

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function currentMonth() {
  return today().slice(0, 7)
}

function formatMoney(value) {
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency', currency, maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  }).format(Number(value) || 0)
}

function serializeProject() {
  return { version: 1, currency, transactions }
}

function applyProject(data = {}) {
  currency = ['HUF', 'EUR', 'USD'].includes(data.currency) ? data.currency : 'HUF'
  transactions = Array.isArray(data.transactions)
    ? data.transactions.flatMap((item) => {
      try { return [normalizeTransaction(item)] } catch {
        // A hibás csatolmány nem törölheti a hozzá tartozó pénzügyi tételt.
        try { return [normalizeTransaction({ ...item, receipt: null })] } catch { return [] }
      }
    })
    : []
  el('#finance-currency').value = currency
}

async function persistLocal() {
  await saveLocalProject({
    id: STORAGE_ID, module: MODULE_NAME, name: 'Pénzügyi napló', data: serializeProject(), driveFileId: driveProjectFileId,
  })
}

function scheduleSave() {
  clearTimeout(localSaveTimer)
  clearTimeout(driveSaveTimer)
  el('#finance-save-status').textContent = 'Mentés…'
  localSaveTimer = setTimeout(async () => {
    try {
      await persistLocal()
      el('#finance-save-status').textContent = 'Helyben mentve'
    } catch (error) {
      console.error(error)
      el('#finance-save-status').textContent = 'A helyi mentés sikertelen'
    }
  }, 350)
  if (driveProjectFileId && isGrapesDriveConnected()) {
    driveSaveTimer = setTimeout(() => saveToDrive(false), 2600)
  }
}

async function saveToDrive(showToast = true) {
  if (!isGrapesDriveConnected()) {
    notifyError('Előbb csatlakoztasd a Google Drive-ot a főmenüben.')
    return
  }
  const button = el('#finance-drive-save')
  button.disabled = true
  el('#finance-drive-status').textContent = 'Mentés a Google Drive-ra…'
  try {
    driveProjectFileId = await saveGrapesProject({
      module: MODULE_NAME, name: 'Pénzügyi napló', data: serializeProject(), fileId: driveProjectFileId,
    })
    await persistLocal()
    el('#finance-drive-status').textContent = 'Google Drive-szinkronizálás aktív.'
    el('#finance-save-status').textContent = 'Drive-ra mentve'
    button.textContent = 'Drive mentve'
    if (showToast) notifySuccess('A pénzügyi napló mentve a Google Drive-ra.')
  } catch (error) {
    console.error(error)
    el('#finance-drive-status').textContent = 'A Drive-mentés nem sikerült.'
    if (showToast) notifyError(error.message || 'A Drive-mentés nem sikerült.')
  } finally {
    button.disabled = false
  }
}

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = create('a', { href: url, download: filename })
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function renderCategories() {
  const type = el('#finance-type').value
  const own = transactions.filter((item) => item.type === type).map((item) => item.category)
  const categories = [...new Set([...DEFAULT_CATEGORIES[type], ...own])]
  el('#finance-categories').replaceChildren(...categories.map((value) => create('option', { value })))
}

function renderChart(visibleTransactions) {
  const series = getMonthlySeries(transactions, 6)
  const maximum = Math.max(1, ...series.flatMap((item) => [item.income, item.expense]))
  const chart = el('#finance-chart')
  chart.replaceChildren()
  for (const month of series) {
    const group = create('div', { class: 'finance__chart-group' })
    const bars = create('div', { class: 'finance__bars' })
    for (const kind of ['income', 'expense']) {
      const value = month[kind]
      const bar = create('span', {
        class: `finance__bar finance__bar--${kind}`,
        title: `${kind === 'income' ? 'Bevétel' : 'Kiadás'}: ${formatMoney(value)}`,
        'aria-label': `${month.label} ${kind === 'income' ? 'bevétel' : 'kiadás'} ${formatMoney(value)}`,
      })
      bar.style.height = value ? `${Math.max(4, (value / maximum) * 100)}%` : '2px'
      bars.append(bar)
    }
    group.append(bars, create('span', { textContent: month.label.replace('.', '') }))
    chart.append(group)
  }
  const categories = categorySummary(visibleTransactions.filter((item) => item.type === 'expense')).slice(0, 5)
  const categoryHost = el('#finance-category-chart')
  categoryHost.replaceChildren()
  if (!categories.length) {
    categoryHost.append(create('span', { class: 'finance__category-empty', textContent: 'A kategóriák a kiadások rögzítése után jelennek meg.' }))
    return
  }
  const categoryMaximum = categories[0].amount || 1
  for (const item of categories) {
    const row = create('div', { class: 'finance__category-row' })
    const label = create('span', { textContent: item.category })
    const track = create('span', { class: 'finance__category-track' })
    const bar = create('i', { class: 'finance__category-bar' })
    bar.style.width = `${Math.max(2, item.amount / categoryMaximum * 100)}%`
    track.append(bar)
    row.append(label, track, create('strong', { textContent: formatMoney(item.amount) }))
    categoryHost.append(row)
  }
}

function getFilters() {
  return {
    month: el('#finance-filter-month').value,
    type: el('#finance-filter-type').value,
    search: el('#finance-filter-search').value,
  }
}

function receiptButton(transaction) {
  if (!transaction.receipt?.data) return create('span', { class: 'finance__muted', textContent: '—' })
  const button = create('button', { class: 'finance__receipt-link', type: 'button', textContent: transaction.receipt.name || 'Bizonylat' })
  button.addEventListener('click', () => {
    const anchor = create('a', { href: transaction.receipt.data, download: transaction.receipt.name || 'bizonylat' })
    document.body.append(anchor); anchor.click(); anchor.remove()
  })
  return button
}

function renderRows(visible) {
  const body = el('#finance-rows')
  body.replaceChildren()
  for (const transaction of visible) {
    const row = create('tr')
    const type = create('span', {
      class: `finance__type finance__type--${transaction.type}`,
      textContent: transaction.type === 'income' ? 'Bevétel' : 'Kiadás',
    })
    const amount = create('strong', {
      class: `finance__row-amount finance__row-amount--${transaction.type}`,
      textContent: `${transaction.type === 'income' ? '+' : '−'}${formatMoney(transaction.amount)}`,
    })
    const remove = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '×', title: 'Tétel törlése', 'aria-label': 'Tétel törlése' })
    remove.addEventListener('click', () => {
      if (!window.confirm('Biztosan törlöd ezt a pénzügyi tételt?')) return
      transactions = transactions.filter((item) => item.id !== transaction.id)
      render(); scheduleSave()
    })
    const cells = [transaction.date, type, transaction.category, transaction.note || '—', receiptButton(transaction), amount, remove]
    cells.forEach((content, index) => {
      const cell = create('td', { class: index === 5 ? 'finance__amount-cell' : '' })
      if (content instanceof Node) cell.append(content)
      else cell.textContent = content
      row.append(cell)
    })
    body.append(row)
  }
  el('#finance-empty').hidden = visible.length > 0
  el('#finance-result-count').textContent = `${visible.length} tétel`
}

function render() {
  const visible = filterTransactions(transactions, getFilters()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const summary = calculateSummary(visible)
  el('#finance-income').textContent = formatMoney(summary.income)
  el('#finance-expense').textContent = formatMoney(summary.expense)
  el('#finance-balance').textContent = formatMoney(summary.balance)
  el('#finance-balance').dataset.negative = summary.balance < 0 ? 'true' : 'false'
  el('#finance-income-count').textContent = `${visible.filter((item) => item.type === 'income').length} tétel`
  el('#finance-expense-count').textContent = `${visible.filter((item) => item.type === 'expense').length} tétel`
  el('#finance-balance-note').textContent = getFilters().month ? `${getFilters().month} hónapban` : 'A kijelölt időszakban'
  renderRows(visible)
  renderChart(visible)
  renderCategories()
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function prepareReceipt(file) {
  if (!file) return null
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('PNG, JPEG, GIF, WebP vagy PDF csatolható.')
  if (file.size > RECEIPT_LIMIT) throw new Error('A bizonylat legfeljebb 3 MB lehet.')
  const total = transactions.reduce((sum, item) => sum + Number(item.receipt?.size || 0), 0)
  if (total + file.size > PROJECT_RECEIPT_LIMIT) throw new Error('A projekthez csatolt bizonylatok összmérete legfeljebb 15 MB lehet.')
  return { name: file.name, type: file.type, size: file.size, data: await fileToDataUrl(file) }
}

async function loadInitialProject() {
  let project = null
  try {
    const target = JSON.parse(sessionStorage.getItem('grapes-open-project') || 'null')
    if (target?.module === MODULE_NAME) {
      sessionStorage.removeItem('grapes-open-project')
      if (target.source === 'Drive') {
        const wrapper = await loadGrapesProject(target.id)
        driveProjectFileId = target.id
        project = { data: wrapper.data }
      } else project = await loadLocalProject(target.id)
    }
    if (!project) project = await loadLocalProject(STORAGE_ID)
    if (project?.data) {
      applyProject(project.data)
      driveProjectFileId ||= project.driveFileId || null
    }
  } catch (error) {
    console.error(error)
    notifyError('A korábbi pénzügyi napló nem tölthető be.')
  }
}

function bindControls() {
  el('#finance-date').value = today()
  el('#finance-filter-month').value = currentMonth()
  document.querySelectorAll('[data-finance-type]').forEach((button) => button.addEventListener('click', () => {
    el('#finance-type').value = button.dataset.financeType
    document.querySelectorAll('[data-finance-type]').forEach((item) => item.classList.toggle('is-active', item === button))
    el('#finance-category').value = ''
    renderCategories()
  }))
  el('#finance-receipt').addEventListener('change', async (event) => {
    const request = ++receiptRequest
    receiptLoading = true
    pendingReceipt = null
    try {
      const receipt = await prepareReceipt(event.target.files[0])
      if (request !== receiptRequest) return
      pendingReceipt = receipt
      el('#finance-receipt-name').textContent = pendingReceipt?.name || 'Nincs fájl kiválasztva'
    } catch (error) {
      if (request !== receiptRequest) return
      pendingReceipt = null; event.target.value = ''
      el('#finance-receipt-name').textContent = 'Nincs fájl kiválasztva'
      notifyError(error.message)
    } finally { if (request === receiptRequest) receiptLoading = false }
  })
  el('#finance-form').addEventListener('submit', (event) => {
    event.preventDefault()
    try {
      if (receiptLoading) throw new Error('Várd meg a bizonylat betöltését.')
      transactions.push(normalizeTransaction({
        type: el('#finance-type').value, amount: el('#finance-amount').value,
        date: el('#finance-date').value, category: el('#finance-category').value,
        note: el('#finance-note').value, receipt: pendingReceipt,
      }))
      event.target.reset(); el('#finance-date').value = today(); el('#finance-type').value = 'expense'
      document.querySelectorAll('[data-finance-type]').forEach((item) => item.classList.toggle('is-active', item.dataset.financeType === 'expense'))
      pendingReceipt = null; el('#finance-receipt-name').textContent = 'Nincs fájl kiválasztva'
      render(); scheduleSave(); el('#finance-amount').focus()
    } catch (error) { notifyError(error.message) }
  })
  for (const selector of ['#finance-filter-month', '#finance-filter-type', '#finance-filter-search']) {
    el(selector).addEventListener(selector.includes('search') ? 'input' : 'change', render)
  }
  el('#finance-filter-clear').addEventListener('click', () => {
    el('#finance-filter-month').value = ''; el('#finance-filter-type').value = 'all'; el('#finance-filter-search').value = ''; render()
  })
  el('#finance-currency').addEventListener('change', (event) => { currency = event.target.value; render(); scheduleSave() })
  el('#finance-export-btn').addEventListener('click', () => {
    download(transactionsToCsv(transactions), 'text/csv;charset=utf-8', `penzugyi-naplo-${today()}.csv`)
    notifySuccess('A CSV-export elkészült.')
  })
  el('#finance-import-btn').addEventListener('click', () => el('#finance-csv-input').click())
  el('#finance-csv-input').addEventListener('change', async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      const imported = transactionsFromCsv(await file.text())
      transactions.push(...imported); render(); scheduleSave()
      notifySuccess(`${imported.length} tétel importálva.`)
    } catch (error) { notifyError(error.message || 'A CSV nem importálható.') }
    finally { event.target.value = '' }
  })
  el('#finance-drive-save').addEventListener('click', () => saveToDrive(true))
}

export async function initFinanceTracker() {
  if (initialized) {
    const target = JSON.parse(sessionStorage.getItem('grapes-open-project') || 'null')
    if (target?.module === MODULE_NAME) {
      clearTimeout(localSaveTimer); clearTimeout(driveSaveTimer)
      await loadInitialProject()
    }
    render(); return
  }
  initialized = true
  bindControls()
  await loadInitialProject()
  el('#finance-drive-status').textContent = driveProjectFileId
    ? 'Google Drive-szinkronizálás aktív.'
    : 'A változtatások helyben automatikusan mentődnek.'
  el('#finance-drive-save').textContent = driveProjectFileId ? 'Drive mentve' : 'Mentés Drive-ra'
  el('#finance-save-status').textContent = 'Kész'
  render()
}
