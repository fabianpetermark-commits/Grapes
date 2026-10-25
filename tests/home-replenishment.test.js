import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeState, applyHomeCommand } from '../src/home/home-data.js'
import { deriveHomeReplenishment, replenishKey, REPLENISHMENT_ARCHIVE_DAYS } from '../src/home/home-replenishment.js'
import { createEmptyFamilyHome, stageFamilyHomeCommand } from '../src/home/home-family-data.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const eid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const run=(s,type,payload,n)=>applyHomeCommand(s,{type,payload,eventId:eid(n)}).state
const today = new Date()
const start = ()=>createHomeState({householdId:A,actorId:A})
function depletion() {
  const bought=run(start(),'StockCountConfirmed',{name:'Tej',quantity:2,unit:'l'},1)
  const depleted=run(bought,'CookingConfirmed',{name:'Tejital',portions:2,consumed:[
    {id:bought.inventory[0].id,quantity:2,unit:'l'}]},2)
  return {bought,depleted}
}
test('no proof of depletion means no certain auto suggestion',()=>{
  assert.equal(deriveHomeReplenishment(start()).length,0)
  const initial=run(start(),'StockCountConfirmed',{name:'Tej',quantity:2,unit:'l'},1)
  assert.equal(deriveHomeReplenishment(initial).length,0)
  const missing=run(start(),'StockCountConfirmed',{name:'Ismeretlen mennyiség helyett 0',quantity:0,unit:'db'},3)
  assert.equal(deriveHomeReplenishment(missing).length,0)
  const zero=run(initial,'StockCountConfirmed',{name:'Tej',quantity:0,unit:'l'},4)
  assert.equal(deriveHomeReplenishment(zero).length,0)
})
test('audited full depletion proposes confirmed amount, not learned repeat purchase',()=>{
  const {depleted}=depletion()
  const hints=deriveHomeReplenishment(depleted,{},today)
  assert.equal(hints.length,1)
  assert.deepEqual([hints[0].name,hints[0].quantity,hints[0].unit,hints[0].status],
    ['Tej',2,'l','active'])
  assert.ok(hints[0].cycleId)
  const again=deriveHomeReplenishment(depleted,{},today)
  assert.deepEqual(again,hints)
})
test('X dismisses a single cycle; old shortage does not reappear after reload/time passage',()=>{
  const {depleted}=depletion()
  const proposal=deriveHomeReplenishment(depleted,{},today)[0]
  const prefs={dismissed:[{key:proposal.key,cycleId:proposal.cycleId,
    dismissedAt:today.toISOString()}]}
  assert.equal(deriveHomeReplenishment(depleted,prefs,today)[0].status,'dismissed')
  assert.equal(deriveHomeReplenishment(depleted,prefs,
    new Date(today.getTime()+31*86_400_000))[0].status,'dismissed')
})
test('unacted shortage archives at day 30 rather than growing forever',()=>{
  const {depleted}=depletion()
  const stamp=new Date(depleted.events.at(-1).timestamp)
  const before=deriveHomeReplenishment(depleted,{},new Date(stamp.getTime()+29*86_400_000))[0]
  const after=deriveHomeReplenishment(depleted,{},new Date(stamp.getTime()+30*86_400_000))[0]
  assert.equal(before.status,'active')
  assert.equal(after.status,'archived')
  assert.equal(REPLENISHMENT_ARCHIVE_DAYS,30)
})
test('new confirmed stock and newly depleted cycle creates a new suggestion (never resurrect old)',()=>{
  const {depleted}=depletion()
  const previous=deriveHomeReplenishment(depleted,{},today)[0]
  const revived=run(depleted,'StockCountConfirmed',{name:'Tej',quantity:1,unit:'l'},5)
  assert.deepEqual(deriveHomeReplenishment(revived,{},today),[])
  const gone=run(revived,'CookingConfirmed',{name:'Tejital',portions:1,consumed:[
    {id:revived.inventory.at(-1).id,quantity:1,unit:'l'}]},6)
  const after=deriveHomeReplenishment(gone,
    {dismissed:[{key:previous.key,cycleId:previous.cycleId,dismissedAt:today.toISOString()}]},today)[0]
  assert.notEqual(after.cycleId,previous.cycleId)
  assert.equal(after.status,'active')
})
test('remaining stock and an already-planned purchase prevent spurious proposals',()=>{
  const {depleted}=depletion()
  const stillHave=run(depleted,'StockCountConfirmed',{name:'Tej',quantity:1,unit:'l'},7)
  assert.equal(deriveHomeReplenishment(stillHave,{},today).length,0)
  const planned=run(depleted,'ShoppingItemAdded',{name:'TEJ',quantity:1,unit:'l',listId:'list-weekly'},8)
  assert.equal(deriveHomeReplenishment(planned,{},today)[0].status,'on-list')
})
test('legacy main list, named list and household roles remain stable',()=>{
  const base=createEmptyFamilyHome('00000000-0000-4000-8000-000000000009',A)
  const a=stageFamilyHomeCommand({state:base,householdId:base.householdId,actorId:A,role:'owner',
    command:{type:'ShoppingItemAdded',eventId:eid(41),payload:{name:'Liszt',quantity:1,unit:'kg'}}})
  assert.equal(a.candidate.shopping[0].listId,'main')
  const b=stageFamilyHomeCommand({state:a.candidate,householdId:base.householdId,actorId:B,role:'editor',
    command:{type:'ShoppingItemAdded',eventId:eid(42),payload:{name:'Paradicsom',quantity:1,unit:'db',listId:'list-weekly'}}})
  assert.equal(b.candidate.shopping[1].listId,'list-weekly')
  assert.throws(()=>stageFamilyHomeCommand({state:a.candidate,householdId:base.householdId,actorId:B,role:'viewer',
    command:{type:'ShoppingItemAdded',eventId:eid(43),payload:{name:'Só',quantity:1,unit:'kg'}}}),/megtekintheti/)
})
test('product keys are case and whitespace insensitive, but never mix dimensions',()=>{
  assert.equal(replenishKey('  TEJ  ','volume'),replenishKey('tej','volume'))
  assert.notEqual(replenishKey('tej','mass'),replenishKey('tej','volume'))
})
