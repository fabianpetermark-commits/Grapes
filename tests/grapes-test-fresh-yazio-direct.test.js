import test from 'node:test'
import assert from 'node:assert/strict'
import { readFreshOwnerYazioDirect } from '../src/food/grapes-test-fresh-yazio-direct.js'
const A='00000000-0000-4000-8000-000000000001'
function session() {
  let owner=A
  return {
    ownerId:A,
    async assertOwner(){ if(owner!==A)throw Error('Grapes account changed');return owner },
    async load(){ return {} },
    switchOwner(id){owner=id},
  }
}
function fixture() {
  const methods=[]
  const request=async (method,...args)=>{
    methods.push({method,args})
    if(method==='login')return {session:'temporary-yazio-session'}
    if(method==='day')return {products:[{
      id:'meal1',product_id:'product1',amount:100,date:'2026-10-25 08:00:00',
      daytime:'breakfast',
    }]}
    if(method==='product')return {
      name:'Teszt reggeli',base_unit:'g',
      nutrients:{'energy.energy':2,'nutrient.protein':0.2},
    }
    if(method==='logout')return {}
    throw Error('Unexpected native request')
  }
  return {request,methods}
}
test('Direct YAZIO one-shot: explicit login, day, product, logout; no remembered session',async()=>{
  const f=fixture()
  const result=await readFreshOwnerYazioDirect({
    session:session(),email:'test@example.com',password:'secret',
    from:'2026-10-25',to:'2026-10-25',request:f.request})
  assert.equal(result.ownerId,A)
  assert.equal(result.bundle.nutrition_log.length,1)
  assert.equal(result.bundle.nutrition_log[0].energy_kcal,200)
  assert.deepEqual(f.methods.map(m=>m.method),['login','day','product','logout'])
  assert.equal(f.methods[0].args[0],'test@example.com')
})
test('Account change during YAZIO read stops and logs out',async()=>{
  const f=fixture(),s=session()
  const request=async(method,...args)=>{
    const result=await f.request(method,...args)
    if(method==='day')s.switchOwner('00000000-0000-4000-8000-000000000002')
    return result
  }
  await assert.rejects(readFreshOwnerYazioDirect({session:s,
    email:'test@example.com',password:'secret',from:'2026-10-25',to:'2026-10-25',request}))
  assert.deepEqual(f.methods.map(m=>m.method),['login','day','logout'])
})
test('Invalid credentials rejected without calling YAZIO',async()=>{
  const f=fixture()
  await assert.rejects(readFreshOwnerYazioDirect({session:session(),
    email:'bad',password:'secret',from:'2026-10-25',to:'2026-10-25',request:f.request}))
  assert.deepEqual(f.methods,[])
})
test('Cancelled read logs out temporary session',async()=>{
  const f=fixture(),s=session()
  let cancelled=false
  const request=async(method,...args)=>{
    const result=await f.request(method,...args)
    if(method==='login')cancelled=true
    return result
  }
  await assert.rejects(readFreshOwnerYazioDirect({
    session:s,email:'test@example.com',password:'secret',
    from:'2026-10-25',to:'2026-10-25',request,
    checkCancelled(){if(cancelled)throw Error('Stopped')},
  }),/Stopped/)
  assert.deepEqual(f.methods.map(m=>m.method),['login','logout'])
})
