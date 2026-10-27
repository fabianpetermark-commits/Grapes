import test from 'node:test'
import assert from 'node:assert/strict'
import { createOneHomeTestSync } from '../src/home/home-one-test-sync.js'
import { createHomeState, SCHEMA_VERSION } from '../src/home/home-data.js'
import {
  createEmptyFamilyHome, stageFamilyHomeCommand,
} from '../src/home/home-family-data.js'
import { HOME_SUPABASE_TEST_REF } from '../src/home/home-supabase-test-readonly.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
const E='00000000-0000-4000-8000-000000000011'
const TEST='https://'+HOME_SUPABASE_TEST_REF+'.supabase.co'
function rig({url=TEST,who=A,remote=null}={}){
  let actor=who
  const calls=[]
  const initial=createEmptyFamilyHome(H,A)
  const client={
    supabaseUrl:url,
    auth:{async getUser(){return {data:{user:{id:actor,is_anonymous:false}}}}},
    schema(schema){
      calls.push(['schema',schema])
      if(schema!=='api') throw Error('Unexpected public schema')
      return {async rpc(name,params){
        calls.push(['rpc',name,params])
        if(remote) return remote(name,params)
        if(name==='home_m3b_list_households')
          return {data:[{householdId:H,name:'Otthonunk',role:'owner',revision:0}]}
        if(name==='home_m3b_read_household')
          return {data:{householdId:H,revision:0,role:'owner',state:initial}}
        if(name==='home_m3b_read_attempt')return {data:null}
        return {data:{status:'committed',revision:1}}
      }}
    },
  }
  return {client,calls,setActor:id=>{actor=id}}
}
function open(r,extra={}){
  return createOneHomeTestSync({
    client:r.client,expectedUserId:A,
    getActiveOwner:async()=>A,
    testGateEnabled:true,...extra,
  })
}
test('TEST-only gate blocks PROD project, disabled feature, invalid owner and missing native pin',()=>{
  const r=rig()
  assert.throws(()=>createOneHomeTestSync({client:r.client,expectedUserId:A,
    getActiveOwner:async()=>A}),/TEST/)
  assert.throws(()=>open(rig({url:'https://yopabovoxyffhokhbgxl.supabase.co'})),/TEST/)
  assert.throws(()=>open(r,{expectedUserId:'local-profile'}),/azonosító/)
  assert.throws(()=>open(r,{getActiveOwner:null}),/tulajdonos/)
})
test('read-only default uses explicit api schema and never enables CAS',async()=>{
  const r=rig(),s=open(r)
  const homes=await s.list()
  assert.deepEqual(homes.map(x=>x.householdId),[H])
  const home=await s.read(H)
  assert.equal(home.state.schemaVersion,2)
  assert.deepEqual(home.state.inventory,[])
  assert.deepEqual(home.state.shopping,[])
  await assert.rejects(s.queue(H,{}),/külön engedély/)
  await assert.rejects(s.retry(H),/külön engedély/)
  assert.ok(r.calls.some(x=>x[0]==='schema'&&x[1]==='api'))
  assert.ok(r.calls.every(x=>x[0]!=='rpc'||x[1]!=='home_m3b_compare_and_swap'))
  assert.equal(typeof s.createInvite,'undefined')
  assert.equal(typeof s.removeMember,'undefined')
  assert.equal(typeof s.createHousehold,'undefined')
})
test('authenticated A-to-B identity switch is denied before data delivery',async()=>{
  const r=rig(),s=open(r)
  r.setActor(B)
  await assert.rejects(s.list(),/megváltozott/)
  await assert.rejects(s.read(H),/érvénytelen/)
})
test('TEST v2 is fully isolated from the existing Home v1 / no automatic stock intake',()=>{
  const v1=createHomeState({householdId:H,actorId:A})
  const before=JSON.stringify(v1)
  assert.equal(SCHEMA_VERSION,1,'PROD local Home model MUST stay at schema version 1')
  const v2=createEmptyFamilyHome(H,A)
  assert.equal(v2.schemaVersion,2)
  assert.equal(v2.prepared.length,0)
  const added=stageFamilyHomeCommand({householdId:H,actorId:A,role:'owner',state:v2,
    command:{eventId:E,type:'ShoppingItemAdded',
      payload:{name:'Alma',quantity:2,unit:'db'}}})
  assert.equal(added.candidate.shopping.length,1)
  assert.equal(added.candidate.inventory.length,0,'Shopping is not inventory')
  const item=added.candidate.shopping[0]
  const checked=stageFamilyHomeCommand({householdId:H,actorId:A,role:'owner',state:added.candidate,
    command:{eventId:B,type:'ShoppingItemStatusChanged',payload:{id:item.id,status:'checked'}}})
  assert.equal(checked.candidate.shopping[0].status,'checked')
  assert.equal(checked.candidate.inventory.length,0,'Megvettem must NOT silently create stock')
  assert.equal(JSON.stringify(v1),before,'PROD v1 journal was not mutated')
  assert.equal(v1.events.length,0)
})
test('CAS is never sent when native owner pin is missing or changes',async()=>{
  const r=rig()
  const s=open(r,{testCasWritesEnabled:true,getActiveOwner:async()=>B})
  await assert.rejects(s.queue(H,{type:'ShoppingItemAdded'}),/Fiókváltás/)
  await assert.rejects(s.retry(H),/Fiókváltás/)
  assert.equal(r.calls.filter(c=>c[1]==='home_m3b_compare_and_swap').length,0)
})
