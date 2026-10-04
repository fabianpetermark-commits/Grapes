import { validDate } from './billing-data.js'

export const DEFAULT_CATEGORIES = {
  income: ['Munkabér', 'Értékesítés', 'Szolgáltatás', 'Visszatérítés', 'Egyéb bevétel'],
  expense: ['Lakhatás', 'Élelmiszer', 'Közlekedés', 'Számlák', 'Egészség', 'Szórakozás', 'Adó', 'Egyéb kiadás'],
}

export function normalizeTransaction(value = {}) {
  const type = value.type === 'income' ? 'income' : 'expense'
  const amount = Math.round(Number(value.amount) * 100) / 100
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
    receipt: value.receipt || null,
    createdAt: value.createdAt || new Date().toISOString(),
  }
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
    if (term && !`${transaction.category} ${transaction.note}`.toLocaleLowerCase('hu-HU').includes(term)) return false
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

export function transactionsToCsv(transactions) {
  const header = ['Dátum', 'Típus', 'Kategória', 'Összeg', 'Megjegyzés', 'Bizonylat']
  const rows = transactions.map((item) => [
    item.date,
    item.type === 'income' ? 'Bevétel' : 'Kiadás',
    item.category,
    Number(item.amount).toFixed(2),
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

export function transactionsFromCsv(source) {
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
  }
  if (indexes.date < 0 || indexes.amount < 0) throw new Error('A CSV-ben Dátum és Összeg oszlop szükséges.')
  return rows.slice(1).map((row) => {
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
