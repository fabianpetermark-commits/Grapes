import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { firstProductBarcode } from '../src/food/food-barcode.js'
import { writeWaterStoreVerified } from '../src/water/water-backup.js'

const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../src/android-mobile-shell.js', import.meta.url), 'utf8')

test('a Food mobilkereső a már tesztelt magyar keresőalgoritmust használja', () => {
  assert.match(mobile, /import \{ searchFoods, foodSourceLabel \} from '\.\/food-search\.js'/)
  assert.match(mobile, /searchFoods\(project\.customFoods\.filter\(acceptsLocal\), query/)
  assert.match(mobile, /const sourceLabel = foodSourceLabel\(food\)/)
})

test('a fotó és az élő olvasó csak az első érvényes kódot választja', () => {
  assert.match(mobile, /import \{ firstProductBarcode \} from '\.\/food-barcode\.js'/)
  assert.equal(mobile.match(/firstProductBarcode\(codes\)/g)?.length, 2)
  assert.equal(firstProductBarcode([
    { rawValue: 'QR: not a barcode' },
    { rawValue: 'ABC12345' },
    { rawValue: ' 05991234567890 ' },
    { rawValue: '5991234567890' },
  ]), '05991234567890')
  assert.equal(firstProductBarcode([{ rawValue: 'not-a-code' }, null]), '')
  assert.equal(firstProductBarcode(null), '')
  assert.match(mobile, /Nem található érvényes termékvonalkód a fotón/)
  assert.match(mobile, /URL\.revokeObjectURL\(url\); throw error/)
})

test('a víznapló mentése a 60 napnál régebbi Health előzményeket sem törli', () => {
  assert.match(shell, /writeWaterStoreVerified\(localStorage, store, expectedRaw\)/)
  const store = {
    '2025-02-18': { goal: 2000, entries: [{ id: 'historical', amount: 250, at: '2025-02-18T08:00:00.000Z', externalKey: 'healthconnect:old' }] },
    '2026-10-17': { goal: 2000, entries: [{ id: 'new', amount: 500, at: '2026-10-17T08:00:00.000Z' }] },
  }
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  writeWaterStoreVerified(storage, store, null)
  const saved = JSON.parse(values.get('grapes-water-v1'))
  assert.equal(saved['2025-02-18'].entries[0].externalKey, 'healthconnect:old')
  assert.equal(saved['2026-10-17'].entries[0].amount, 500)
  assert.equal(Object.keys(store).length, 2, 'Az eredeti tárolót sem módosíthatja a mentés')
})
