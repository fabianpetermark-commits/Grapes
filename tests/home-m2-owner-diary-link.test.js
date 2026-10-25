import test from 'node:test'
import assert from 'node:assert/strict'
import { eligibleSavedFoodDiaryEntries, reviewSavedFoodDiaryEntry } from '../src/home/home-food-diary-link.js'
import { applyHomeCommand, createHomeState } from '../src/home/home-data.js'

const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002'
const recipe = { id:'r1',foodId:'recipe-food-1',ownerProfileId:A,yieldUnit:'serving' }
const prepared = { id:'lot1',recipeRef:'r1',portionUnit:'serving',portionsRemaining:3 }
const entry = { id:'entry1',profileId:A,amount:2,unit:'serving',occurredAt:'2026-10-25T12:00:00Z',
  snapshot:{foodId:'recipe-food-1',source:{type:'recipe',id:'r1',attribution:A,revision:'1'}} }
const project = { profile:{id:A},recipes:[recipe],diaryEntries:[entry] }

test('M2 Food link: only matching saved owner recipe, unit and integer portions are offered', () => {
  const before = JSON.stringify([project,prepared])
  assert.deepEqual(reviewSavedFoodDiaryEntry(project,A,prepared,entry),
    {preparedLotId:'lot1',recipeRef:'r1',profileId:A,foodEntryId:'entry1',portions:2,unit:'serving'})
  for (const wrong of [
    {...entry,profileId:B}, {...entry,amount:1.5}, {...entry,amount:4},
    {...entry,unit:'g'}, {...entry,origin:{source:'yazio'}},
    {...entry,snapshot:{...entry.snapshot,source:{...entry.snapshot.source,id:'other'}}},
    {...entry,snapshot:{...entry.snapshot,source:{...entry.snapshot.source,attribution:B}}},
    {...entry,snapshot:{...entry.snapshot,foodId:'different'}},
  ]) assert.equal(reviewSavedFoodDiaryEntry(project,A,prepared,wrong),null)
  assert.equal(reviewSavedFoodDiaryEntry({...project,profile:{id:B}},A,prepared,entry),null)
  assert.equal(reviewSavedFoodDiaryEntry({...project,recipes:[]},A,prepared,entry),null)
  assert.equal(JSON.stringify([project,prepared]),before)
})

test('M2 Food link: consumed own Food entry cannot appear again in eligible list', () => {
  assert.equal(eligibleSavedFoodDiaryEntries(project,A,prepared,[]).length,1)
  const events=[{type:'PreparedConsumptionLinked',sourceType:'food-diary',sourceId:A+':entry1'}]
  assert.deepEqual(eligibleSavedFoodDiaryEntries(project,A,prepared,events),[])
})

test('M2 Food link: event source uniquely deducts prepared portions, never raw stock or Food', () => {
  const start = createHomeState({householdId:A,actorId:A})
  const stock = applyHomeCommand(start,{type:'StockCountConfirmed',eventId:'stock',
    payload:{name:'Tej',quantity:1,unit:'l',storageLocation:'fridge'}}).state
  const cooked = applyHomeCommand(stock,{type:'CookingConfirmed',eventId:'cook',
    sourceType:'food-recipe',sourceId:A+':r1:cook',payload:{
      name:'Tejital',recipeRef:'r1',portions:3,storageLocation:'fridge',portionUnit:'serving',
      consumed:[{id:stock.inventory[0].id,quantity:200,unit:'ml'}],
    }}).state
  const source=A+':entry1'
  const payload={...reviewSavedFoodDiaryEntry(project,A,{...cooked.prepared[0]},entry),
    preparedLotId:cooked.prepared[0].id}
  const done=applyHomeCommand(cooked,{type:'PreparedConsumptionLinked',eventId:'link',sourceType:'food-diary',sourceId:source,payload})
  assert.equal(done.state.prepared[0].portionsRemaining,1)
  assert.equal(done.state.inventory[0].quantityBase,800)
  assert.equal(cooked.prepared[0].portionsRemaining,3)
  assert.equal(applyHomeCommand(done.state,{type:'PreparedConsumptionLinked',eventId:'another',sourceType:'food-diary',sourceId:source,payload}).duplicate,true)
  assert.throws(()=>applyHomeCommand(cooked,{type:'PreparedConsumptionLinked',sourceType:'food-diary',sourceId:source,
    payload:{...payload,portions:4}}))
})
