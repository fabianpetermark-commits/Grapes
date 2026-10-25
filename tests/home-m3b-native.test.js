import test from 'node:test'
import assert from 'node:assert/strict'
import { openHomeFamilyNativeGateway } from '../src/home/home-family-native.js'
import { createEmptyFamilyHome, stageFamilyHomeCommand } from '../src/home/home-family-data.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const H = '00000000-0000-4000-8000-000000000009'
const OP = '00000000-0000-4000-8000-000000000011'

test('M3B native: fail closed without separate Android TEST flag', async () => {
  await assert.rejects(openHomeFamilyNativeGateway({enabled:false,isAndroid:true,
    getSubject:async()=>A,nativeRpc:()=>{throw Error('network called')}}))
  await assert.rejects(openHomeFamilyNativeGateway({enabled:true,isAndroid:false,
    getSubject:async()=>A,nativeRpc:()=>{throw Error('network called')}}))
})

test('M3B native: no token in app JS, native whoAmI verified before and after all family RPC', async () => {
  let subject=A
  const calls=[]
  const nativeRpc=async (method,...args) => {
    calls.push([method,...args])
    if(method==='supabaseTestWhoAmI')return subject
    if(method==='supabaseTestRpc'&&args[0]==='home_m3b_list_households')return '[]'
    throw Error('Unknown native call')
  }
  const native=await openHomeFamilyNativeGateway({enabled:true,isAndroid:true,
    getSubject:async()=>subject,nativeRpc})
  assert.equal(native.ownerId,A)
  assert.deepEqual(await native.gateway.list(),[])
  assert.deepEqual(calls.map(c=>c[0]),[
    'supabaseTestWhoAmI','supabaseTestWhoAmI','supabaseTestRpc','supabaseTestWhoAmI'])
  assert.equal(JSON.stringify(calls).includes('Bearer'),false)
  subject=B
  await assert.rejects(native.assertActiveOwner(),/megváltozott/)
  await assert.rejects(native.gateway.list(),/megváltozott/)
})

test('M3B native: A response arriving after account switch is never used',async()=>{
  let subject=A, resolve
  const native=await openHomeFamilyNativeGateway({enabled:true,isAndroid:true,
    getSubject:async()=>subject,nativeRpc:async(method,name)=>{
      if(method==='supabaseTestWhoAmI') return subject
      if(name==='home_m3b_list_households')return new Promise(r=>{resolve=r})
      throw Error('Unrecognized RPC')
    }})
  const pending=native.gateway.list()
  for(let i=0;i<30&&!resolve;i++)await Promise.resolve()
  assert.equal(typeof resolve,'function')
  subject=B
  resolve('[]')
  await assert.rejects(pending,/megváltozott/)
})

test('M3B native: staged shared changes remain manual-only and private',()=>{
  const initial=createEmptyFamilyHome(H,A)
  const staged=stageFamilyHomeCommand({state:initial,householdId:H,actorId:A,role:'owner',
    command:{type:'ShoppingItemAdded',eventId:OP,payload:{name:'Tej',quantity:1,unit:'l'}}})
  assert.equal(staged.candidate.shopping.length,1)
  assert.deepEqual(initial.shopping,[])
})
