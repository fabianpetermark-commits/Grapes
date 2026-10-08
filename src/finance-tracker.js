import './styles/screens/finance-tracker.css'
import { el, create } from './ui/dom.js'
import { notifyError, notifySuccess } from './ui/toast.js'
import { createResponsiveOverflow } from './ui/responsive-overflow.js'
import { setUxState } from './ui/status.js'
import { showGrapesConfirm, showGrapesPrompt } from './ui/modal.js'
import { initFinanceImport } from './finance-import-ui.js'
import { loadLocalProject, saveLocalProject } from './storage/local-project-store.js'
import { isGrapesDriveConnected, loadGrapesProject, saveGrapesProject } from './storage/grapes-drive.js'
import {
  DEFAULT_CATEGORIES, calculateSavings, calculateSummary, categorySummary, filterTransactions,
  forecastFinances, formatMoneyInput, getMonthlySeries, financeBackupFromJson, financeBackupToJson, normalizePerson,
  normalizeSavingsEntry, normalizeSavingsGoal, normalizeTransaction, transactionsToCsv,
} from './finance-data.js'

const STORAGE_ID = 'finance-tracker-current'
const DELETE_BACKUP_ID = 'finance-tracker-last-delete-backup'
const RESTORE_BACKUP_ID = 'finance-tracker-before-restore-backup'
const MODULE_NAME = 'Pénzügyi Napló'
const RECEIPT_LIMIT = 3 * 1024 * 1024
const PROJECT_RECEIPT_LIMIT = 15 * 1024 * 1024
const BACKUP_FILE_LIMIT = 30 * 1024 * 1024

let initialized = false
let activeFinanceTab = 'overview'
let transactions = []
let people = []
let categories = { income: [], expense: [] }
let savingsGoals = []
let savingsEntries = []
let forecastSettings = { historyMonths: 6, futureMonths: 3 }
let currency = 'HUF'
let driveProjectFileId = null
let localSaveTimer = null
let driveSaveTimer = null
let pendingReceipt = null
let receiptLoading = false
let receiptRequest = 0
let editingTransactionId = null
let editingSavingsEntryId = null
let financeImportController = null

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function currentMonth() {
  return today().slice(0, 7)
}

function backupTimestamp() {
  const date = new Date()
  return `${today()}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
}

function formatMoney(value) {
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency', currency, maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  }).format(Number(value) || 0)
}

function serializeProject() {
  return { version: 2, currency, transactions, people, categories, savingsGoals, savingsEntries, forecastSettings }
}

function bindMoneyInputs() {
  document.querySelectorAll('[data-finance-money]').forEach((input) => {
    input.addEventListener('input', () => {
      const formatted = formatMoneyInput(input.value)
      if (input.value !== formatted) input.value = formatted
      input.setSelectionRange?.(input.value.length, input.value.length)
    })
    input.addEventListener('blur', () => { input.value = formatMoneyInput(input.value) })
  })
}

function setTransactionType(type) {
  el('#finance-type').value = type === 'income' ? 'income' : 'expense'
  document.querySelectorAll('[data-finance-type]').forEach((item) => item.classList.toggle('is-active', item.dataset.financeType === el('#finance-type').value))
  renderCategories()
}

function resetTransactionEditor() {
  editingTransactionId = null
  el('#finance-form').reset()
  el('#finance-date').value = today()
  setTransactionType('expense')
  pendingReceipt = null
  el('#finance-receipt-name').textContent = 'Nincs fájl kiválasztva'
  el('#finance-transaction-submit').textContent = 'Tétel hozzáadása'
  el('#finance-transaction-cancel').hidden = true
}

function resetSavingsEditor() {
  editingSavingsEntryId = null
  el('#finance-saving-form').reset()
  el('#finance-saving-date').value = today()
  el('#finance-saving-submit').textContent = 'Megtakarítás rögzítése'
  el('#finance-saving-cancel').hidden = true
}

function setFinanceTab(tab) {
  const allowed = new Set(['overview', 'transaction', 'savings', 'forecast', 'import'])
  activeFinanceTab = allowed.has(tab) ? tab : 'overview'
  document.querySelectorAll('[data-finance-tab]').forEach((button) => {
    const active = button.dataset.financeTab === activeFinanceTab
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  })
  document.querySelectorAll('[data-finance-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.financePanel !== activeFinanceTab
  })
  if (activeFinanceTab === 'import') financeImportController?.render()
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
  people = (Array.isArray(data.people) ? data.people : []).flatMap((item) => { try { return [normalizePerson(item)] } catch { return [] } })
  categories = {
    income: [...new Set((data.categories?.income || []).map((item) => String(item).trim()).filter(Boolean))],
    expense: [...new Set((data.categories?.expense || []).map((item) => String(item).trim()).filter(Boolean))],
  }
  savingsGoals = (Array.isArray(data.savingsGoals) ? data.savingsGoals : []).flatMap((item) => { try { return [normalizeSavingsGoal(item)] } catch { return [] } })
  savingsEntries = (Array.isArray(data.savingsEntries) ? data.savingsEntries : []).flatMap((item) => { try { return [normalizeSavingsEntry(item)] } catch { return [] } })
  forecastSettings = {
    historyMonths: [3, 6, 12, 24].includes(Number(data.forecastSettings?.historyMonths)) ? Number(data.forecastSettings.historyMonths) : 6,
    futureMonths: [1, 3, 6, 12].includes(Number(data.forecastSettings?.futureMonths)) ? Number(data.forecastSettings.futureMonths) : 3,
  }
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
  setUxState('#finance-save-status', 'saving', 'Mentés…')
  localSaveTimer = setTimeout(async () => {
    try {
      await persistLocal()
      setUxState('#finance-save-status', 'saved', 'Helyben mentve')
    } catch (error) {
      console.error(error)
      setUxState('#finance-save-status', 'error', 'A helyi mentés sikertelen')
    }
  }, 350)
  if (isGrapesDriveConnected()) {
    driveSaveTimer = setTimeout(() => saveToDrive(false), 2600)
  }
}

async function saveToDrive(showToast = true) {
  if (!isGrapesDriveConnected()) {
    notifyError('Előbb csatlakoztasd a Google Drive-ot a főmenüben.')
    return false
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
    setUxState('#finance-save-status', 'saved', 'Drive-ra mentve')
    button.textContent = 'Drive mentve'
    if (showToast) notifySuccess('A pénzügyi napló mentve a Google Drive-ra.')
    return true
  } catch (error) {
    console.error(error)
    el('#finance-drive-status').textContent = 'A Drive-mentés nem sikerült.'
    button.textContent = 'Mentés Drive-ra'
    if (showToast) notifyError(error.message || 'A Drive-mentés nem sikerült.')
    return false
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
  const choices = [...new Set([...DEFAULT_CATEGORIES[type], ...categories[type], ...own])]
  el('#finance-categories').replaceChildren(...choices.map((value) => create('option', { value })))
}

function personName(id) {
  return people.find((person) => person.id === id)?.name || ''
}

function renderPeople() {
  const options = [create('option', { value: '', textContent: 'Nincs megadva' }), ...people.filter((item) => !item.archived).map((person) => create('option', { value: person.id, textContent: person.name }))]
  for (const selector of ['#finance-person', '#finance-goal-person', '#finance-saving-person']) {
    const select = el(selector)
    const selected = select.value
    select.replaceChildren(...options.map((option) => option.cloneNode(true)))
    select.value = people.some((person) => person.id === selected) ? selected : ''
  }
}

function renderSavings() {
  const total = calculateSavings(savingsEntries)
  el('#finance-savings-total').textContent = formatMoney(total)
  const goalSelect = el('#finance-saving-goal')
  const selectedGoal = goalSelect.value
  goalSelect.replaceChildren(create('option', { value: '', textContent: 'Általános tartalék' }), ...savingsGoals.filter((goal) => !goal.archived).map((goal) => create('option', { value: goal.id, textContent: goal.name })))
  goalSelect.value = savingsGoals.some((goal) => goal.id === selectedGoal) ? selectedGoal : ''
  const host = el('#finance-goals')
  host.replaceChildren()
  if (!savingsGoals.length) host.append(create('p', { class: 'finance__muted', textContent: 'Még nincs megtakarítási cél.' }))
  for (const goal of savingsGoals.filter((item) => !item.archived)) {
    const saved = calculateSavings(savingsEntries, goal.id)
    const percent = Math.max(0, Math.min(100, saved / goal.targetAmount * 100))
    const card = create('div', { class: 'finance__goal' })
    const head = create('div', { class: 'finance__goal-head' }, [create('strong', { textContent: goal.name }), create('span', { textContent: `${formatMoney(saved)} / ${formatMoney(goal.targetAmount)}` })])
    const track = create('div', { class: 'finance__goal-track' }, [create('i')])
    track.firstChild.style.width = `${percent}%`
    const owner = personName(goal.personId)
    const archive = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '×', title: 'Cél archiválása' })
    archive.addEventListener('click', () => { goal.archived = true; render(); scheduleSave() })
    head.append(archive)
    card.append(head, track, create('small', { textContent: `${Math.round(percent)}% · ${goal.startDate} – ${goal.targetDate}${owner ? ` · ${owner}` : ''}` }))
    host.append(card)
  }
  const list = el('#finance-savings-list')
  list.replaceChildren()
  for (const entry of [...savingsEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8)) {
    const goal = savingsGoals.find((item) => item.id === entry.goalId)?.name || 'Általános tartalék'
    const edit = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '✎', title: 'Megtakarítási mozgás szerkesztése', 'aria-label': 'Megtakarítási mozgás szerkesztése' })
    edit.addEventListener('click', () => {
      editingSavingsEntryId = entry.id
      el('#finance-saving-type').value = entry.type
      el('#finance-saving-amount').value = formatMoneyInput(entry.amount)
      el('#finance-saving-date').value = entry.date
      el('#finance-saving-goal').value = entry.goalId
      el('#finance-saving-person').value = entry.personId
      el('#finance-saving-submit').textContent = 'Módosítás mentése'
      el('#finance-saving-cancel').hidden = false
      setFinanceTab('savings')
      el('#finance-saving-amount').focus()
    })
    const remove = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '×', title: 'Megtakarítási mozgás törlése' })
    remove.addEventListener('click', async () => {
      if (!await showGrapesConfirm({
        title: 'Most tényleg… komolyan?',
        message: 'Ez a megtakarítási mozgás eltűnik a tartalék történetéből. A malacpersely nem sértődik meg, de a számok változni fognak.',
        confirmLabel: 'Igen, töröld',
        cancelLabel: 'Nem, maradjon',
        danger: true,
        icon: '🐷',
      })) return
      savingsEntries = savingsEntries.filter((item) => item.id !== entry.id); render(); scheduleSave()
    })
    list.append(create('div', { class: 'finance__saving-row' }, [
      create('span', { textContent: entry.date }), create('span', { textContent: `${goal}${personName(entry.personId) ? ` · ${personName(entry.personId)}` : ''}` }),
      create('strong', { class: entry.type === 'withdrawal' ? 'is-negative' : '', textContent: `${entry.type === 'withdrawal' ? '−' : '+'}${formatMoney(entry.amount)}` }),
      create('span', { class: 'finance__record-actions' }, [edit, remove]),
    ]))
  }
}

function renderForecast() {
  const forecast = forecastFinances(transactions, savingsEntries, forecastSettings)
  el('#finance-forecast-balance').textContent = formatMoney(forecast.expectedBalance)
  el('#finance-forecast-note').textContent = `${forecastSettings.futureMonths} hónap várható nettó változása`
  el('#finance-forecast-income').textContent = formatMoney(forecast.expectedIncome)
  el('#finance-forecast-expense').textContent = formatMoney(forecast.expectedExpense)
  el('#finance-forecast-reserve').textContent = formatMoney(forecast.expectedReserve)
  el('#finance-forecast-history').value = String(forecastSettings.historyMonths)
  el('#finance-forecast-future').value = String(forecastSettings.futureMonths)
  const confidenceLabels = { low: 'Kevés adat', medium: 'Közepes adatmennyiség', high: 'Jó adatmennyiség' }
  el('#finance-forecast-confidence').textContent = `${confidenceLabels[forecast.confidence]}: ${forecast.sampleMonths} aktív hónap alapján. Az előrejelzés becslés.`
  const host = el('#finance-forecast-chart')
  host.replaceChildren(...forecast.months.map((month) => create('div', { class: 'finance__forecast-row' }, [
    create('span', { textContent: month.key }),
    create('span', { textContent: `Kiadás ${formatMoney(month.expense)}` }),
    create('strong', { textContent: `Tartalék ${formatMoney(month.reserve)}` }),
  ])))
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
    const edit = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '✎', title: 'Tétel szerkesztése', 'aria-label': 'Tétel szerkesztése' })
    edit.addEventListener('click', () => {
      editingTransactionId = transaction.id
      setTransactionType(transaction.type)
      el('#finance-amount').value = formatMoneyInput(transaction.amount)
      el('#finance-date').value = transaction.date
      el('#finance-category').value = transaction.category
      el('#finance-person').value = transaction.personId
      el('#finance-note').value = transaction.note
      pendingReceipt = transaction.receipt
      el('#finance-receipt-name').textContent = pendingReceipt?.name || 'Nincs fájl kiválasztva'
      el('#finance-transaction-submit').textContent = 'Módosítás mentése'
      el('#finance-transaction-cancel').hidden = false
      setFinanceTab('transaction')
      el('#finance-amount').focus()
    })
    const remove = create('button', { class: 'btn btn--icon btn--ghost', type: 'button', textContent: '×', title: 'Tétel törlése', 'aria-label': 'Tétel törlése' })
    remove.addEventListener('click', async () => {
      if (!await showGrapesConfirm({
        title: 'Most tényleg… komolyan?',
        message: 'Ez a pénzügyi tétel búcsút int a listának. Ha csak elírás történt, a ceruza kevésbé drámai megoldás.',
        confirmLabel: 'Igen, töröld',
        cancelLabel: 'Nem, megmentem',
        danger: true,
        icon: '🧾',
      })) return
      transactions = transactions.filter((item) => item.id !== transaction.id)
      render(); scheduleSave()
    })
    const actions = create('span', { class: 'finance__record-actions' }, [edit, remove])
    const cells = [transaction.date, type, transaction.category, personName(transaction.personId) || '—', transaction.note || '—', receiptButton(transaction), amount, actions]
    const labels = ['Dátum', 'Típus', 'Kategória', 'Személy', 'Megjegyzés', 'Bizonylat', 'Összeg', 'Művelet']
    cells.forEach((content, index) => {
      const cell = create('td', { class: index === 6 ? 'finance__amount-cell' : '' })
      cell.dataset.label = labels[index]
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
  const visible = filterTransactions(transactions.map((item) => ({ ...item, personName: personName(item.personId) })), getFilters()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const summary = calculateSummary(visible)
  el('#finance-income').textContent = formatMoney(summary.income)
  el('#finance-expense').textContent = formatMoney(summary.expense)
  el('#finance-balance').textContent = formatMoney(summary.balance)
  el('#finance-balance').dataset.negative = summary.balance < 0 ? 'true' : 'false'
  el('#finance-income-count').textContent = `${visible.filter((item) => item.type === 'income').length} tétel`
  el('#finance-expense-count').textContent = `${visible.filter((item) => item.type === 'expense').length} tétel`
  el('#finance-balance-note').textContent = getFilters().month ? `${getFilters().month} hónapban` : 'A kijelölt időszakban'
  el('#finance-delete-all').disabled = transactions.length === 0
  const currencySelect = el('#finance-currency')
  const hasMoneyData = transactions.length > 0 || savingsEntries.length > 0 || savingsGoals.length > 0
  currencySelect.value = currency
  currencySelect.disabled = hasMoneyData
  currencySelect.title = hasMoneyData ? 'A meglévő összegek nem válthatók át automatikusan. A pénznem csak üres naplónál módosítható.' : 'Az új napló pénzneme'
  renderRows(visible)
  renderChart(visible)
  renderCategories()
  renderPeople()
  renderSavings()
  renderForecast()
}

async function saveSafetySnapshot(id, name, data) {
  await saveLocalProject({ id, module: MODULE_NAME, name, data })
}

async function restoreFinanceBackup(data) {
  if (transactions.length && !await showGrapesConfirm({
    title: 'Időutazás a pénzügyekben?',
    message: 'A visszaállítás lecseréli a jelenlegi tételeket, megtakarításokat és beállításokat. A mostani állapotról előtte készül biztonsági mentés.',
    confirmLabel: 'Igen, állítsd vissza',
    cancelLabel: 'Nem, maradjon a jelen',
    danger: true,
    icon: '⏳',
  })) return
  clearTimeout(localSaveTimer)
  clearTimeout(driveSaveTimer)
  await persistLocal()
  await saveSafetySnapshot(RESTORE_BACKUP_ID, 'Pénzügyi napló – visszaállítás előtti mentés', serializeProject())
  await saveLocalProject({ id: STORAGE_ID, module: MODULE_NAME, name: 'Pénzügyi napló', data, driveFileId: null })
  applyProject(data)
  driveProjectFileId = null
  el('#finance-filter-month').value = ''
  el('#finance-filter-type').value = 'all'
  el('#finance-filter-search').value = ''
  el('#finance-drive-status').textContent = 'Helyben visszaállítva. A Drive-ra külön mentsd el.'
  el('#finance-drive-save').textContent = 'Mentés Drive-ra'
  render()
  setUxState('#finance-save-status', 'saved', 'Helyben visszaállítva')
  notifySuccess(`${transactions.length} tétel, a megtakarítások és a beállítások visszaállítva.`)
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
  bindMoneyInputs()
  el('#finance-date').value = today()
  el('#finance-saving-date').value = today()
  el('#finance-goal-start').value = today()
  const defaultGoalEnd = new Date(); defaultGoalEnd.setFullYear(defaultGoalEnd.getFullYear() + 1)
  el('#finance-goal-end').value = `${defaultGoalEnd.getFullYear()}-${String(defaultGoalEnd.getMonth() + 1).padStart(2, '0')}-${String(defaultGoalEnd.getDate()).padStart(2, '0')}`
  el('#finance-filter-month').value = currentMonth()
  const tabs = [...document.querySelectorAll('[data-finance-tab]')]
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => setFinanceTab(button.dataset.financeTab))
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      tabs[nextIndex].focus(); setFinanceTab(tabs[nextIndex].dataset.financeTab)
    })
  })
  setFinanceTab(activeFinanceTab)
  financeImportController = initFinanceImport({
    getTransactions: () => transactions,
    getSavingsEntries: () => savingsEntries,
    getPeople: () => people,
    getCategories: (type) => {
      const kind = type === 'income' ? 'income' : 'expense'
      return [...new Set([...DEFAULT_CATEGORIES[kind], ...categories[kind], ...transactions.filter((item) => item.type === kind).map((item) => item.category)])]
    },
    getCurrency: () => currency,
    onCommit: async (rows) => {
      const importedTransactions = []
      const importedSavings = []
      for (const row of rows) {
        if (row.target === 'income' || row.target === 'expense') {
          importedTransactions.push(normalizeTransaction({
            type: row.target, amount: row.amount, date: row.date, category: row.category,
            personId: row.personId, note: row.note,
          }))
        } else {
          importedSavings.push(normalizeSavingsEntry({
            type: row.target === 'saving-withdrawal' ? 'withdrawal' : 'deposit',
            amount: row.amount, date: row.date, goalId: '', personId: row.personId, note: row.note,
          }))
        }
      }
      transactions.push(...importedTransactions)
      savingsEntries.push(...importedSavings)
      el('#finance-filter-month').value = ''
      el('#finance-filter-type').value = 'all'
      el('#finance-filter-search').value = ''
      render(); scheduleSave(); setFinanceTab('overview')
      return { transactions: importedTransactions.length, savings: importedSavings.length }
    },
  })
  document.querySelectorAll('[data-finance-type]').forEach((button) => button.addEventListener('click', () => {
    setTransactionType(button.dataset.financeType)
    el('#finance-category').value = ''
  }))
  el('#finance-add-category').addEventListener('click', async () => {
    const name = (await showGrapesPrompt({
      title: 'Még egy rekesz a pénznek?',
      message: 'Adj nevet az új kategóriának. Valami beszédeset — a „Vegyes izék” később bosszút áll.',
      inputLabel: 'Új kategória neve',
      placeholder: 'Például: Kávéfüggőség',
      confirmLabel: 'Kategória hozzáadása',
      icon: '🏷️',
    }))?.trim()
    if (!name) return
    const type = el('#finance-type').value
    if (![...DEFAULT_CATEGORIES[type], ...categories[type]].some((item) => item.toLocaleLowerCase('hu-HU') === name.toLocaleLowerCase('hu-HU'))) categories[type].push(name)
    el('#finance-category').value = name
    renderCategories(); scheduleSave()
  })
  el('#finance-add-person').addEventListener('click', async () => {
    const name = (await showGrapesPrompt({
      title: 'Ki legyen a következő gyanúsított?',
      message: 'Add meg, kihez tartozzanak a tételek. Csak egy név kell, ujjlenyomatot nem kérünk.',
      inputLabel: 'Személy neve',
      placeholder: 'Például: Peti',
      confirmLabel: 'Személy hozzáadása',
      icon: '🕵️',
    }))?.trim()
    if (!name) return
    const existing = people.find((person) => person.name.toLocaleLowerCase('hu-HU') === name.toLocaleLowerCase('hu-HU'))
    const person = existing || normalizePerson({ name })
    if (!existing) people.push(person)
    renderPeople(); el('#finance-person').value = person.id; scheduleSave()
  })
  el('#finance-goal-form').addEventListener('submit', (event) => {
    event.preventDefault()
    try {
      savingsGoals.push(normalizeSavingsGoal({
        name: el('#finance-goal-name').value, targetAmount: el('#finance-goal-amount').value,
        startDate: el('#finance-goal-start').value, targetDate: el('#finance-goal-end').value,
        personId: el('#finance-goal-person').value,
      }))
      el('#finance-goal-name').value = ''; el('#finance-goal-amount').value = ''
      render(); scheduleSave()
    } catch (error) { notifyError(error.message) }
  })
  el('#finance-saving-form').addEventListener('submit', (event) => {
    event.preventDefault()
    try {
      const existing = savingsEntries.find((item) => item.id === editingSavingsEntryId)
      const normalized = normalizeSavingsEntry({
        id: existing?.id, createdAt: existing?.createdAt,
        type: el('#finance-saving-type').value, amount: el('#finance-saving-amount').value,
        date: el('#finance-saving-date').value, goalId: el('#finance-saving-goal').value,
        personId: el('#finance-saving-person').value,
      })
      if (existing) savingsEntries = savingsEntries.map((item) => item.id === existing.id ? normalized : item)
      else savingsEntries.push(normalized)
      resetSavingsEditor()
      render(); scheduleSave()
    } catch (error) { notifyError(error.message) }
  })
  el('#finance-saving-cancel').addEventListener('click', () => { resetSavingsEditor(); renderSavings() })
  for (const selector of ['#finance-forecast-history', '#finance-forecast-future']) {
    el(selector).addEventListener('change', () => {
      forecastSettings = { historyMonths: Number(el('#finance-forecast-history').value), futureMonths: Number(el('#finance-forecast-future').value) }
      renderForecast(); scheduleSave()
    })
  }
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
      const existing = transactions.find((item) => item.id === editingTransactionId)
      const normalized = normalizeTransaction({
        id: existing?.id, createdAt: existing?.createdAt,
        type: el('#finance-type').value, amount: el('#finance-amount').value,
        date: el('#finance-date').value, category: el('#finance-category').value,
        personId: el('#finance-person').value, note: el('#finance-note').value, receipt: pendingReceipt,
      })
      if (existing) transactions = transactions.map((item) => item.id === existing.id ? normalized : item)
      else transactions.push(normalized)
      resetTransactionEditor()
      render(); scheduleSave(); setFinanceTab('overview')
    } catch (error) { notifyError(error.message) }
  })
  el('#finance-transaction-cancel').addEventListener('click', () => { resetTransactionEditor(); setFinanceTab('overview') })
  for (const selector of ['#finance-filter-month', '#finance-filter-type', '#finance-filter-search']) {
    el(selector).addEventListener(selector.includes('search') ? 'input' : 'change', render)
  }
  el('#finance-filter-clear').addEventListener('click', () => {
    el('#finance-filter-month').value = ''; el('#finance-filter-type').value = 'all'; el('#finance-filter-search').value = ''; render()
  })
  el('#finance-delete-all').addEventListener('click', async () => {
    if (!transactions.length) return
    const count = transactions.length
    if (!await showGrapesConfirm({
      title: 'Nagy piros gomb következik…',
      message: `Mind a(z) ${count} tétel törlésére készülsz. Előbb készítsek teljes mentést a tételekről és a bizonylatokról? A törlésről utána még egyszer külön megkérdezlek — mert ennyire nem bízom a véletlen kattintásokban.`,
      confirmLabel: 'Igen, készíts mentést',
      cancelLabel: 'Nem, visszavonulok',
      icon: '🚨',
    })) return
    const button = el('#finance-delete-all')
    button.disabled = true
    try {
      const snapshot = serializeProject()
      const filename = `penzugyi-naplo-teljes-mentes-${backupTimestamp()}.json`
      clearTimeout(localSaveTimer)
      clearTimeout(driveSaveTimer)
      await persistLocal()
      await saveSafetySnapshot(DELETE_BACKUP_ID, 'Pénzügyi napló – utolsó törlés előtti mentés', snapshot)
      download(financeBackupToJson(snapshot), 'application/json;charset=utf-8', filename)
      const confirmed = await showGrapesConfirm({
        title: 'Utolsó kérdés. Becsületszó.',
        message: `A teljes mentést helyben megőriztük, és a ${filename} letöltését elindítottuk. Ellenőrizd a letöltéseidet: a fájl személyes adatokat is tartalmazhat. Biztosan törlöd mind a(z) ${count} tételt?`,
        confirmLabel: `Igen, töröld mind a(z) ${count} tételt`,
        cancelLabel: 'Nem, mégsem törlöm',
        danger: true,
        icon: '🧨',
      })
      if (!confirmed) return
      transactions = []
      render()
      try { await persistLocal() }
      catch (error) { transactions = snapshot.transactions; render(); throw error }
      const driveSynced = driveProjectFileId && isGrapesDriveConnected() ? await saveToDrive(false) : false
      setUxState('#finance-save-status', 'saved', driveSynced ? 'Drive-ra törölve' : 'Helyben törölve')
      notifySuccess(`A tételeket ${driveSynced ? 'a Drive-on is' : 'helyben'} töröltük. A teljes mentés fájlból vagy az „Utolsó törlés visszaállítása” gombbal visszaállítható.`)
    } catch (error) {
      console.error(error)
      notifyError(`A biztonsági mentés vagy a törlés mentése nem sikerült: ${error.message}`)
    } finally { button.disabled = transactions.length === 0 }
  })
  el('#finance-currency').addEventListener('change', (event) => {
    if (transactions.length || savingsEntries.length || savingsGoals.length) { event.target.value = currency; notifyError('A meglévő összegeket nem váltjuk át automatikusan. A pénznem csak teljesen üres naplónál módosítható.'); return }
    currency = event.target.value; render(); scheduleSave()
  })
  el('#finance-backup-export-btn').addEventListener('click', () => {
    download(financeBackupToJson(serializeProject()), 'application/json;charset=utf-8', `penzugyi-naplo-teljes-mentes-${backupTimestamp()}.json`)
    notifySuccess('A teljes, bizonylatokat is tartalmazó mentés letöltése elindult.')
  })
  el('#finance-backup-import-btn').addEventListener('click', () => el('#finance-backup-input').click())
  el('#finance-backup-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > BACKUP_FILE_LIMIT) throw new Error('A mentésfájl legfeljebb 30 MiB lehet.')
      await restoreFinanceBackup(financeBackupFromJson(await file.text()))
    } catch (error) { notifyError(error.message || 'A teljes mentés nem állítható vissza.') }
    finally { event.target.value = '' }
  })
  el('#finance-restore-last').addEventListener('click', async () => {
    try {
      const backup = await loadLocalProject(DELETE_BACKUP_ID)
      if (!backup?.data) throw new Error('Nincs helyi törlés előtti mentés. A letöltött JSON-fájlt is importálhatod.')
      await restoreFinanceBackup(financeBackupFromJson(financeBackupToJson(backup.data)))
    } catch (error) { notifyError(error.message || 'A helyi mentés nem állítható vissza.') }
  })
  el('#finance-export-btn').addEventListener('click', () => {
    download(transactionsToCsv(transactions, currency), 'text/csv;charset=utf-8', `penzugyi-naplo-${today()}.csv`)
    notifySuccess('A CSV-export elkészült. A bizonylatfájlokhoz használd a Teljes mentést.')
  })
  el('#finance-import-btn').addEventListener('click', () => setFinanceTab('import'))
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
  createResponsiveOverflow({
    toolbar: el('.finance__header-actions'),
    items: [...document.querySelectorAll('[data-finance-overflow]')],
    label: 'Továbbiak',
  })
  bindControls()
  await loadInitialProject()
  el('#finance-drive-status').textContent = driveProjectFileId
    ? 'Google Drive-szinkronizálás aktív.'
    : 'A változtatások helyben automatikusan mentődnek.'
  el('#finance-drive-save').textContent = driveProjectFileId ? 'Drive mentve' : 'Mentés Drive-ra'
  setUxState('#finance-save-status', 'saved', 'Kész')
  render()
}
