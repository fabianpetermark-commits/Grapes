import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeTestReadOnlyGate, HOME_SUPABASE_TEST_REF } from '../src/home/home-supabase-test-readonly.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='11111111-1111-4111-8111-111111111111'
function rig({owner=A,switchAfterRpc=false,data,mutateClient=false}={}) {
  let subject=owner, calls=[]
  const client={
    supabaseUrl:'https://'+HOME_SUPABASE_TEST_REF+'.supabase.co',
    auth:{ async getUser(){return {data:{user:{id:subject,is_anonymous:false}}}}},
    async rpc(name,args){
      calls.push([name,args])
      if(switchAfterRpc)subject=B
      return {data:data?.[name] ?? (
        name==='home_m3b_list_households'
          ? [{householdId:H,name:'Otthonunk',role:'owner',revision:0}]
          : {householdId:H,role:'owner',revision:0,
              state:{schemaVersion:2,householdId:H,actorId:A,revision:0,
                inventory:[],shopping:[],prepared:[],events:[]}}
      )}
    },
  }
  return {client,calls,changeUser:id=>{subject=id}}
}
const gateFor=(rig,options={})=>createHomeTestReadOnlyGate({
  client:rig.client,expectedUserId:A,projectRef:HOME_SUPABASE_TEST_REF,
  testGateEnabled:true,...options,
})
test('TEST gate is OFF by default; PROD project, missing Auth and random UUID fail closed',()=>{
  const r=rig()
  assert.throws(()=>createHomeTestReadOnlyGate({client:r.client,expectedUserId:A,
    projectRef:HOME_SUPABASE_TEST_REF}),/TEST-kapuban/)
  assert.throws(()=>gateFor(r,{projectRef:'yopabovoxyffhokhbgxl'}),/TEST-kapuban/)
  const wrongClient=rig()
  wrongClient.client.supabaseUrl='https://yopabovoxyffhokhbgxl.supabase.co'
  assert.throws(()=>gateFor(wrongClient),/tényleges projektje/)
  assert.throws(()=>gateFor(r,{expectedUserId:'local-home-profile'}),/azonosító/)
  assert.throws(()=>gateFor({client:{auth:{getUser:async()=>({})}}}),/kliens/)
})
test('signed-in actor reads only the authenticated private RPC; no implicit creation or writes',async()=>{
  const r=rig(),g=gateFor(r)
  assert.deepEqual(await g.list(),[{householdId:H,name:'Otthonunk',role:'owner',revision:0}])
  const home=await g.read(H)
  assert.equal(home.householdId,H)
  assert.equal(home.revision,0)
  assert.deepEqual(home.inventory,[])
  assert.equal(typeof g.compareAndSwap,'undefined')
  assert.equal(typeof g.create,'undefined')
  assert.deepEqual(r.calls.map(x=>x[0]),[
    'home_m3b_list_households','home_m3b_read_household'])
  assert.equal(r.calls[1][1].p_household_id,H)
})
test('A→B during pending network RPC NEVER reveals A data',async()=>{
  const r=rig({switchAfterRpc:true}),g=gateFor(r)
  await assert.rejects(g.list(),/Fiókváltás/)
  await assert.rejects(g.read(H),/érvénytelen/)
})
test('the remote read never overlays unknown local v1 Home or imported personal data',async()=>{
  const raw={householdId:H,role:'editor',revision:0,state:{
    schemaVersion:1,householdId:H,actorId:A,revision:0,
    inventory:[],shopping:[],events:[]}}
  let r=rig({data:{home_m3b_read_household:raw}})
  await assert.rejects(gateFor(r).read(H),/séma/)
  r=rig({data:{home_m3b_read_household:{...raw,state:{
    ...raw.state,schemaVersion:2,prepared:[],
    inventory:[{householdId:H,name:'Medical data',sourceType:'health',sourceId:'x'}]}}}})
  await assert.rejects(gateFor(r).read(H),/eredetű/)
})
test('reject malformed family permissions and anonymous/auth-error sessions',async()=>{
  const r=rig({data:{home_m3b_list_households:[{householdId:H,name:'Otthon',role:'administrator',revision:1}]}})
  await assert.rejects(gateFor(r).list(),/hivatkozás/)
  const client={supabaseUrl:'https://'+HOME_SUPABASE_TEST_REF+'.supabase.co',
    auth:{getUser:async()=>({data:{user:{id:A,is_anonymous:true}}})},
    rpc:async()=>({data:[]})}
  await assert.rejects(gateFor({client}).list(),/Fiókváltás/)
})
