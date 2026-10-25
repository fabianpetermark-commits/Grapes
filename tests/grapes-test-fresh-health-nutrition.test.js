import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyFoodProject } from '../src/food/food-data.js'
import {
  prepareFreshOwnerHealthNutrition, confirmFreshOwnerHealthNutrition,
} from '../src/food/grapes-test-fresh-health-nutrition.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const source = {
  schemaVersion:1, producer:'hu.grapes.healthconnect',
  generatedAt:'2026-10-25T09:00:00.000Z',
  records: [
    {type:'nutrition',externalId:'healthconnect:com.samsung.android.app.healthdata:meal-1',
      sourcePackage:'com.samsung.android.app.healthdata',startTime:'2026-10-25T08:00:00.000Z',
      endTime:'2026-10-25T08:05:00.000Z',name:'Saját reggeli',energyKcal:300,
      proteinGrams:20,carbohydrateGrams:30,fatGrams:10,mealType:'breakfast'},
    {type:'hydration',externalId:'healthconnect:com.samsung.android.app.healthdata:water-1',
      sourcePackage:'com.samsung.android.app.healthdata',startTime:'2026-10-25T08:10:00.000Z',
      endTime:'2026-10-25T08:10:00.000Z',volumeMilliliters:250},
  ],
}
const empty = id => createEmptyFoodProject({id,name:'Grapes-felhasználó',email:'',photo:''})
const session = id => ({
  async assertOwner() {return id},
  async save(candidate) {this.saved=structuredClone(candidate)},
  saved:null,
})
test('Health nutrition-only preview keeps hydration entirely blocked',()=>{
  const preview=prepareFreshOwnerHealthNutrition(JSON.stringify(source),{ownerId:A})
  assert.deepEqual(preview.counts,{ready:1,duplicate:0,invalid:0,blocked:1})
  assert.equal(preview.records[0].entry.profileId,A)
  assert.equal(preview.records[1].entry,null)
  assert.equal(preview.records[1].status,'blocked')
})
test('explicit confirmation writes only own nutrition to owner session',async()=>{
  const a=session(A), preview=prepareFreshOwnerHealthNutrition(source,{ownerId:A})
  const result=await confirmFreshOwnerHealthNutrition({session:a,project:empty(A),preview,selectedIndexes:[0]})
  assert.equal(result.imported,1)
  assert.equal(a.saved.profile.id,A)
  assert.equal(a.saved.diaryEntries.length,1)
  assert.equal(a.saved.diaryEntries[0].snapshot.nutrients.energyKcal,300)
  assert.ok(a.saved.diaryEntries.every(x=>x.snapshot.category!=='Folyadék'))
  const duplicate=await confirmFreshOwnerHealthNutrition({session:a,project:result.project,preview,selectedIndexes:[0]})
  assert.equal(duplicate.imported,0)
  assert.equal(a.saved.diaryEntries.length,1)
})
test('cross-account, blocked hydration and unverified session denied without write',async()=>{
  const a=session(A), preview=prepareFreshOwnerHealthNutrition(source,{ownerId:A})
  for(const args of [
    {session:a,project:empty(B),preview,selectedIndexes:[0]},
    {session:session(B),project:empty(A),preview,selectedIndexes:[0]},
    {session:a,project:empty(A),preview,selectedIndexes:[1]},
    {session:{},project:empty(A),preview,selectedIndexes:[0]},
  ]){
    await assert.rejects(confirmFreshOwnerHealthNutrition(args))
  }
  assert.equal(a.saved,null)
})
test('repeated source export de-duplicates and invalid nutrition excluded',()=>{
  const q={...source,records:[source.records[0],source.records[0],
    {...source.records[0],externalId:'healthconnect:example:invalid',energyKcal:-4},source.records[1]]}
  const p=prepareFreshOwnerHealthNutrition(q,{ownerId:A,
    existingEntries:[{externalKey:source.records[0].externalId}]})
  assert.deepEqual(p.counts,{ready:0,duplicate:2,invalid:1,blocked:1})
  assert.throws(()=>prepareFreshOwnerHealthNutrition(source,{ownerId:'fake'}))
})
