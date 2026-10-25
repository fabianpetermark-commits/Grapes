import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyFoodProject } from '../src/food/food-data.js'
import { prepareFreshOwnerYazio, confirmFreshOwnerYazio, undoFreshOwnerYazio } from '../src/food/grapes-test-fresh-yazio.js'
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const row = (extra={}) => ({
  date:'2026-10-25',logged_at:'2026-10-25 12:00:00',meal:'lunch',
  entry_id:'id1',source_id:'p1',product:'Alma',type:'product',
  amount:100,energy_kcal:88.123456,protein_g:1,
  carbs_g:19,fat_g:0,...extra,
})
const json = (rows=[row()]) => JSON.stringify({
  meta:[{tool_version:'0.2.0',from:'2026-01-01',to:'2026-10-25'}],
  tables:[{name:'nutrition_log'}],nutrition_log:rows,
  daily_summary:[{date:'2026-10-25',energy_kcal:88.123456}],
  products:[{product_id:'p1',name:'Alma',base_unit:'g'}],
  recipes:[],recipe_ingredients:[],recipe_instructions:[],warnings:[],
})
const csv = 'Date,Time,Meal,Product,Amount,Unit,Calories total,Protein total,Fat total,Carbs total\n'+
  '2026-10-25,12:00,lunch,Alma,100,g,88,1,0,19\n'
function mockSession(ownerId=A) {
  let data=createEmptyFoodProject({id:ownerId,name:'Grapes-felhasználó',email:'',photo:''})
  let writes=0, revoked=false
  return {
    ownerId, async assertOwner(){if(revoked)throw Error('Account changed');return ownerId},
    async load(){if(revoked)throw Error('Account changed');return structuredClone(data)},
    async save(next){if(revoked)throw Error('Account changed');data=structuredClone(next);writes++},
    get data(){return structuredClone(data)},get writes(){return writes},
    invalidate(){revoked=true},
  }
}
test('YAZIO JSON: lossless archive, owner-bound batch and safe undo',async()=>{
  const session=mockSession(),preview=prepareFreshOwnerYazio(json(),{ownerId:A,filename:'export.json'})
  assert.equal(preview.counts.ready,1)
  const r=await confirmFreshOwnerYazio({session,preview,selectedIndexes:[0]})
  assert.equal(r.imported,1)
  assert.equal(session.writes,1)
  assert.equal(session.data.importBatches[0].profileId,A)
  assert.equal(session.data.importBatches[0].sourceArchive.nutrition_log[0].product,'Alma')
  assert.equal(session.data.diaryEntries[0].snapshot.nutrients.energyKcal,88.123456)
  const duplicate=await confirmFreshOwnerYazio({session,preview,selectedIndexes:[0]})
  assert.equal(duplicate.imported,0)
  assert.equal(session.writes,1)
  const undone=await undoFreshOwnerYazio({session})
  assert.equal(undone.removed,1)
  assert.equal(session.data.diaryEntries.length,0)
  assert.equal(session.data.importBatches[0].status,'undone')
})
test('YAZIO CSV supports owned batch and undo',async()=>{
  const session=mockSession(),p=prepareFreshOwnerYazio(csv,{ownerId:A,filename:'nutrition_log.csv'})
  assert.equal(p.counts.ready,1)
  const saved=await confirmFreshOwnerYazio({session,preview:p,selectedIndexes:[0]})
  assert.equal(saved.imported,1)
  assert.equal(session.data.importBatches[0].status,'completed')
  assert.equal(session.data.diaryEntries[0].origin.profileId,A)
  assert.equal((await undoFreshOwnerYazio({session})).removed,1)
})
test('Wrong fiók, duplicate index and invalid preview denied without writing',async()=>{
  const session=mockSession(),p=prepareFreshOwnerYazio(json([row(),row()]),{ownerId:A,filename:'export.json'})
  assert.deepEqual(p.counts,{ready:1,duplicate:1,uncertain:0,invalid:0})
  for(const args of [
    {session:mockSession(B),preview:p,selectedIndexes:[0]},
    {session,preview:p,selectedIndexes:[1]},
    {session,preview:p,selectedIndexes:[0,0]},
    {session,preview:p,selectedIndexes:[500]},
  ])await assert.rejects(confirmFreshOwnerYazio(args))
  assert.equal(session.writes,0)
})
test('Edited imported meal is never silently undone',async()=>{
  const session=mockSession(),p=prepareFreshOwnerYazio(json(),{ownerId:A,filename:'a.json'})
  await confirmFreshOwnerYazio({session,preview:p,selectedIndexes:[0]})
  const edited=session.data
  edited.diaryEntries[0].snapshot.nutrients.energyKcal=999
  await session.save(edited)
  const undone=await undoFreshOwnerYazio({session})
  assert.equal(undone.removed,0)
  assert.equal(undone.modified.length,1)
  assert.equal(session.data.diaryEntries[0].snapshot.nutrients.energyKcal,999)
})
test('Identity change rejects commit and legacy imports are never opened',async()=>{
  const session=mockSession()
  const p=prepareFreshOwnerYazio(json(),{ownerId:A,filename:'a.json'})
  session.invalidate()
  await assert.rejects(confirmFreshOwnerYazio({session,preview:p,selectedIndexes:[0]}))
  assert.equal(session.writes,0)
  assert.throws(()=>prepareFreshOwnerYazio(json(),{ownerId:'unverified',filename:'a.json'}))
})
