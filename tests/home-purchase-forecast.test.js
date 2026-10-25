import test from 'node:test'
import assert from 'node:assert/strict'
import {createHomeState, applyHomeCommand, validateHomeState} from '../src/home/home-data.js'
import {derivePurchaseCadenceForecasts, purchaseForecastLeadDays} from '../src/home/home-purchase-forecast.js'

const A='00000000-0000-4000-8000-000000000001'
const eid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const base=()=>createHomeState({householdId:A,actorId:A})
const today=new Date('2026-10-26T12:00:00.000Z')
const dayAgo=(n,now=today)=>new Date(now.getTime()-n*86400000).toISOString()

function dispatch(state,type,payload,eventId) {
  return applyHomeCommand(state,{type,payload,eventId:eid(eventId)}).state
}
function purchase(state,name,daysAgo,num,opts={}) {
  const date=dayAgo(daysAgo,opts.now || today)
  const added=dispatch(state,'ShoppingItemAdded',{
    name,quantity:opts.quantity ?? 1,unit:opts.unit || 'kg',
  },num*2)
  const row=added.shopping.at(-1)
  const checked=dispatch(added,'ShoppingItemStatusChanged',{id:row.id,status:'checked'},num*2+1)
  checked.events.at(-2).timestamp=date
  checked.events.at(-1).timestamp=date
  return checked
}
function history({name='Só',offsets=[27,20,13,6],unit='kg'}={}) {
  return offsets.reduce((s,offset,i)=>purchase(s,name,offset,i+1,{unit}),base())
}

test('a regular four-purchase pattern yields a *probable* future need with no quantity',()=>{
  const s=history()
  const forecasts=derivePurchaseCadenceForecasts(s,{},today)
  assert.equal(forecasts.length,1)
  const x=forecasts[0]
  assert.equal(x.kind,'forecast')
  assert.equal(x.status,'active')
  assert.equal(x.periodDays,7)
  assert.equal(x.advanceDays,2)
  assert.equal(x.observations,4)
  assert.equal(x.quantity,null)
  assert.equal(x.quantityBase,null)
  assert.equal(x.predictedAt,'2026-10-27T12:00:00.000Z')
  assert.equal(x.name,'Só')
  assert.equal(validateHomeState(s).shopping.length,4)
  assert.equal(s.inventory.length,4) // Inventory was never consumed: no asserted stock-out.
})

test('not before the notice window, not without three completed intervals',()=>{
  const s=history()
  assert.deepEqual(derivePurchaseCadenceForecasts(s,{},new Date('2026-10-24T12:00:00.000Z')),[])
  assert.deepEqual(derivePurchaseCadenceForecasts(history({offsets:[20,13,6]}),{},today),[])
})
test('highly irregular or same-day repeated purchases are insufficient evidence',()=>{
  assert.deepEqual(derivePurchaseCadenceForecasts(history({offsets:[82,67,49,6]}),{},today),[])
  assert.deepEqual(derivePurchaseCadenceForecasts(history({offsets:[7,7,7,7]}),{},today),[])
})
test('estimated need cannot falsely become a confirmed shortage even with positive inventory',()=>{
  const state=history({name:'Élesztő',unit:'csomag'})
  const forecast=derivePurchaseCadenceForecasts(state,{},today)[0]
  assert.equal(forecast.status,'active')
  assert.equal(forecast.kind,'forecast')
  assert.ok(state.inventory.every(x=>x.quantityBase>0))
  assert.match(forecast.key,/forecast:/)
})
test('never repeatedly notify after X and archive automatically 30 days after first eligibility',()=>{
  const s=history()
  const x=derivePurchaseCadenceForecasts(s,{},today)[0]
  const metadata={dismissed:[{key:x.key,cycleId:x.cycleId,dismissedAt:today.toISOString()}]}
  assert.equal(derivePurchaseCadenceForecasts(s,metadata,today)[0].status,'dismissed')
  const at30=new Date(Date.parse('2026-10-25T12:00:00Z')+30*86400000)
  assert.equal(derivePurchaseCadenceForecasts(s,{},at30)[0].status,'archived')
  assert.equal(derivePurchaseCadenceForecasts(s,metadata,at30)[0].status,'dismissed')
})
test('new purchase creates a genuinely new forecast cycle, never a resurrection of the old alert',()=>{
  const s=history()
  const x=derivePurchaseCadenceForecasts(s,{},today)[0]
  const after=purchase(s,'Só',2,5,{now:new Date('2026-10-29T12:00:00Z')}) // Oct 27
  const soon=new Date('2026-11-02T12:00:00Z')
  const previous={dismissed:[{key:x.key,cycleId:x.cycleId,dismissedAt:today.toISOString()}]}
  const y=derivePurchaseCadenceForecasts(after,previous,soon)[0]
  assert.notEqual(y.cycleId,x.cycleId)
  assert.equal(y.status,'active')
})
test('placing a quantity-free suggestion on an actual list suppresses the same forecast',()=>{
  let s=history()
  s=dispatch(s,'ShoppingItemAdded',{name:' só ',quantity:'',unit:'kg',listId:'list-weekly'},99)
  assert.equal(s.shopping.at(-1).quantityBase,null)
  assert.equal(derivePurchaseCadenceForecasts(s,{},today)[0].status,'on-list')
})
test('actual consumption evidence takes priority over frequency forecasting',()=>{
  let s=history()
  const mostRecent=s.inventory.at(-1)
  s=dispatch(s,'CookingConfirmed',{name:'Sós tészta',portions:1,
    consumed:[{id:mostRecent.id,quantity:1,unit:'g'}]},100)
  assert.deepEqual(derivePurchaseCadenceForecasts(s,{},today),[])
})
test('unchecked and reversed purchases never count as completed shopping',()=>{
  let s=history()
  const last=s.shopping.at(-1)
  const corrected=dispatch(s,'ShoppingItemStatusChanged',{id:last.id,status:'planned'},101)
  assert.deepEqual(derivePurchaseCadenceForecasts(corrected,{},today),[])
  const reversed=dispatch(s,'Reversed',{eventId:eid(9)},102)
  assert.deepEqual(derivePurchaseCadenceForecasts(reversed,{},today),[])
})
test('lead windows do not assume one fixed shopping rhythm',()=>{
  assert.deepEqual([3,7,14,29,70].map(purchaseForecastLeadDays),[1,2,3,7,11])
})
