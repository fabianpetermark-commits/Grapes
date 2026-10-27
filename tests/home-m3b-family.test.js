import test from 'node:test'
import assert from 'node:assert/strict'
import {createEmptyFamilyHome, validateFamilyHome, stageFamilyHomeCommand, inspectFamilyConflict} from '../src/home/home-family-data.js'
import {createFamilyHomeGateway} from '../src/home/home-family-gateway.js'
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
const op='00000000-0000-4000-8000-000000000011'
const initial=()=>createEmptyFamilyHome(H,A)
const buy=(eventId=op)=>({type:'ShoppingItemAdded',eventId,payload:{name:'Tej',quantity:1,unit:'l'}})

test('Home M3B: a new family begins empty, not a copy of personal Home',()=>{
  const data=initial()
  assert.equal(data.householdId,H)
  assert.deepEqual([data.inventory,data.shopping,data.prepared,data.events],[[],[],[],[]])
  assert.equal(data.revision,0)
  assert.equal(validateFamilyHome(data,H).actorId,A)
})

test('Home M3B: editor writes a manual shared list event, viewer is strictly read-only',()=>{
  const s=initial()
  const staged=stageFamilyHomeCommand({state:s,householdId:H,actorId:B,role:'editor',command:buy()})
  assert.equal(staged.expectedRevision,0)
  assert.equal(staged.operationId,op)
  assert.equal(staged.candidate.shopping[0].name,'Tej')
  assert.equal(staged.candidate.events[0].actorId,B)
  assert.equal(staged.candidate.actorId,A)
  assert.equal(s.shopping.length,0)
  assert.throws(()=>stageFamilyHomeCommand({state:s,householdId:H,actorId:B,role:'viewer',command:buy()}),/csak megtekintheti/)
  assert.throws(()=>stageFamilyHomeCommand({state:s,householdId:H,actorId:B,role:'editor',command:{type:'CookingConfirmed',eventId:op}}),/Személyes/)
  assert.throws(()=>stageFamilyHomeCommand({state:s,householdId:H,actorId:B,role:'editor',command:{...buy(),sourceType:'finance-receipt'}}),/forrást/)
  assert.throws(()=>stageFamilyHomeCommand({state:s,householdId:H,actorId:B,role:'editor',command:{...buy(),eventId:'not-uuid'}}))
})

test('Home M3B: attempted Food, Finance, prepared sharing and event tamper are rejected',()=>{
  const staged=stageFamilyHomeCommand({state:initial(),householdId:H,actorId:A,role:'owner',command:buy()})
  const state=staged.candidate
  for(const wrong of [
    {...state,prepared:[{id:'x'}]},
    {...state,events:[{...state.events[0],sourceType:'food-diary'}]},
    {...state,inventory:[{...state.shopping[0],sourceType:'finance-receipt'}]},
    {...state,shopping:[{...state.shopping[0],sourceType:'food'}]},
    {...state,revision:3},
  ]) assert.throws(()=>validateFamilyHome(wrong,H))
})

test('Home M3B: optimistic conflict retains candidate and never auto-merges',()=>{
  const staged=stageFamilyHomeCommand({state:initial(),householdId:H,actorId:B,role:'editor',command:buy()})
  const before=JSON.stringify(staged)
  assert.deepEqual(inspectFamilyConflict(staged,{status:'committed',revision:1}),{committed:true,revision:1})
  const conflict=inspectFamilyConflict(staged,{status:'conflict',revision:1})
  assert.equal(conflict.committed,false)
  assert.equal(conflict.requiresManualReview,true)
  assert.equal(conflict.operationId,op)
  assert.deepEqual(conflict.rejectedCandidate,staged.candidate)
  assert.equal(JSON.stringify(staged),before)
  assert.throws(()=>inspectFamilyConflict(staged,{status:'committed',revision:5}))
})

test('Home M3B: authenticated gateway fails closed on A→B switch while awaiting RPC',async()=>{
  let who=A, resolveRpc
  const remote={auth:{getUser:async()=>({data:{user:{id:who,is_anonymous:false}}})},
    rpc:()=>new Promise(resolve=>{resolveRpc=resolve})}
  const gateway=createFamilyHomeGateway(remote,A)
  const pending=gateway.list()
  for(let i=0;i<20 && !resolveRpc;i++)await Promise.resolve()
  assert.equal(typeof resolveRpc,'function')
  who=B
  resolveRpc({data:[]})
  await assert.rejects(pending,/megváltozott/)
  await assert.rejects(gateway.list(),/érvénytelen/)
})

test('Home M3B: gateway never accepts missing Auth session, bad invite or forged CAS',async()=>{
  const api={auth:{getUser:async()=>({data:{user:{id:A}}})},
    rpc:async()=>({data:[]})}
  const gateway=createFamilyHomeGateway(api,A)
  await assert.rejects(gateway.acceptInvite('123'),/meghívókód/)
  assert.throws(()=>gateway.stage({current:{householdId:H,role:'viewer',revision:0,state:initial()},command:buy()}),/megtekintheti/)
  await assert.rejects(gateway.compareAndSwap({householdId:H,operationId:op,
    expectedRevision:0,schemaVersion:2,candidate:{revision:1}}))
  assert.throws(()=>createFamilyHomeGateway({auth:{}},A))
})
