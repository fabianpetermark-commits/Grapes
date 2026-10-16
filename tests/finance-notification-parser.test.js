import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFinanceNotification } from '../src/finance-notification-parser.js'

test('EUR card purchase becomes review-only expense candidate', () => {
  const candidate = parseFinanceNotification({ title: 'Kártyás vásárlás', text: '24,90 EUR terhelés', packageName: 'bank.example' })
  assert.equal(candidate.type, 'expense')
  assert.equal(candidate.originalAmount, 24.9)
  assert.equal(candidate.originalCurrency, 'EUR')
  assert.equal(candidate.requiresConfirmation, true)
})
test('incoming HUF credit becomes review-only income candidate', () => {
  const candidate = parseFinanceNotification({ title: 'Jóváírás', text: '12 345 Ft érkezett' })
  assert.equal(candidate.type, 'income')
  assert.equal(candidate.originalAmount, 12345)
})
test('ambiguous or missing notification values do not create transactions', () => {
  assert.equal(parseFinanceNotification({ title: 'Új üzenet', text: 'Banki ajánlat' }), null)
  assert.equal(parseFinanceNotification({ title: 'Értesítés', text: '24,90 EUR' }), null)
  assert.equal(parseFinanceNotification({ title: 'Fizetés és jóváírás', text: '24,90 EUR' }), null)
})
