import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  samsungAutoWaterKey, isSamsungAutoWaterEnabled, setSamsungAutoWaterEnabled,
  refreshFreshOwnerSamsungWater,
} from '../src/water/grapes-test-samsung-water-auto.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const record=(name,ml)=>({
  type:'hydration',externalId:'samsunghealth:com.sec.android.app.shealth:'+name,
  sourcePackage:'com.sec.android.app.shealth',
  startTime:'2026-10-25T09:15:00.000Z',
  endTime:'2026-10-25T09:15:00.000Z',volumeMilliliters:ml,
})
const payload=(...records)=>({
  schemaVersion:1,producer:'hu.grapes.healthconnect',
  generatedAt:'2026-10-26T09:00:00.000Z',records,
})
function fakeSession(owner=A) {
  const storage={days:{},version:0}
  let active=owner
  return {
    ownerId:owner,
    switchOwner:user=>{active=user},
    data:()=>storage.days,
    assertOwner:async()=>{if(active!==owner)throw Error('A Grapes-fiók megváltozott');return owner},
    read:async()=>({raw:String(storage.version),data:structuredClone(storage.days)}),
    save:async(days,raw)=>{
      if(raw!==String(storage.version))throw Error('CAS conflict')
      storage.days=structuredClone(days);storage.version++
    },
  }
}

test('Owner-scoped automatic Samsung Water consent isolated A vs B',()=>{
  const values=new Map()
  const storage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key),
  }
  assert.notEqual(samsungAutoWaterKey(A),samsungAutoWaterKey(B))
  assert.equal(isSamsungAutoWaterEnabled(storage,A),false)
  setSamsungAutoWaterEnabled(storage,A,true)
  assert.equal(isSamsungAutoWaterEnabled(storage,A),true)
  assert.equal(isSamsungAutoWaterEnabled(storage,B),false)
  setSamsungAutoWaterEnabled(storage,A,false)
  assert.equal(isSamsungAutoWaterEnabled(storage,A),false)
  assert.throws(()=>samsungAutoWaterKey('email@example.com'),/ellenőrizve/)
})

test('Samsung silent SDK -> owner Water CAS, subsequent scan deduplicates',async()=>{
  const session=fakeSession()
  const options={
    session,fromDate:'2026-10-01',
    getStatus:async()=>({available:true,permitted:true}),
    read:async()=>payload(record('water1',250),record('water2',320)),
  }
  let result=await refreshFreshOwnerSamsungWater(options)
  assert.deepEqual(result,{imported:2,duplicates:0})
  assert.deepEqual(session.data()['2026-10-25'].entries.map(x=>x.amount),[250,320])
  result=await refreshFreshOwnerSamsungWater(options)
  assert.deepEqual(result,{imported:0,duplicates:2})
  assert.equal(session.data()['2026-10-25'].entries.length,2)
})

test('permission missing: no reads, no saves, no prompt',async()=>{
  const session=fakeSession()
  let calls=0
  await assert.rejects(refreshFreshOwnerSamsungWater({
    session,fromDate:'2026-10-01',
    getStatus:async()=>({available:true,permitted:false}),
    read:async()=>{calls++;return payload(record('water',100))},
  }),/engedélyezve/)
  assert.equal(calls,0)
  assert.deepEqual(session.data(),{})
})

test('mid-read A to B account change aborts before any Water write',async()=>{
  const session=fakeSession()
  await assert.rejects(refreshFreshOwnerSamsungWater({
    session,fromDate:'2026-10-01',
    getStatus:async()=>({available:true,permitted:true}),
    read:async()=>{session.switchOwner(B);return payload(record('water',400))},
  }),/megváltozott/)
  assert.deepEqual(session.data(),{})
})

test('malformed native Samsung data aborts entire automatic import',async()=>{
  const session=fakeSession()
  await assert.rejects(refreshFreshOwnerSamsungWater({
    session,fromDate:'2026-10-01',
    getStatus:async()=>({available:true,permitted:true}),
    read:async()=>payload(record('water',240),record('bad',-1)),
  }),/Nem ellenőrizhető/)
  assert.deepEqual(session.data(),{})
})
