import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSummary, categorySummary, filterTransactions, getMonthlySeries,
  normalizeTransaction, parseCsvRows, transactionsFromCsv, transactionsToCsv,
} from '../src/finance-data.js'

const rows = [
  { id: '1', type: 'income', amount: 500000, date: '2026-10-01', category: 'Munkabér', note: '' },
  { id: '2', type: 'expense', amount: 12000, date: '2026-10-02', category: 'Élelmiszer', note: 'heti bevásárlás' },
  { id: '3', type: 'expense', amount: 8000, date: '2026-09-11', category: 'Élelmiszer', note: '' },
]

test('normalizes and validates financial transactions', () => {
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
  const source = transactionsToCsv([{ ...rows[1], note: 'Kenyér; tej, "akciós"' }])
  const parsed = transactionsFromCsv(source)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].type, 'expense')
  assert.equal(parsed[0].amount, 12000)
  assert.equal(parsed[0].note, 'Kenyér; tej, "akciós"')
})

test('CSV parser supports commas and embedded newlines', () => {
  const parsed = parseCsvRows('Dátum,Összeg,Megjegyzés\n2026-01-01,12,"két\nsor"', ',')
  assert.equal(parsed[1][2], 'két\nsor')
})
