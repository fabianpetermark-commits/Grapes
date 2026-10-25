import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHomeCommand, createHomeState, validateHomeState } from '../src/home/home-data.js'

const owner = '00000000-0000-4000-8000-000000000001'
const makeStock = () => applyHomeCommand(createHomeState({householdId:owner,actorId:owner}), {
  type:'StockCountConfirmed',eventId:'stock-1',payload:{name:'Tej',quantity:1,unit:'l',storageLocation:'fridge'},
}).state
const cooking = state => ({type:'CookingConfirmed',eventId:'cook-1',sourceType:'food-recipe',
  sourceId:owner+':r1:cook-1',payload:{recipeRef:'r1',name:'Tejital',portions:2,portionUnit:'serving',storageLocation:'fridge',
    consumed:[{id:state.inventory[0].id,quantity:200,unit:'ml'}]}})

test('Owner Home M2: v1 verified history normalizes in memory to v2 without modifying source', () => {
  const v1 = structuredClone(makeStock())
  v1.schemaVersion = 1
  delete v1.prepared
  const before = JSON.stringify(v1)
  const migrated = validateHomeState(v1)
  assert.equal(migrated.schemaVersion, 2)
  assert.deepEqual(migrated.prepared, [])
  assert.equal(migrated.revision, 1)
  assert.equal(migrated.inventory[0].quantityBase, 1000)
  assert.equal(JSON.stringify(v1), before)
})

test('Owner Home M2: confirmed recipe cooking is atomic, idempotent and reversible', () => {
  const initial = makeStock()
  const command = cooking(initial)
  const first = applyHomeCommand(initial,command)
  assert.equal(first.state.inventory[0].quantityBase,800)
  assert.equal(first.state.prepared[0].portionsRemaining,2)
  assert.equal(first.state.events.length,2)
  assert.equal(applyHomeCommand(first.state,command).duplicate,true)
  assert.equal(applyHomeCommand(first.state,{...command,eventId:'different',sourceId:command.sourceId}).duplicate,true)
  assert.equal(initial.inventory[0].quantityBase,1000)
  const reverted = applyHomeCommand(first.state,{type:'Reversed',eventId:'undo-1',payload:{eventId:'cook-1'}})
  assert.equal(reverted.state.inventory[0].quantityBase,1000)
  assert.equal(reverted.state.prepared.length,0)
  assert.throws(() => applyHomeCommand(reverted.state,{type:'Reversed',payload:{eventId:'cook-1'}}))
})

test('Owner Home M2: invalid cooking never causes partial inventory writes', () => {
  const state = makeStock(), c = cooking(state)
  for(const overrides of [
    {consumed:[]},
    {consumed:[{id:state.inventory[0].id,quantity:2,unit:'l'}]},
    {consumed:[{id:state.inventory[0].id,quantity:300,unit:'g'}]},
    {consumed:[{id:state.inventory[0].id,quantity:200,unit:'ml'},{id:state.inventory[0].id,quantity:100,unit:'ml'}]},
    {portions:0},{portions:'1.5'},
  ]) assert.throws(() => applyHomeCommand(state,{...c,payload:{...c.payload,...overrides}}))
  assert.equal(state.inventory[0].quantityBase,1000)
  assert.equal(state.prepared.length,0)
})
