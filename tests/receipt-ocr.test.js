import test from 'node:test'
import assert from 'node:assert/strict'
import { extractReceiptAmountCandidates } from '../src/receipt-ocr.js'

test('a magyar végösszeget teszi az első helyre', () => {
  const candidates = extractReceiptAmountCandidates([
    'Tej 499 Ft',
    'Nettó 5 900 Ft',
    'ÁFA 1 593 Ft',
    'VÉGÖSSZEG 7 493 Ft',
  ].join('\n'))
  assert.equal(candidates[0].amount, 7493)
  assert.match(candidates[0].label, /VÉGÖSSZEG/)
})

test('a visszajáró és az átadott készpénz nem előzi meg az összesent', () => {
  const candidates = extractReceiptAmountCandidates([
    'ÖSSZESEN: 12.345 HUF',
    'KÉSZPÉNZ 20.000 Ft',
    'VISSZAJÁRÓ 7.655 Ft',
  ].join('\n'))
  assert.equal(candidates[0].amount, 12345)
})

test('kezeli a tizedesvesszős euróösszeget', () => {
  const candidates = extractReceiptAmountCandidates('TOTAL EUR 19,99')
  assert.equal(candidates[0].amount, 19.99)
})

test('a dátumból származó évszámot hátrasorolja', () => {
  const candidates = extractReceiptAmountCandidates('DÁTUM 2026. 10. 08.\nFIZETENDŐ 8 990 Ft')
  assert.equal(candidates[0].amount, 8990)
})

test('azonos összeget csak egyszer ad vissza', () => {
  const candidates = extractReceiptAmountCandidates('Részösszeg 7 000 Ft\nÖSSZESEN 7.000 HUF')
  assert.equal(candidates.filter((item) => item.amount === 7000).length, 1)
  assert.match(candidates[0].label, /ÖSSZESEN/)
})
