import test from 'node:test'
import assert from 'node:assert/strict'
import { openAndroidOneHomeTestSession } from '../src/home/home-native-test-session.js'
import { createEmptyFamilyHome } from '../src/home/home-family-data.js'
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
function fixture({actor=A,names=['Együtt'],denyRead=false}={}){
  const calls=[]
  const home=createEmptyFamilyHome(H,A)
  let current=actor
  const nativeRpc=async(method,name,args)=>{
    calls.push({method,name,args})
    if(method==='supabaseTestWhoAmI')return current
    if(method!=='supabaseTestRpc')throw Error('Unexpected native method')
    if(name==='home_m3b_list_households')return JSON.stringify(names.map((name,i)=>({
      householdId:i?B:H,name,role:'editor',revision:0,
    })))
    if(name==='home_m3b_read_household') {
      if(denyRead) throw Error('RLS denied')
      return JSON.stringify({householdId:H,role:'editor',revision:0,state:home})
    }
    throw Error('Not an approved method')
  }
  const options={enabled:true,android:true,nativeEnabled:async()=>true,
    getSubject:async()=>current,nativeRpc}
  return {options,calls,change:id=>{current=id}}
}
test('QA gate refuses non-Android, disabled and native-Auth-off sessions',async()=>{
  const x=fixture()
  await assert.rejects(openAndroidOneHomeTestSession({...x.options,enabled:false}),/TEST/)
  await assert.rejects(openAndroidOneHomeTestSession({...x.options,android:false}),/TEST/)
  await assert.rejects(openAndroidOneHomeTestSession({...x.options,nativeEnabled:async()=>false}),/fiók/)
  assert.equal(x.calls.length,0,'No RPC without active native TEST flag')
})
test('verified native UUID only, api RPC list, no bearer; real family gateway read is user pinned',async()=>{
  const x=fixture()
  const session=await openAndroidOneHomeTestSession(x.options)
  assert.equal(session.expectedUserId,A)
  assert.equal(session.households[0].householdId,H)
  const gate=session.chooseHousehold(H)
  assert.equal(gate.enabled,true)
  assert.equal(gate.writesEnabled,true)
  const read=await gate.sync.read(H)
  assert.equal(read.role,'editor')
  assert.equal(read.state.schemaVersion,2)
  assert.deepEqual(read.state.shopping,[])
  assert.ok(x.calls.some(c=>c.name==='home_m3b_read_household'))
  assert.ok(!JSON.stringify(x.calls).includes('Bearer'))
  assert.throws(()=>session.chooseHousehold(B),/hozzáférhető/)
  x.change(B)
  await assert.rejects(gate.sync.read(H),/megváltozott|Fiókváltás|nem ellenőrizhető/)
})
test('multiple memberships require explicit selection, never selecting by first result',async()=>{
  const x=fixture({names:['Helyi TEST','Közös család']})
  const session=await openAndroidOneHomeTestSession(x.options)
  assert.equal(session.households.length,2)
  assert.equal('householdId' in session,false,'No silent default selection')
  assert.equal(session.chooseHousehold(B).householdId,B)
  assert.equal(session.chooseHousehold(H).householdId,H)
})
test('read error and malformed RPC payload are rejected, never passed to family UI',async()=>{
  const x=fixture({denyRead:true})
  const session=await openAndroidOneHomeTestSession(x.options)
  await assert.rejects(session.chooseHousehold(H).sync.read(H))
  const original=x.options.nativeRpc
  const invalid=fixture()
  invalid.options.nativeRpc=async(method,name,args)=>{
    if(name==='home_m3b_list_households')return '{not-json'
    return original(method,name,args)
  }
  await assert.rejects(openAndroidOneHomeTestSession(invalid.options),/ellenőrizhető|bizonytalan/)
})
test('native identity changes while list request is pending: fail closed',async()=>{
  const x=fixture()
  let release
  const previous=x.options.nativeRpc
  x.options.nativeRpc=async (method,name,args)=>{
    if(name==='home_m3b_list_households')
      return new Promise(resolve=>{release=()=>resolve('[]')})
    return previous(method,name,args)
  }
  const pending=openAndroidOneHomeTestSession(x.options)
  for(let i=0;i<40&&!release;i++)await Promise.resolve()
  assert.equal(typeof release,'function')
  x.change(B)
  release()
  await assert.rejects(pending,/Fiókváltás|bizonytalan|nem ellenőrizhető/)
})
