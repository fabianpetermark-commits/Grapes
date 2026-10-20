import test from 'node:test'
import assert from 'node:assert/strict'
import { claimLegacyWaterStore, legacyWaterStatus, readWaterStore, waterKey, waterProfileId, writeWaterStore } from '../src/water-store.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: key => values.get(key),
  }
}

test('water entries and goals stay inside the selected profile', () => {
  const local = storage()
  const anna = waterProfileId({ email: 'ANNA@example.com' })
  const bela = waterProfileId({ email: 'bela@example.com' })
  writeWaterStore(local, anna, { '2026-10-19': { goal: 2100, entries: [{ id: 'anna', amount: 250 }] } })
  assert.deepEqual(readWaterStore(local, bela), {})
  writeWaterStore(local, bela, { '2026-10-19': { goal: 1800, entries: [{ id: 'bela', amount: 300 }] } })
  assert.equal(readWaterStore(local, anna)['2026-10-19'].entries[0].id, 'anna')
  assert.equal(readWaterStore(local, bela)['2026-10-19'].entries[0].id, 'bela')
})

test('legacy water can be assigned once without deleting the original', () => {
  const original = JSON.stringify({ '2026-10-18': { goal: 1900, entries: [{ id: 'old', amount: 275 }] } })
  const local = storage({ 'grapes-water-v1': original })
  assert.equal(legacyWaterStatus(local, 'anna').available, true)
  assert.equal(claimLegacyWaterStore(local, 'anna'), 1)
  assert.equal(local.raw('grapes-water-v1'), original)
  assert.equal(readWaterStore(local, 'anna')['2026-10-18'].entries[0].amount, 275)
  assert.equal(legacyWaterStatus(local, 'bela').available, false)
  assert.throws(() => claimLegacyWaterStore(local, 'bela'))
})

test('corruption and a failed write never replace existing water bytes', () => {
  const profile = 'anna'
  const local = storage({ [waterKey(profile)]: '{broken', 'grapes-water-v1': '{also broken' })
  assert.equal(legacyWaterStatus(local, profile).damaged, true)
  assert.throws(() => readWaterStore(local, profile), /sérült/)
  assert.throws(() => writeWaterStore(local, profile, { invalid: { entries: [] } }))
  assert.equal(local.raw(waterKey(profile)), '{broken')
  assert.equal(local.raw('grapes-water-v1'), '{also broken')
  const failed = storage({ 'grapes-water-v1': JSON.stringify({ '2026-10-18': { goal: 2000, entries: [] } }) })
  failed.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => claimLegacyWaterStore(failed, profile), /QuotaExceededError/)
  assert.ok(failed.raw('grapes-water-v1'))
})
