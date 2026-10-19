import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHomeCommand, createHomeState } from '../src/home/home-data.js'
import { createHomeStore, HOME_KEY } from '../src/home/home-store.js'
import { itemizedReceiptCandidates, reviewFoodRecipeAvailability } from '../src/home/home-m2-bridges.js'

const issue = (state, type, payload, opts = {}) => applyHomeCommand(state, { eventId: crypto.randomUUID(), type, payload, ...opts })
const memory = () => { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,value) } }
const chicken = () => {
  let s=createHomeState()
  s=issue(s,'StockCountConfirmed',{name:'Csirkemell',quantity:1,unit:'kg',storageLocation:'fridge'}).state
  return issue(s,'StockSplit',{id:s.inventory[0].id,fridgeQuantity:600,unit:'g'}).state
}
const cook = (state, opts={}) => issue(state,'CookingConfirmed',{
  recipeId:'recipe-1',recipeName:'Csirkés tészta',portions:4,confirmed:true,
  ingredients:[{lotId:state.inventory.find(x=>x.storageLocation==='fridge').id,quantity:500,unit:'g'}],...opts
},{sourceType:'homeCooking',sourceId:'cooking:001'})

test('H-13: a Finance végösszeg vagy fotó nem bizonyítja a termékeket',()=>{
  assert.deepEqual(itemizedReceiptCandidates({transactions:[{id:'a',type:'expense',amount:5990,receipt:{data:'photo'}}]}),[])
  assert.deepEqual(itemizedReceiptCandidates({transactions:[{id:'b',type:'expense',receipt:{verifiedLines:[{name:'Tej',quantity:2,unit:'l'}]}}]}),[])
})
test('H-14: jóváhagyott tételes blokksor egyszer növeli a készletet',()=>{
  const suggestions=itemizedReceiptCandidates({transactions:[{id:'receipt-1',type:'expense',planned:false,date:'2026-10-19',receipt:{verifiedLines:[
    {lineId:'line-1',name:'Tej',quantity:2,unit:'l'}]}}]})
  assert.equal(suggestions.length,1)
  const candidate=suggestions[0]
  const cmd={type:'PurchaseConfirmed',sourceType:candidate.sourceType,sourceId:candidate.sourceId,
    payload:{name:candidate.name,quantity:candidate.quantity,unit:candidate.unit,storageLocation:'fridge',confirmed:true}}
  const first=applyHomeCommand(createHomeState(),{...cmd,eventId:'receive-1'})
  const again=applyHomeCommand(first.state,{...cmd,eventId:'receive-2'})
  assert.equal(again.duplicate,true)
  assert.equal(again.state.inventory.length,1)
  assert.equal(again.state.inventory[0].quantityBase,2000)
  assert.throws(()=>issue(createHomeState(),'PurchaseConfirmed',{...cmd.payload,confirmed:false},{sourceType:candidate.sourceType,sourceId:candidate.sourceId}),/jóváhagyott/)
})
test('H-15: Food személyes étkezési esemény nem változtatja meg a Home nyers készletét',()=>{
  const state=chicken()
  assert.equal(state.inventory.reduce((x,y)=>x+y.quantityBase,0),1000)
  assert.equal(state.events.filter(x=>x.type==='CookingConfirmed').length,0)
})
test('H-16: jóváhagyott 500g főzés 600/400-ból 100/400-at és 4 adagot eredményez',()=>{
  const before=chicken()
  assert.throws(()=>cook(before,{confirmed:false}),/jóváhagyás/)
  const result=cook(before)
  assert.deepEqual(result.state.inventory.map(x=>[x.storageLocation,x.quantityBase]).sort(),[['freezer',400],['fridge',100]])
  assert.equal(result.state.prepared[0].portionsRemaining,4)
  assert.equal(result.state.events.at(-1).changes.length,2)
  assert.equal(applyHomeCommand(result.state,{eventId:'cook-again',type:'CookingConfirmed',sourceType:'homeCooking',sourceId:'cooking:001',
    payload:{recipeId:'recipe-1',recipeName:'Csirkés tészta',portions:4,confirmed:true,ingredients:[]}}).duplicate,true)
  assert.throws(()=>cook(before,{ingredients:[{lotId:before.inventory[0].id,quantity:10000,unit:'g'}]}),/többet/)
})
test('H-17: készétel csak megerősített adaghasználattal csökken, nyersanyag soha kétszer',()=>{
  const cooked=cook(chicken()).state
  const before=cooked.inventory.map(x=>x.quantityBase)
  assert.throws(()=>issue(cooked,'PreparedPortionConsumed',{id:cooked.prepared[0].id,portions:1}),/erősítsd/)
  const consumed=issue(cooked,'PreparedPortionConsumed',{id:cooked.prepared[0].id,portions:1,confirmed:true},
    {sourceType:'foodMeal',sourceId:'meal:personal-1'}).state
  assert.equal(consumed.prepared[0].portionsRemaining,3)
  assert.deepEqual(consumed.inventory.map(x=>x.quantityBase),before)
  assert.equal(issue(consumed,'PreparedPortionConsumed',{id:cooked.prepared[0].id,portions:1,confirmed:true},
    {sourceType:'foodMeal',sourceId:'meal:personal-1'}).duplicate,true)
})
test('H-18/19: receptolvasás becslés, sem készlet, sem biztos hozzávaló-azonosság',()=>{
  const before=chicken()
  const recipe={id:'r',name:'Csirkés tészta',ingredients:[{name:'Csirkemell',amount:500,unit:'g'}]}
  assert.equal(reviewFoodRecipeAvailability(recipe,before).status,'Ellenőrizendő')
  assert.equal(before.prepared.length,0)
  assert.equal(before.inventory.reduce((x,y)=>x+y.quantityBase,0),1000)
})
test('M1→M2 migráció: az eredeti Home készlet és események maradnak, sérült mentés nem törlődik',()=>{
  const store=memory()
  const original=chicken()
  const v1={...original,schemaVersion:1}
  delete v1.prepared
  const source=JSON.stringify(v1)
  store.setItem(HOME_KEY,source)
  const migrated=createHomeStore(store)
  assert.equal(migrated.getState().schemaVersion,2)
  assert.deepEqual(migrated.getState().inventory,original.inventory)
  assert.equal(store.getItem(HOME_KEY),source)
  migrated.dispatch({type:'ShoppingItemAdded',payload:{name:'Kenyér'}})
  assert.equal(createHomeStore(store).getState().shopping[0].name,'Kenyér')
  assert.equal(createHomeStore(store).getState().events.length,3)
  const broken=JSON.stringify({...v1,inventory:[{id:'invalid'}]})
  store.setItem(HOME_KEY,broken)
  assert.throws(()=>createHomeStore(store),/nem nyitható meg/)
  assert.equal(store.getItem(HOME_KEY),broken)
})
test('M2 főzési visszavonás adagot és alapanyagot atomikusan állít helyre',()=>{
  const before=chicken()
  const cooking=cook(before)
  const undo=issue(cooking.state,'Reversed',{eventId:cooking.event.eventId}).state
  assert.deepEqual(undo.inventory,before.inventory)
  assert.deepEqual(undo.prepared,[])
  assert.throws(()=>issue(undo,'Reversed',{eventId:cooking.event.eventId}),/nem vonható vissza/)
})
