import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageLabel, validationSummary } from '../src/ebook/epub-validation.js'

test('EPUBCheck summary distinguishes valid, warning and invalid books', () => {
  assert.deepEqual(validationSummary({ summary: {} }), {
    kind: 'success', label: 'Érvényes EPUB', counts: { fatals: 0, errors: 0, warnings: 0, infos: 0 },
  })
  assert.equal(validationSummary({ summary: { warnings: 2 } }).kind, 'warning')
  assert.equal(validationSummary({ summary: { errors: 1, warnings: 2 } }).kind, 'error')
  assert.equal(validationSummary({ summary: { fatals: 1 } }).kind, 'error')
})

test('EPUBCheck message codes receive understandable Hungarian categories', () => {
  assert.equal(messageLabel({ code: 'RSC-005' }), 'Fájl vagy hivatkozás')
  assert.equal(messageLabel({ code: 'OPF-003' }), 'Könyvadatok és fájllista')
  assert.equal(messageLabel({ code: 'UNKNOWN-001' }), 'EPUB-ellenőrzés')
})
