import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSavings, calculateSummary, categorySummary, csvHasCurrencyColumn, detectRecurringTransactions,
  filterTransactions, forecastFinances, getMonthlySeries, financeBackupFromJson, financeBackupToJson,
  formatMoneyInput, normalizePerson, normalizeSavingsEntry, normalizeSavingsGoal, normalizeTransaction, parseCsvRows, parseMoneyInput,
  transactionsFromCsv, transactionsToCsv,
} from '../src/finance-data.js'

const rows = [
  { id: '1', type: 'income', amount: 500000, date: '2026-10-01', category: 'Munkabér', note: '' },
  { id: '2', type: 'expense', amount: 12000, date: '2026-10-02', category: 'Élelmiszer', note: 'heti bevásárlás' },
  { id: '3', type: 'expense', amount: 8000, date: '2026-09-11', category: 'Élelmiszer', note: '' },
]

test('normalizes and validates financial transactions', () => {
  assert.throws(() => normalizeTransaction({ amount: 1, date: '2026-02-30' }), /dátum/)
  assert.equal(normalizeTransaction({ amount: 1, date: '2026-01-01', category: '   ' }).category, 'Egyéb kiadás')
  assert.equal(normalizeTransaction({ type: 'income', amount: '12,345', date: '2026-01-02' }).amount, 12.35)
  assert.throws(() => normalizeTransaction({ amount: 0, date: '2026-01-02' }), /nullánál nagyobbnak/)
  assert.throws(() => normalizeTransaction({ amount: 1, date: '02-01-2026' }), /dátum/)
})

test('calculates totals and filters by month, type and text', () => {
  assert.deepEqual(calculateSummary(rows), { income: 500000, expense: 20000, balance: 480000 })
  assert.deepEqual(filterTransactions(rows, { month: '2026-10', type: 'expense' }).map((item) => item.id), ['2'])
  assert.deepEqual(filterTransactions(rows, { search: 'bevásárlás' }).map((item) => item.id), ['2'])
})

test('creates stable monthly and category summaries', () => {
  const series = getMonthlySeries(rows, 2, new Date(2026, 9, 4))
  assert.deepEqual(series.map(({ key, income, expense }) => ({ key, income, expense })), [
    { key: '2026-09', income: 0, expense: 8000 },
    { key: '2026-10', income: 500000, expense: 12000 },
  ])
  assert.deepEqual(categorySummary(rows.filter((item) => item.type === 'expense')), [
    { category: 'Élelmiszer', amount: 20000 },
  ])
})

test('CSV export and import preserve quoted Hungarian data', () => {
  const source = transactionsToCsv([{ ...rows[1], note: 'Kenyér; tej, "akciós"' }], 'EUR')
  assert.equal(csvHasCurrencyColumn(source), true)
  const parsed = transactionsFromCsv(source, 'EUR')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].type, 'expense')
  assert.equal(parsed[0].amount, 12000)
  assert.equal(parsed[0].note, 'Kenyér; tej, "akciós"')
  assert.throws(() => transactionsFromCsv(source, 'HUF'), /Átváltás nélkül/)
  assert.equal(csvHasCurrencyColumn('Dátum;Összeg\n2026-01-01;12'), false)
  assert.equal(transactionsFromCsv('Dátum;Összeg\n2026-01-01;12', 'HUF').length, 1)
})

test('CSV parser supports commas and embedded newlines', () => {
  assert.throws(() => parseCsvRows('Dátum;Összeg\n"2026-01-01;12'), /idézőjel/)
  const parsed = parseCsvRows('Dátum,Összeg,Megjegyzés\n2026-01-01,12,"két\nsor"', ',')
  assert.equal(parsed[1][2], 'két\nsor')
})

test('financial totals do not accumulate fractional currency errors', () => {
  assert.deepEqual(calculateSummary([{type:'income',amount:0.1},{type:'income',amount:0.2},{type:'expense',amount:0.1}]), {income:0.3,expense:0.1,balance:0.2})
})

test('receipts retain safe attachments and reject executable imported URLs', () => {
  const receipt = {name:'szamla.pdf',size:3,type:'application/pdf',data:'data:application/pdf;base64,YWJj'}
  assert.deepEqual(normalizeTransaction({...rows[0],receipt}).receipt,receipt)
  assert.throws(() => normalizeTransaction({...rows[0],receipt:{...receipt,data:'javascript:alert(1)'}}), /bizonylat/)
})

test('complete finance backup restores currency, transaction ids and receipt contents', () => {
  const receipt = { name: 'szamla.pdf', size: 3, type: 'application/pdf', data: 'data:application/pdf;base64,YWJj' }
  const source = { currency: 'EUR', transactions: [{ ...rows[0], receipt }] }
  const json = financeBackupToJson(source, '2026-10-06T12:00:00.000Z')
  assert.equal(JSON.parse(json).exportedAt, '2026-10-06T12:00:00.000Z')
  const restored = financeBackupFromJson(json)
  assert.equal(restored.currency, 'EUR')
  assert.equal(restored.transactions[0].id, rows[0].id)
  assert.equal(restored.transactions[0].amount, rows[0].amount)
  assert.deepEqual(restored.transactions[0].receipt, receipt)
})

test('complete finance backup rejects invalid receipts and duplicate ids without partial restore', () => {
  const source = { currency: 'HUF', transactions: [rows[0]] }
  const payload = JSON.parse(financeBackupToJson(source))
  payload.data.transactions[0].receipt = { name: 'bad', size: 1, type: 'text/html', data: 'javascript:alert(1)' }
  assert.throws(() => financeBackupFromJson(JSON.stringify(payload)), /bizonylat/)
  payload.data.transactions = [rows[0], rows[0]]
  assert.throws(() => financeBackupFromJson(JSON.stringify(payload)), /ismétlődő/)
  payload.data.currency = 'GBP'
  assert.throws(() => financeBackupFromJson(JSON.stringify(payload)), /nem támogatott/)
})

test('formats and parses Hungarian money input', () => {
  assert.equal(formatMoneyInput('7000'), '7.000')
  assert.equal(formatMoneyInput('1234567,89'), '1.234.567,89')
  assert.equal(formatMoneyInput('12.5'), '12,5')
  assert.equal(parseMoneyInput('1.234.567,89'), 1234567.89)
  assert.equal(normalizeTransaction({ amount: '7.000', date: '2026-01-01' }).amount, 7000)
})

test('people, savings goals and savings entries validate and calculate reserve', () => {
  const person = normalizePerson({ id: 'p1', name: ' Anna ' })
  const goal = normalizeSavingsGoal({ id: 'g1', name: 'Vésztartalék', targetAmount: 600000, startDate: '2026-01-01', targetDate: '2026-12-31', personId: person.id })
  const entries = [
    normalizeSavingsEntry({ id: 's1', type: 'deposit', amount: 100000, date: '2026-01-02', goalId: goal.id, personId: person.id }),
    normalizeSavingsEntry({ id: 's2', type: 'withdrawal', amount: 20000, date: '2026-02-02', goalId: goal.id }),
  ]
  assert.equal(person.name, 'Anna')
  assert.equal(calculateSavings(entries), 80000)
  assert.equal(calculateSavings(entries, goal.id), 80000)
  assert.throws(() => normalizeSavingsGoal({ name: 'Hibás', targetAmount: 1, startDate: '2026-12-31', targetDate: '2026-01-01' }), /célidőszak/)
})

test('forecast uses recurring transactions, trends and exposes confidence', () => {
  const history = [
    { id: 'a', type: 'income', amount: 500000, date: '2026-07-05', category: 'Munkabér', note: 'Fizetés' },
    { id: 'b', type: 'income', amount: 500000, date: '2026-08-05', category: 'Munkabér', note: 'Fizetés' },
    { id: 'c', type: 'income', amount: 500000, date: '2026-09-05', category: 'Munkabér', note: 'Fizetés' },
    { id: 'd', type: 'expense', amount: 120000, date: '2026-08-10', category: 'Lakhatás', note: 'Albérlet' },
    { id: 'e', type: 'expense', amount: 120000, date: '2026-09-10', category: 'Lakhatás', note: 'Albérlet' },
  ]
  assert.equal(detectRecurringTransactions(history, new Date(2026, 9, 8)).length, 2)
  const forecast = forecastFinances(history, [
    { type: 'deposit', amount: 50000, date: '2026-08-20' },
    { type: 'deposit', amount: 50000, date: '2026-09-20' },
  ], { historyMonths: 3, futureMonths: 3, referenceDate: new Date(2026, 9, 8) })
  assert.equal(forecast.months.length, 3)
  assert.ok(forecast.expectedIncome >= 1500000)
  assert.ok(forecast.expectedExpense >= 360000)
  assert.ok(forecast.expectedReserve > forecast.reserveNow)
  assert.equal(forecast.confidence, 'medium')
})

test('complete backup includes the extended finance model and reads version one backups', () => {
  const data = {
    currency: 'HUF', transactions: [rows[0]], people: [{ id: 'p1', name: 'Anna' }],
    categories: { income: ['Bónusz'], expense: ['Oktatás'] },
    savingsGoals: [{ id: 'g1', name: 'Utazás', targetAmount: 100000, startDate: '2026-01-01', targetDate: '2026-12-31' }],
    savingsEntries: [{ id: 's1', type: 'deposit', amount: 10000, date: '2026-02-01', goalId: 'g1' }],
    forecastSettings: { historyMonths: 12, futureMonths: 6 },
  }
  const restored = financeBackupFromJson(financeBackupToJson(data))
  assert.equal(restored.people[0].name, 'Anna')
  assert.equal(restored.savingsGoals[0].name, 'Utazás')
  assert.equal(restored.savingsEntries[0].amount, 10000)
  assert.deepEqual(restored.forecastSettings, { historyMonths: 12, futureMonths: 6 })
  const legacy = { grapesFinanceBackup: true, version: 1, data: { version: 1, currency: 'HUF', transactions: [rows[0]] } }
  assert.equal(financeBackupFromJson(JSON.stringify(legacy)).transactions.length, 1)
})
