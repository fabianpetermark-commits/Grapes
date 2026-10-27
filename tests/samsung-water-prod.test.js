import test from 'node:test'
import assert from 'node:assert/strict'
import {createSamsungWaterSync,prepareSamsungWater,waterForSamsungOwner,mergeWaterForSamsungOwner,samsungConsentKey} from '../src/water/samsung-water-sync.js'
import {parseSamsungWaterCsv} from '../src/water/samsung-water-csv.js'
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
const at='2026-10-25T12:00:00Z'
const record=(id,amount=250)=>({type:'hydration',externalId:'samsunghealth:com.sec.android.app.shealth:'+id,sourcePackage:'com.sec.android.app.shealth',startTime:at,endTime:at,volumeMilliliters:amount})
const payload=(owner,...records)=>({schemaVersion:1,producer:'hu.grapes.healthconnect',generatedAt:at,ownerId:owner,records})
const memory=()=>{const data=new Map();return{data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}}
function setup(){
  const storage=memory();let owner=A,permitted=true,available=true,reads=0,silent=0,time=Date.now()
  const sync=createSamsungWaterSync({storage,getStatus:async()=>({ownerId:owner,available,permitted}),read:async()=>{reads++;return payload(owner,record('1'))},readSilent:async()=>{silent++;return payload(owner,record('1'))},now:()=>time})
  return {sync,storage,setOwner:v=>owner=v,deny:()=>permitted=false,missing:()=>available=false,counts:()=>({reads,silent}),tick:()=>time+=31*60*1000}
}
test('direct Samsung Water imports into existing v1 diary; retry is idempotent and preserves manual/HC',async()=>{
  const t=setup(),old={goal:2300,entries:[{id:'manual',amount:400,at},{id:'hc',amount:100,at,externalKey:'healthconnect:source:old'}]}
  t.storage.setItem('grapes-water-v1',JSON.stringify({'2026-10-25':old}))
  assert.deepEqual(await t.sync.refresh({manual:true}),{imported:1,duplicates:0})
  assert.deepEqual(await t.sync.refresh({manual:true}),{imported:0,duplicates:1})
  const data=JSON.parse(t.storage.getItem('grapes-water-v1'))
  assert.deepEqual(data['2026-10-25'].entries.slice(0,2),old.entries)
  assert.equal(data['2026-10-25'].goal,2300)
})
test('A→B→A: consent and imported rows isolated; regular diary saves preserve hidden owner rows',async()=>{
  const t=setup();await t.sync.setEnabled(A,true);await t.sync.refresh({manual:true})
  t.setOwner(B);assert.equal(t.sync.enabled(B),false)
  assert.deepEqual(await t.sync.refresh(),{skipped:'disabled'})
  await t.sync.refresh({manual:true})
  const all=JSON.parse(t.storage.getItem('grapes-water-v1'))
  const a=waterForSamsungOwner(all,A),b=waterForSamsungOwner(all,B)
  assert.equal(a['2026-10-25'].entries.length,1);assert.equal(b['2026-10-25'].entries.length,1)
  assert.equal(waterForSamsungOwner(all,null)['2026-10-25'].entries.length,0)
  const merged=mergeWaterForSamsungOwner(all,{'2026-10-25':{goal:2500,entries:[]}},A)
  assert.equal(merged['2026-10-25'].entries[0].samsungOwnerId,B)
  assert.throws(()=>mergeWaterForSamsungOwner(all,b,A),/Más Grapes/)
  t.setOwner(A);assert.equal(t.sync.enabled(A),true)
  assert.deepEqual(await t.sync.refresh({manual:true}),{imported:0,duplicates:1})
})
test('automatic reads require owner consent and granted permission, stay silent and throttle per owner',async()=>{
  const t=setup();assert.deepEqual(await t.sync.refresh(),{skipped:'disabled'});assert.deepEqual(t.counts(),{reads:0,silent:0})
  await t.sync.setEnabled(A,true);await t.sync.refresh();await t.sync.refresh()
  assert.deepEqual(t.counts(),{reads:0,silent:1})
  t.tick();await t.sync.refresh();assert.equal(t.counts().silent,2)
  t.deny();await assert.rejects(t.sync.refresh(),/visszavonták/)
  await t.sync.setEnabled(A,false);assert.equal(t.sync.enabled(A),false)
})
test('SDK absence and unverified owner fail closed; CSV stays available for verified owner',async()=>{
  const t=setup();t.missing();await assert.rejects(t.sync.refresh({manual:true}),/SDK/)
  const source=parseSamsungWaterCsv('datauuid,start_time,amount\nrow1,2026-10-25 12:00:00,300',{filename:'com.samsung.health.water_intake.csv'})
  assert.deepEqual(await t.sync.importSource(A,source,{requireOwner:false}),{imported:1,duplicates:0})
  t.setOwner(null);await assert.rejects(t.sync.importSource(A,source,{requireOwner:false}),/megváltozott/)
})
test('mid-read owner switch, mismatched native owner and malformed batches never write',async()=>{
  const storage=memory();let owner=A
  const sync=createSamsungWaterSync({storage,getStatus:async()=>({ownerId:owner,available:true,permitted:true}),read:async()=>{owner=B;return payload(A,record('x'))}})
  await assert.rejects(sync.refresh({manual:true}),/megváltozott/)
  assert.equal(storage.getItem('grapes-water-v1'),null)
  assert.throws(()=>prepareSamsungWater(payload(B,record('x')),{},A),/másik/)
  assert.throws(()=>prepareSamsungWater(payload(A,record('x'),record('bad',-1)),{},A),/Érvénytelen/)
})
test('CAS prevents overwriting a concurrent manual edit; corrupt and unavailable storage preserved',async()=>{
  const storage=memory();let checks=0
  const sync=createSamsungWaterSync({storage,getStatus:async()=>{if(++checks===2)storage.setItem('grapes-water-v1','{}');return{ownerId:A}}})
  await assert.rejects(sync.importSource(A,payload(A,record('x'))),/közben változott/)
  assert.equal(storage.getItem('grapes-water-v1'),'{}')
  storage.setItem('grapes-water-v1','bad')
  await assert.rejects(sync.importSource(A,payload(A,record('x'))),/JSON/)
  assert.equal(storage.getItem('grapes-water-v1'),'bad')
  const failed=createSamsungWaterSync({storage:{getItem:()=>null,setItem:()=>{}},getStatus:async()=>({ownerId:A})})
  await assert.rejects(failed.importSource(A,payload(A,record('x'))),/tartós/)
})
test('CSV and SDK share stable IDs; invalid CSV aborts without partial import',()=>{
  const source=parseSamsungWaterCsv('datauuid,start_time,amount\nx,2026-10-25 12:00:00,300',{filename:'com.samsung.health.water_intake.csv'})
  const first=prepareSamsungWater(source,{},A,{requireOwner:false})
  const next=prepareSamsungWater(payload(A,record('x',300)),first.data,A)
  assert.equal(next.imported,0);assert.equal(next.duplicates,1)
  assert.throws(()=>parseSamsungWaterCsv('datauuid,start_time,amount\nx,2026-10-25 12:00:00,300\nbad,2026-10-25 12:00:00,-2',{filename:'com.samsung.health.water_intake.csv'}),/hibás/)
  assert.throws(()=>samsungConsentKey('email@example.com'),/Grapes/)
})
