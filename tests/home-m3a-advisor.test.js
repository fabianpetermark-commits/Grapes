import test from 'node:test'
import assert from 'node:assert/strict'
import { homeDateHints, homeRecipeHints } from '../src/home/home-advisor.js'

const lots = [
  { id: 'milk', name: 'Tej', quantityBase: 1000, displayUnit: 'ml', expiryKind: 'useBy', expiryDate: '2026-10-25', observedAt: '2026-10-24T10:00:00Z' },
  { id: 'rice', name: 'Rizs', quantityBase: 1000, displayUnit: 'g', expiryKind: 'bestBefore', expiryDate: '2026-10-20', observedAt: '2026-10-20T10:00:00Z' },
  { id: 'bread', name: 'Kenyér', quantityBase: 1, displayUnit: 'db', expiryKind: null, expiryDate: null },
  { id: 'expired-empty', name: 'Nincs', quantityBase: 0, displayUnit: 'g', expiryKind: 'useBy', expiryDate: '2026-10-20' },
  { id: 'future', name: 'Jövő', quantityBase: 1, displayUnit: 'db', expiryKind: 'useBy', expiryDate: '2026-10-29' },
]
const food = {
  customFoods: [{ id: 'f1', name: 'Tej' }, { id: 'f2', name: 'Rizs' }, { id: 'f3', name: 'Hagyma' }],
  recipes: [
    { id: 'r1', name: 'Tejberizs', ingredients: [{ foodId: 'f1', amount: 500, unit: 'ml' }, { foodId: 'f2', amount: 100, unit: 'g' }], yieldCount: 4 },
    { id: 'r2', name: 'Hagymás rizs', ingredients: [{ foodId: 'f3', amount: 50, unit: 'g' }, { foodId: 'f2', amount: 100, unit: 'g' }], yieldCount: null },
  ],
}

test('M3/A: ONLY actual label dates on present lots yield caution, no inferred expiry or safety claims', () => {
  const before = JSON.stringify(lots)
  const hints = homeDateHints(lots, '2026-10-25')
  assert.deepEqual(hints.map(x => x.id), ['rice', 'milk'])
  assert.match(hints[1].message, /Ne tekintsd automatikusan/)
  assert.match(hints[0].message, /minőségmegőrzési/)
  assert.equal(JSON.stringify(lots), before)
})

test('M3/A: Food recipe name matches are explainable candidates, NEVER a ready-to-cook assertion', () => {
  const before = JSON.stringify([lots, food])
  const hints = homeRecipeHints(lots, food)
  assert.equal(hints[0].name, 'Tejberizs')
  assert.equal(hints[0].matched.length, 2)
  assert.equal(hints[0].status, 'review')
  assert.match(hints[0].reason, /ellenőrizendő/)
  assert.equal(hints[1].unresolved[0], 'Hagyma')
  assert.equal(hints[1].yieldCount, null)
  assert.equal(JSON.stringify([lots, food]), before)
})

test('M3/A: neither absent nor incompatible units can fake available ingredients', () => {
  const hints = homeRecipeHints([{ ...lots[0], displayUnit: 'g' }], food)
  assert.equal(hints[0].matched.length + hints[1].matched.length, 0)
  assert.ok(hints.every(x => x.status === 'review'))
})
