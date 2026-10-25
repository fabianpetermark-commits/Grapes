import test from 'node:test'
import assert from 'node:assert/strict'
import {createHomeState, applyHomeCommand, validateHomeState} from '../src/home/home-data.js'
import {createEmptyFamilyHome, stageFamilyHomeCommand} from '../src/home/home-family-data.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
const e=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const make=(s,type,payload,n)=>applyHomeCommand(s,{type,payload,eventId:e(n)}).state
const buy=(s,name,amount,unit,seed)=>{
  const next=make(s,'ShoppingItemAdded',{name,quantity:amount,unit},seed)
  const row=next.shopping.at(-1)
  return {state:next,item:row}
}
const check=(s,id,seed,status='checked')=>make(s,'ShoppingItemStatusChanged',{id,status},seed)

test('shopping checkout atomically adds exactly one untracked stock lot, preserving event history',()=>{
  const first=buy(createHomeState({householdId:H,actorId:A}),'Liszt','1','kg',1)
  const checked=check(first.state,first.item.id,2)
  assert.equal(checked.inventory.length,1)
  assert.equal(checked.shopping[0].status,'checked')
  const lot=checked.inventory[0]
  assert.equal(lot.quantityBase,1000)
  assert.equal(lot.storageLocation,'untracked')
  assert.equal(lot.shoppingItemId,first.item.id)
  assert.equal(checked.shopping[0].stockIntakeEventId,e(2))
  assert.equal(checked.events.at(-1).changes.length,2)
  assert.equal(validateHomeState(checked).revision,2)
  const retry=applyHomeCommand(checked,{type:'ShoppingItemStatusChanged',
    payload:{id:first.item.id,status:'checked'},eventId:e(2)})
  assert.equal(retry.duplicate,true)
  assert.equal(retry.state.inventory.length,1)
})

test('six-item purchase: no invented location; known quantities stock, unknown quantity waits',()=>{
  let s=createHomeState({householdId:H,actorId:A})
  for(const [i,entry] of [
    ['Tej',2,'l'],['Só',1,'kg'],['Kenyér',1,'db'],
    ['Liszt',1,'kg'],['Paradicsom',4,'db'],['Mirelit sült krumpli',1,'csomag']
  ].entries()){
    const bought=buy(s,...entry,10+i*2)
    s=check(bought.state,bought.item.id,11+i*2)
  }
  assert.equal(s.inventory.length,6)
  assert.deepEqual(s.inventory.map(x=>x.storageLocation),Array(6).fill('untracked'))
  assert.deepEqual(s.inventory.map(x=>x.name),['Tej','Só','Kenyér','Liszt','Paradicsom','Mirelit sült krumpli'])
  assert.equal(s.events.filter(x=>x.type==='ShoppingItemStatusChanged').length,6)
  assert.equal(validateHomeState(s).revision,12)
  const missing=buy(s,'Tojás','',undefined,30)
  const unknown=check(missing.state,missing.item.id,31)
  assert.equal(unknown.inventory.length,6)
  assert.equal(unknown.shopping.at(-1).status,'checked')
  assert.equal(unknown.shopping.at(-1).stockIntakeEventId,null)
  const corrected=make(unknown,'ShoppingItemEdited',
    {id:missing.item.id,name:'Tojás',quantity:6,unit:'db'},32)
  assert.equal(corrected.inventory.length,7)
  assert.equal(corrected.inventory.at(-1).quantityBase,6)
  assert.equal(corrected.shopping.at(-1).stockIntakeEventId,e(32))
})

test('uncheck removes only untouched purchased lot; re-check is one new purchase, never silent double intake',()=>{
  const added=buy(createHomeState({householdId:H,actorId:A}),'Kenyér',2,'db',41)
  const checked=check(added.state,added.item.id,42)
  const uncheck=check(checked,added.item.id,43,'planned')
  assert.equal(uncheck.inventory.length,0)
  assert.equal(uncheck.shopping[0].stockIntakeEventId,null)
  const purchasedAgain=check(uncheck,added.item.id,44)
  assert.equal(purchasedAgain.inventory.length,1)
  assert.equal(purchasedAgain.inventory[0].quantityBase,2)
  const unchanged=applyHomeCommand(purchasedAgain,{type:'ShoppingItemStatusChanged',
    payload:{id:added.item.id,status:'checked'},eventId:e(44)})
  assert.equal(unchanged.duplicate,true)
})

test('a cooked/edited stock lot cannot be removed by unchecking the original shopping row',()=>{
  const added=buy(createHomeState({householdId:H,actorId:A}),'Paradicsom',4,'db',51)
  const checked=check(added.state,added.item.id,52)
  const consumed=make(checked,'CookingConfirmed',{
    name:'Paradicsomos étel',portions:2,consumed:[{id:checked.inventory[0].id,quantity:2,unit:'db'}]
  },53)
  assert.equal(consumed.inventory[0].quantityBase,2)
  assert.equal(consumed.prepared[0].portionsRemaining,2)
  assert.throws(()=>check(consumed,added.item.id,54,'planned'),/már változott/)
  assert.equal(consumed.shopping[0].status,'checked')
  assert.equal(consumed.inventory[0].quantityBase,2)
})

test('legacy known fridge/pantry lots remain readable, optional location not mandatory on new manual entries',()=>{
  let s=createHomeState({householdId:H,actorId:A})
  s=make(s,'StockCountConfirmed',{name:'Régi tej',quantity:1,unit:'l',storageLocation:'fridge'},61)
  s=make(s,'StockCountConfirmed',{name:'Új tej',quantity:1,unit:'l'},62)
  assert.equal(s.inventory[0].storageLocation,'fridge')
  assert.equal(s.inventory[1].storageLocation,'untracked')
  assert.equal(validateHomeState(s).inventory.length,2)
})

test('owner and editor may stage shared auto-intake; viewer cannot',()=>{
  const base=createEmptyFamilyHome(H,A)
  const first=stageFamilyHomeCommand({state:base,householdId:H,actorId:A,role:'owner',
    command:{type:'ShoppingItemAdded',eventId:e(71),
      payload:{name:'Tej',quantity:2,unit:'l'}}})
  const row=first.candidate.shopping[0]
  const second=stageFamilyHomeCommand({state:first.candidate,householdId:H,actorId:B,role:'editor',
    command:{type:'ShoppingItemStatusChanged',eventId:e(72),
      payload:{id:row.id,status:'checked'}}})
  assert.equal(second.expectedRevision,1)
  assert.equal(second.candidate.inventory.length,1)
  assert.equal(second.candidate.inventory[0].storageLocation,'untracked')
  assert.equal(second.candidate.events.at(-1).actorId,B)
  assert.throws(()=>stageFamilyHomeCommand({state:first.candidate,householdId:H,actorId:B,role:'viewer',
    command:{type:'ShoppingItemStatusChanged',eventId:e(72),payload:{id:row.id,status:'checked'}}}),/megtekintheti/)
})
