import test from 'node:test'
import assert from 'node:assert/strict'
import { claimLegacyWater, inspectLegacyWater, profileWaterBackupFromJson,
  profileWaterBackupToJson, readProfileWater, waterProfileKey,
  writeProfileWater } from '../src/water/water-profile-store.js'

const anna = '123e4567-e89b-12d3-a456-426614174000'
const bela = '123e4567-e89b-12d3-a456-426614174001'
const days = { '2026-10-24': { goal: 2000, entries: [
  { id: 'water-old', amount: 250, at: '2026-10-24T08:00:00.000Z', externalKey: 'healthconnect:synthetic:1' }
] } }
function storage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)) }
}

test('profile Water reads and writes are isolated and v2 backup is owner-bound', () => {
  const local = storage()
  writeProfileWater(local, anna, days, null)
  assert.deepEqual(readProfileWater(local, anna), days)
  assert.deepEqual(readProfileWater(local, bela), {})
  const backup = profileWaterBackupToJson(local, anna)
  assert.deepEqual(profileWaterBackupFromJson(backup, anna), { days, legacy: false })
  assert.throws(() => profileWaterBackupFromJson(backup, bela), /másik TEST-profilhoz/)
  assert.notEqual(waterProfileKey(anna), waterProfileKey(bela))
})

test('legacy Water is explicitly claimed once without changing original bytes', async () => {
  const original = JSON.stringify(days)
  const local = storage({ 'grapes-water-v1': original, [waterProfileKey(anna)]: '{}' })
  let owner = null
  const claimOwner = async id => {
    if (owner && owner !== id) throw new Error('already claimed')
    owner = id
  }
  assert.deepEqual(inspectLegacyWater(local, owner, anna),
    { status: 'available', days: 1, entries: 1, linkedRecords: 1 })
  await claimLegacyWater(local, anna, claimOwner)
  assert.equal(local.getItem('grapes-water-v1'), original)
  assert.deepEqual(readProfileWater(local, anna), days)
  assert.equal(inspectLegacyWater(local, owner, bela).status, 'other-profile')
  await assert.rejects(claimLegacyWater(local, bela, claimOwner), /already claimed/)
  assert.deepEqual(readProfileWater(local, bela), {})
})

test('damaged legacy and failed profile copy preserve all original bytes', async () => {
  const broken = storage({ 'grapes-water-v1': '{damaged' })
  await assert.rejects(claimLegacyWater(broken, anna, async () => {}), /nem érvényes JSON/)
  assert.equal(broken.getItem('grapes-water-v1'), '{damaged')
  const original = JSON.stringify(days)
  const local = storage({ 'grapes-water-v1': original })
  let owner = null
  const failing = { ...local, setItem(key, value) {
    if (key === waterProfileKey(anna)) throw new Error('synthetic quota')
    local.setItem(key, value)
  } }
  await assert.rejects(claimLegacyWater(failing, anna, async id => { owner = id }), /synthetic quota/)
  assert.equal(owner, anna)
  assert.equal(local.getItem('grapes-water-v1'), original)
  assert.equal(local.getItem(waterProfileKey(anna)), null)
  await claimLegacyWater(local, anna, async id => { assert.equal(id, owner) })
  assert.deepEqual(readProfileWater(local, anna), days)
})
