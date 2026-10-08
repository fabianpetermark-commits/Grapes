import { validDate } from './billing-data.js'

export const DEFAULT_CATEGORIES = {
  income: ['Munkabér', 'Értékesítés', 'Szolgáltatás', 'Visszatérítés', 'Egyéb bevétel'],
  expense: ['Lakhatás', 'Élelmiszer', 'Közlekedés', 'Számlák', 'Egészség', 'Szórakozás', 'Adó', 'Egyéb kiadás'],
}

const FINANCE_CURRENCIES = new Set(['HUF', 'EUR', 'USD'])
const FINANCE_BACKUP_VERSION = 2

function cleanText(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

export function parseMoneyInput(value) {
  if (typeof value === 'number') return value
  const source = String(value ?? '').trim().replace(/[\s\u00a0]/g, '')
  if (!source) return Number.NaN
  let normalized = source
  if (source.includes(',')) normalized = source.replaceAll('.', '').replace(',', '.')
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(source)) normalized = source.replaceAll('.', '')
  return Number(normalized)
}

export function formatMoneyInput(value) {
  const source = String(value ?? '').trim().replace(/[^\d.,]/g, '')
  if (!source) return ''
  const hasComma = source.includes(',')
  const decimalDot = !hasComma && /^\d+\.\d{1,2}$/.test(source) && !/^\d{1,3}(?:\.\d{3})+$/.test(source)
  const separator = hasComma ? ',' : decimalDot ? '.' : ''
  const [rawInteger = '', rawDecimal = ''] = separator ? source.split(separator, 2) : [source, '']
  const integer = rawInteger.replaceAll('.', '').replaceAll(',', '').replace(/^0+(?=\d)/, '') || '0'
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimal = rawDecimal.replace(/\D/g, '').slice(0, 2)
  return separator ? `${grouped},${decimal}` : grouped
}

function roundedAmount(value) {
  return Math.round(parseMoneyInput(value) * 100) / 100
}

export function normalizeTransaction(value = {}) {
  const type = value.type === 'income' ? 'income' : 'expense'
  const amount = roundedAmount(value.amount)
  const date = validDate(value.date) ? value.date : ''
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Az összegnek nullánál nagyobbnak kell lennie.')
  if (!date) throw new Error('Érvényes dátum szükséges.')
  if (value.receipt && (!/^data:(?:image\/(?:png|jpeg|gif|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(String(value.receipt.data || '')) || !Number.isFinite(Number(value.receipt.size)) || Number(value.receipt.size) < 0 || Number(value.receipt.size) > 3 * 1024 * 1024)) throw new Error('Érvénytelen bizonylat.')
  return {
    id: String(value.id || crypto.randomUUID()),
    type,
    amount,
    date,
    category: String(value.category || '').trim() || (type === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás'),
    note: String(value.note || '').trim(),
    personId: cleanText(value.personId),
    receipt: value.receipt || null,
    createdAt: value.createdAt || new Date().toISOString(),
  }
}

export function normalizePerson(value = {}) {
  const name = cleanText(value.name)
  if (!name) throw new Error('A személy neve kötelező.')
  return { id: cleanText(value.id, crypto.randomUUID()), name, archived: Boolean(value.archived) }
}

export function normalizeSavingsGoal(value = {}) {
  const targetAmount = roundedAmount(value.targetAmount)
  if (!cleanText(value.name)) throw new Error('A cél neve kötelező.')
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error('A célösszegnek nullánál nagyobbnak kell lennie.')
  if (!validDate(value.startDate) || !validDate(value.targetDate) || value.targetDate < value.startDate) throw new Error('Érvényes célidőszak szükséges.')
  return {
    id: cleanText(value.id, crypto.randomUUID()), name: cleanText(value.name), targetAmount,
    startDate: value.startDate, targetDate: value.targetDate, personId: cleanText(value.personId),
    archived: Boolean(value.archived), createdAt: value.createdAt || new Date().toISOString(),
  }
}

export function normalizeSavingsEntry(value = {}) {
  const amount = roundedAmount(value.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A megtakarítás összegének nullánál nagyobbnak kell lennie.')
  if (!validDate(value.date)) throw new Error('Érvényes megtakarítási dátum szükséges.')
  return {
    id: cleanText(value.id, crypto.randomUUID()), type: value.type === 'withdrawal' ? 'withdrawal' : 'deposit',
    amount, date: value.date, goalId: cleanText(value.goalId), personId: cleanText(value.personId),
    note: cleanText(value.note), createdAt: value.createdAt || new Date().toISOString(),
  }
}

export function calculateSavings(savingsEntries = [], goalId = null) {
  const cents = savingsEntries.reduce((total, entry) => {
    if (goalId !== null && entry.goalId !== goalId) return total
    return total + (entry.type === 'withdrawal' ? -1 : 1) * (Math.round(Number(entry.amount) * 100) || 0)
  }, 0)
  return cents / 100
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function linearProjection(values, step, allowNegative = false) {
  if (!values.length) return 0
  if (values.length === 1) return Math.max(0, values[0])
  const xMean = (values.length - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length
  const slope = values.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0)
    / values.reduce((sum, _value, index) => sum + (index - xMean) ** 2, 0)
  const projected = yMean + slope * (xMean + step)
  return allowNegative ? projected : Math.max(0, projected)
}

export function detectRecurringTransactions(transactions = [], referenceDate = new Date()) {
  const groups = new Map()
  for (const item of transactions) {
    const label = `${item.type}|${cleanText(item.category).toLocaleLowerCase('hu-HU')}|${cleanText(item.note).toLocaleLowerCase('hu-HU')}|${cleanText(item.personId)}`
    const group = groups.get(label) || []
    group.push(item)
    groups.set(label, group)
  }
  const currentIndex = referenceDate.getFullYear() * 12 + referenceDate.getMonth()
  return [...groups.values()].flatMap((items) => {
    const months = [...new Set(items.map((item) => item.date.slice(0, 7)))]
    const amounts = items.map((item) => Number(item.amount)).sort((a, b) => a - b)
    const average = amounts.reduce((sum, value) => sum + value, 0) / amounts.length
    const deviation = amounts.reduce((sum, value) => sum + Math.abs(value - average), 0) / amounts.length
    const latest = Math.max(...months.map((key) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1))
    if (months.length < 2 || currentIndex - latest > 2 || (average && deviation / average > .2)) return []
    return [{ type: items[0].type, amount: roundedAmount(average), category: items[0].category }]
  })
}

export function forecastFinances(transactions = [], savingsEntries = [], { historyMonths = 6, futureMonths = 3, referenceDate = new Date() } = {}) {
  // A folyamatban lévő hónap részadatai ne torzítsák lefelé a trendet.
  const completedMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
  const history = getMonthlySeries(transactions, historyMonths, completedMonth)
  const savingHistory = getMonthlySavingsSeries(savingsEntries, historyMonths, completedMonth)
  const recurring = detectRecurringTransactions(transactions, referenceDate)
  const recurringIncome = recurring.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const recurringExpense = recurring.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const reserveNow = calculateSavings(savingsEntries)
  let reserve = reserveNow
  const months = []
  for (let step = 1; step <= futureMonths; step += 1) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + step, 1)
    const income = roundedAmount(Math.max(recurringIncome, linearProjection(history.map((item) => item.income), step)))
    const expense = roundedAmount(Math.max(recurringExpense, linearProjection(history.map((item) => item.expense), step)))
    const savingsChange = roundedAmount(linearProjection(savingHistory.map((item) => item.change), step, true))
    reserve = roundedAmount(reserve + savingsChange)
    months.push({ key: monthKey(date), income, expense, balance: roundedAmount(income - expense), savingsChange, reserve })
  }
  const populated = history.filter((item) => item.income || item.expense).length
  return {
    months, reserveNow, expectedIncome: roundedAmount(months.reduce((sum, item) => sum + item.income, 0)),
    expectedExpense: roundedAmount(months.reduce((sum, item) => sum + item.expense, 0)),
    expectedBalance: roundedAmount(months.reduce((sum, item) => sum + item.balance, 0)),
    expectedReserve: months.at(-1)?.reserve ?? reserveNow,
    confidence: populated >= 6 ? 'high' : populated >= 3 ? 'medium' : 'low', sampleMonths: populated,
  }
}

export function getMonthlySavingsSeries(entries, months = 6, referenceDate = new Date()) {
  const result = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1)
    const key = monthKey(date)
    result.push({ key, change: calculateSavings(entries.filter((item) => item.date.startsWith(key))) })
  }
  return result
}

export function financeBackupToJson({ currency, transactions, version: _projectVersion, ...rest }, exportedAt = new Date().toISOString()) {
  if (!FINANCE_CURRENCIES.has(currency) || !Array.isArray(transactions)) throw new Error('Érvénytelen pénzügyi napló.')
  return JSON.stringify({ grapesFinanceBackup: true, version: FINANCE_BACKUP_VERSION, exportedAt, data: { version: 2, currency, transactions, ...rest } }, null, 2)
}

export function financeBackupFromJson(source) {
  let backup
  try { backup = JSON.parse(source) } catch { throw new Error('A biztonsági mentés nem érvényes JSON-fájl.') }
  if (backup?.grapesFinanceBackup !== true || ![1, 2].includes(backup.version) || !FINANCE_CURRENCIES.has(backup.data?.currency) || !Array.isArray(backup.data?.transactions)) {
    throw new Error('Ez nem támogatott Grapes pénzügyi biztonsági mentés.')
  }
  if (backup.data.transactions.length > 100000) throw new Error('A biztonsági mentés túl sok tételt tartalmaz.')
  let transactions
  try { transactions = backup.data.transactions.map((item) => normalizeTransaction(item)) }
  catch (error) { throw new Error(`A biztonsági mentés egyik tétele hibás: ${error.message}`) }
  if (new Set(transactions.map((item) => item.id)).size !== transactions.length) throw new Error('A biztonsági mentésben ismétlődő tételazonosító van.')
  const people = (backup.data.people || []).map(normalizePerson)
  const savingsGoals = (backup.data.savingsGoals || []).map(normalizeSavingsGoal)
  const savingsEntries = (backup.data.savingsEntries || []).map(normalizeSavingsEntry)
  const categories = backup.data.categories || { income: [], expense: [] }
  return { version: 2, currency: backup.data.currency, transactions, people, savingsGoals, savingsEntries, categories, forecastSettings: backup.data.forecastSettings || { historyMonths: 6, futureMonths: 3 } }
}

export function calculateSummary(transactions) {
  const totals = transactions.reduce((summary, transaction) => {
    if (transaction.type === 'income') summary.income += Math.round(Number(transaction.amount) * 100) || 0
    else summary.expense += Math.round(Number(transaction.amount) * 100) || 0
    return summary
  }, { income: 0, expense: 0 })
  return { income: totals.income / 100, expense: totals.expense / 100, balance: (totals.income - totals.expense) / 100 }
}

export function filterTransactions(transactions, { month = '', type = 'all', search = '' } = {}) {
  const term = String(search).trim().toLocaleLowerCase('hu-HU')
  return transactions.filter((transaction) => {
    if (month && !transaction.date.startsWith(month)) return false
    if (type !== 'all' && transaction.type !== type) return false
    if (term && !`${transaction.category} ${transaction.note} ${transaction.personName || ''}`.toLocaleLowerCase('hu-HU').includes(term)) return false
    return true
  })
}

export function getMonthlySeries(transactions, months = 6, referenceDate = new Date()) {
  const result = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const summary = calculateSummary(transactions.filter((item) => item.date.startsWith(key)))
    result.push({ key, label: new Intl.DateTimeFormat('hu-HU', { month: 'short' }).format(date), ...summary })
  }
  return result
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  return /[";,\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function transactionsToCsv(transactions, currency = 'HUF') {
  if (!FINANCE_CURRENCIES.has(currency)) throw new Error('Érvénytelen pénznem.')
  const header = ['Dátum', 'Típus', 'Kategória', 'Összeg', 'Pénznem', 'Megjegyzés', 'Bizonylat']
  const rows = transactions.map((item) => [
    item.date,
    item.type === 'income' ? 'Bevétel' : 'Kiadás',
    item.category,
    Number(item.amount).toFixed(2),
    currency,
    item.note,
    item.receipt?.name || '',
  ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}`
}

export function parseCsvRows(source, delimiter = ';') {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const text = String(source || '').replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (quoted) throw new Error('Lezáratlan idézőjel a CSV-ben.')
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  return rows.filter((cells) => cells.some((value) => value.trim()))
}

export function csvHasCurrencyColumn(source) {
  const sample = String(source || '').split(/\r?\n/, 1)[0]
  const delimiter = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ','
  return parseCsvRows(sample, delimiter)[0]?.some((header) => ['pénznem', 'penznem', 'currency'].includes(header.trim().toLocaleLowerCase('hu-HU'))) || false
}

export function transactionsFromCsv(source, expectedCurrency = '') {
  const sample = String(source || '').split(/\r?\n/, 1)[0]
  const delimiter = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ','
  const rows = parseCsvRows(source, delimiter)
  if (rows.length < 2) return []
  const headers = rows[0].map((header) => header.trim().toLocaleLowerCase('hu-HU'))
  const find = (...names) => headers.findIndex((header) => names.includes(header))
  const indexes = {
    date: find('dátum', 'datum', 'date'), type: find('típus', 'tipus', 'type'),
    category: find('kategória', 'kategoria', 'category'), amount: find('összeg', 'osszeg', 'amount'),
    note: find('megjegyzés', 'megjegyzes', 'note', 'description'),
    currency: find('pénznem', 'penznem', 'currency'),
  }
  if (indexes.date < 0 || indexes.amount < 0) throw new Error('A CSV-ben Dátum és Összeg oszlop szükséges.')
  return rows.slice(1).map((row) => {
    if (indexes.currency >= 0) {
      const rowCurrency = String(row[indexes.currency] || '').trim().toUpperCase()
      if (!FINANCE_CURRENCIES.has(rowCurrency)) throw new Error('A CSV egyik sorában hiányzik vagy érvénytelen a pénznem.')
      if (expectedCurrency && rowCurrency !== expectedCurrency) throw new Error(`A CSV pénzneme ${rowCurrency}, a naplóé ${expectedCurrency}. Átváltás nélkül nem importálható.`)
    }
    const rawAmount = String(row[indexes.amount] || '').replace(/\s/g, '').replace(',', '.')
    const rawType = String(row[indexes.type] || '').toLocaleLowerCase('hu-HU')
    const type = rawType.includes('bev') || rawType === 'income' ? 'income' : 'expense'
    return normalizeTransaction({
      date: row[indexes.date], type, amount: Math.abs(Number(rawAmount)),
      category: indexes.category >= 0 ? row[indexes.category] : '',
      note: indexes.note >= 0 ? row[indexes.note] : '',
    })
  })
}

export function categorySummary(transactions) {
  const totals = new Map()
  for (const item of transactions) totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount || 0))
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}
