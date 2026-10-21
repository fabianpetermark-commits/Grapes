import test from 'node:test'
import assert from 'node:assert/strict'
import { claimLegacyWaterStore, legacyWaterStatus, readWaterStore, restoreWaterBackup, waterBackupFromJson, waterBackupToJson, waterKey, waterProfileId, writeWaterStore } from '../src/water-store.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    raw: key => values.get(key),
    keys: () => values.keys(),
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

test('Water backup roundtrip, profile gate and recovery copy', () => {
  const local = storage()
  writeWaterStore(local, 'anna', { '2026-10-19': { goal: 2100, entries: [{ id: 'one', amount: 350 }] } })
  const exported = waterBackupToJson(local, 'anna')
  assert.throws(() => waterBackupFromJson(exported, 'bela'), /másik profilhoz/)
  const key = waterKey('anna')
  local.setItem(key, '{damaged')
  assert.equal(restoreWaterBackup(local, 'anna', exported), 1)
  assert.equal(readWaterStore(local, 'anna')['2026-10-19'].entries[0].amount, 350)
  assert.ok([...local.keys()].some(name => name.startsWith(key + ':before-restore:')))
})


test('failed copy cannot reserve legacy owner or damage the original diary', () => {
  const original = JSON.stringify({'2026-10-18': {goal: 1900, entries: [{id:'legacy',amount:275}]}})
  const local = storage({'grapes-water-v1':original})
  const priorSet = local.setItem
  local.setItem = (key,value) => {
    if(key===waterKey('anna')) throw new Error('QuotaExceededError')
    priorSet(key,value)
  }
  assert.throws(() => claimLegacyWaterStore(local,'anna'),/QuotaExceededError/)
  assert.equal(local.raw('grapes-water-v1'),original)
  assert.equal(local.raw('grapes-water-v1-claimed-by'),undefined)
  assert.equal(local.raw(waterKey('anna')),undefined)
  assert.equal(legacyWaterStatus(local,'bela').available,true,'A felülírás nélküli régi napló továbbra is kiosztható')
})

test('failed legacy owner marker rolls back only a verified newly copied profile snapshot', () => {
  const original=JSON.stringify({'2026-10-17':{goal:2100,entries:[{id:'a',amount:400}]}})
  const local=storage({'grapes-water-v1':original})
  const before=local.setItem
  local.setItem=(key,value)=>{
    if(key==='grapes-water-v1-claimed-by') throw new Error('OwnerMarkerWriteFailed')
    before(key,value)
  }
  assert.throws(()=>claimLegacyWaterStore(local,'anna'),/OwnerMarkerWriteFailed/)
  assert.equal(local.raw(waterKey('anna')),undefined)
  assert.equal(local.raw('grapes-water-v1-claimed-by'),undefined)
  assert.equal(local.raw('grapes-water-v1'),original)
})

test('successful legacy claim persists copied diary before owner assignment', () => {
  const original=JSON.stringify({'2026-10-16':{goal:2000,entries:[{id:'a',amount:200}]}})
  const local=storage({'grapes-water-v1':original})
  const writes=[]
  const before=local.setItem
  local.setItem=(key,value)=>{writes.push(key);before(key,value)}
  claimLegacyWaterStore(local,'anna')
  assert.deepEqual(writes,[waterKey('anna'),'grapes-water-v1-claimed-by'])
  assert.equal(local.raw('grapes-water-v1'),original)
})
