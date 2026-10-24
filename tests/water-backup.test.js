import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readWaterStoreStrict,waterBackupToJson,waterBackupFromJson,waterBackupSummary,verifyWaterPreserved,
  writeWaterStoreVerified,restoreWaterBackupVerified,
} from '../src/water/water-backup.js'

function memoryStore(initial) {
  const map=new Map(initial? [['grapes-water-v1',JSON.stringify(initial)]] : [])
  return {getItem(key){return map.has(key)?map.get(key):null},
    setItem(key,value){map.set(key,value)}}
}
const waterHistory={
  '2026-01-01': {goal:2250,entries:[{id:'old-1',amount:250,at:'2026-01-01T08:15:00.000Z'},
    {id:'health-1',amount:310,at:'2026-01-01T14:11:00.000Z',
      source:'Synthetic Health',externalKey:'healthconnect:synthetic:water-1'}]},
  '2026-10-18': {goal:1800,entries:[{id:'today-1',amount:500,at:'2026-10-18T10:50:00.000Z'}]},
}
test('Water JSON export keeps every historic day, goal, amount and Health Connect identity',()=>{
  const source=memoryStore(waterHistory)
  const backup=waterBackupToJson(source,'2026-10-18T10:00:00.000Z')
  assert.deepEqual(waterBackupFromJson(backup),waterHistory)
  assert.deepEqual(readWaterStoreStrict(source),waterHistory)
  assert.deepEqual(waterBackupSummary(waterHistory),{days:2,entries:3,linkedRecords:1})
  assert.equal(verifyWaterPreserved(waterHistory,JSON.parse(JSON.stringify(waterHistory))),true)
  const parsed=JSON.parse(backup)
  assert.equal(parsed.grapesWaterBackup,true)
  assert.equal(parsed.data['2026-01-01'].entries[1].externalKey,'healthconnect:synthetic:water-1')
})
test('Water reads are lossless and never silently replace corrupt stored data with empty',()=>{
  assert.deepEqual(readWaterStoreStrict(memoryStore(null)),{})
  const bad={getItem:()=>'{ incomplete'}
  assert.throws(()=>readWaterStoreStrict(bad),/nem érvényes JSON/)
  assert.throws(()=>waterBackupFromJson('{}'),/Nem támogatott/)
  assert.throws(()=>waterBackupFromJson(JSON.stringify({grapesWaterBackup:true,version:1,
    data:{'2026-01-01':{goal:2000,entries:[{id:'x',amount:-5,at:'2026-01-01T10:00:00Z'}]}}})),/érvénytelen/)
  assert.throws(()=>verifyWaterPreserved(waterHistory,{}),/megváltozott/)
})
test('Water save and restore supports a byte-for-byte round trip through a local storage writer',()=>{
  const store=memoryStore(waterHistory)
  const backup=waterBackupToJson(store)
  const restored=waterBackupFromJson(backup)
  store.setItem('grapes-water-v1',JSON.stringify(restored))
  assert.deepEqual(readWaterStoreStrict(store),waterHistory)
})

test('damaged Water bytes and stale edits cannot be silently overwritten',()=>{
  const store=memoryStore(waterHistory)
  const before=store.getItem('grapes-water-v1')
  store.setItem('grapes-water-v1','{damaged')
  assert.throws(()=>writeWaterStoreVerified(store,{},before),/nem érvényes JSON/)
  assert.equal(store.getItem('grapes-water-v1'),'{damaged')
  store.setItem('grapes-water-v1',before)
  assert.throws(()=>writeWaterStoreVerified(store,{},'{stale'),/időközben megváltozott/)
  assert.equal(store.getItem('grapes-water-v1'),before)
  store.setItem('grapes-water-v1','')
  assert.throws(()=>writeWaterStoreVerified(store,{},''),/üres/)
  assert.equal(store.getItem('grapes-water-v1'),'')
})

test('interrupted Water writes do not report success and restore checkpoints never overwrite',()=>{
  const store=memoryStore(waterHistory)
  const before=store.getItem('grapes-water-v1')
  const failed={...store,setItem(key,value){if(key==='grapes-water-v1')throw new Error('QuotaExceededError');store.setItem(key,value)}}
  assert.throws(()=>writeWaterStoreVerified(failed,{},before),/QuotaExceededError/)
  assert.equal(store.getItem('grapes-water-v1'),before)
  store.setItem('grapes-water-v1','{damaged')
  const key=restoreWaterBackupVerified(store,waterHistory,'synthetic-1')
  assert.equal(store.getItem(key),'{damaged')
  assert.deepEqual(readWaterStoreStrict(store),waterHistory)
  assert.throws(()=>restoreWaterBackupVerified(store,{},'synthetic-1'),/már létezik/)
  assert.equal(store.getItem(key),'{damaged')
})
