import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSummary, categorySummary, csvHasCurrencyColumn, filterTransactions, getMonthlySeries,
  financeBackupFromJson, financeBackupToJson, normalizeTransaction, parseCsvRows, transactionsFromCsv, transactionsToCsv,
} from '../src/finance-data.js'

const rows = [
  { id: '1', type: 'income', amount: 500000, date: '2026-10-01', category: 'Munkabér', note: '' },
  { id: '2', type: 'expense', amount: 12000, date: '2026-10-02', category: 'Élelmiszer', note: 'heti bevásárlás' },
  { id: '3', type: 'expense', amount: 8000, date: '2026-09-11', category: 'Élelmiszer', note: '' },
]

test('normalizes and validates financial transactions', () => {
  assert.throws(() => normalizeTransaction({ amount: 1, date: '2026-02-30' }), /dátum/)
  assert.equal(normalizeTransaction({ amount: 1, date: '2026-01-01', category: '   ' }).category, 'Egyéb kiadás')
  assert.equal(normalizeTransaction({ type: 'income', amount: '12.345', date: '2026-01-02' }).amount, 12.35)
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
