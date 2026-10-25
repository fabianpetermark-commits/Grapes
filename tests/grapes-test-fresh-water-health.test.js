import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareFreshOwnerWaterHydration, confirmFreshOwnerWaterHydration,
} from '../src/water/grapes-test-fresh-water-health.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const hydration=(id='w1',ml=250)=>({
  type:'hydration',externalId:'healthconnect:qa:'+id,
  sourcePackage:'com.samsung.android.app.healthdata',
  startTime:'2026-10-25T09:15:00Z',endTime:'2026-10-25T09:15:00Z',
  volumeMilliliters:ml,
})
const nutrition={type:'nutrition',externalId:'healthconnect:qa:n1',
  sourcePackage:'com.samsung.android.app.healthdata',
  startTime:'2026-10-25T08:00:00Z',endTime:'2026-10-25T08:05:00Z',
  energyKcal:250}
const source={schemaVersion:1,producer:'hu.grapes.healthconnect',
  generatedAt:'2026-10-25T10:00:00Z',records:[hydration(),nutrition]}
function fakeSession(ownerId=A){
  let raw=null,days={},writes=0
  return {
    ownerId,
    async assertOwner(){return ownerId},
    async read(){return {raw,data:structuredClone(days)}},
    async save(next,expected){assert.equal(expected,raw);
      days=structuredClone(next);raw=JSON.stringify(days);writes++;return raw},
    get snapshot(){return structuredClone(days)},
    get writes(){return writes},
  }
}
test('Water preview shows hydration; nutrition only blocked, no writes',()=>{
  const preview=prepareFreshOwnerWaterHydration(source,{ownerId:A})
  assert.deepEqual(preview.counts,{ready:1,duplicate:0,invalid:0,blocked:1})
  assert.equal(preview.records[0].entry.profileId,A)
  assert.equal(preview.records[1].entry,null)
})
test('Water confirm writes selected water atomically, provenance and idempotence',async()=>{
  const session=fakeSession(),preview=prepareFreshOwnerWaterHydration(source,{ownerId:A})
  const result=await confirmFreshOwnerWaterHydration({
    session,preview,selectedIndexes:[0]})
  assert.equal(result.imported,1)
  assert.equal(session.writes,1)
  const entries=Object.values(session.snapshot).flatMap(day=>day.entries)
  assert.equal(entries.length,1)
  assert.equal(entries[0].amount,250)
  assert.equal(entries[0].externalKey,'healthconnect:qa:w1')
  assert.equal(entries[0].source,'com.samsung.android.app.healthdata')
  const again=await confirmFreshOwnerWaterHydration({
    session,preview,selectedIndexes:[0]})
  assert.equal(again.imported,0)
  assert.equal(session.writes,1)
  const repeated=prepareFreshOwnerWaterHydration(source,{
    ownerId:A,existingDays:session.snapshot})
  assert.deepEqual(repeated.counts,{ready:0,duplicate:1,invalid:0,blocked:1})
})
test('Wrong account, nutrition, duplicate selection rejected before write',async()=>{
  const session=fakeSession(),preview=prepareFreshOwnerWaterHydration(source,{ownerId:A})
  for(const args of [
    {session:fakeSession(B),preview,selectedIndexes:[0]},
    {session,preview,selectedIndexes:[1]},
    {session,preview,selectedIndexes:[0,0]},
    {session,preview,selectedIndexes:[500]},
    {session:{},preview,selectedIndexes:[0]},
  ]) await assert.rejects(confirmFreshOwnerWaterHydration(args))
  assert.equal(session.writes,0)
})
test('Duplicate source rows, damaged amount, invalid owner fail closed',()=>{
  const s={...source,records:[hydration(),hydration(),
    hydration('bad',-4),nutrition]}
  const p=prepareFreshOwnerWaterHydration(s,{ownerId:A})
  assert.deepEqual(p.counts,{ready:1,duplicate:1,invalid:1,blocked:1})
  assert.throws(()=>prepareFreshOwnerWaterHydration(source,{ownerId:'legacy-owner'}))
})
