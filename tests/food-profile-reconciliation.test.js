import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDiaryEntry, normalizeFoodProject, foodBackupToJson, foodBackupFromJson } from '../src/food/food-data.js'
import { previewFoodSameAccountAdoption } from '../src/food/food-profile-reconciliation.js'
import { yazioEntryFingerprint, undoYazioBatch } from '../src/food/food-yazio-import.js'

// Deliberately synthetic; the real personal backups are never placed in this repo.
const moment='2026-07-05T08:15:00.000Z'
const email='example@example.invalid'
const remoteId='remote-drive-permission-id'
const localId=email
function makeNutrients(calories=234) {
  return { energyKcal:calories, protein:10.5, carbohydrate:40.4, fat:1.8,
    fiber:null,sugar:3,saturatedFat:null,salt:null,extras:{} }
}
function newYazio(id,pid,importBatchId) {
  const key=`yazio:${pid}:id:synthetic-source-1`
  return normalizeDiaryEntry({
    id, profileId:pid, mealType:'breakfast', occurredAt:moment,
    amount:100, unit:'g', note:'YAZIO-import',
    snapshot:{foodId:'',name:'Synthetic toast',category:'YAZIO',
      source:{type:'yazio',id:'fake-product',revision:'',attribution:'YAZIO export'},
      baseAmount:100,baseUnit:'g',nutrients:makeNutrients()},
    externalKey:key,
    origin:{profileId:pid,source:'yazio',sourceRecordId:'synthetic-source-1',
      externalKey:key,importBatchId,sourceDate:'2026-07-05',
      sourceTimestamp:'2026-07-05 10:15:00',
      sourcePayload:{log:{entry_id:'synthetic-source-1',energy_kcal:234}},
      importedAt:moment,schemaVersion:1},
    createdAt:moment,updatedAt:moment,
  })
}
function healthEntry(id,pid) {
  const key='healthconnect:fake.app:synthetic-health-record'
  return normalizeDiaryEntry({id,profileId:pid,mealType:'lunch',
    occurredAt:'2026-10-12T09:00:00Z',amount:1,unit:'serving',
    snapshot:{foodId:'',name:'Health breakfast',category:'Health Connect',
      source:{type:'manual',id:key,revision:'',attribution:'fake.app'},
      baseAmount:1,baseUnit:'serving',nutrients:makeNutrients(616)},
    externalKey:key,createdAt:moment,updatedAt:moment})
}
function remoteOnlyMeal(pid) {
  return normalizeDiaryEntry({id:'remote-unique',profileId:pid,mealType:'dinner',
    occurredAt:'2026-10-15T16:00:00Z',amount:50,unit:'g',
    snapshot:{foodId:'',name:'Drive-only egg',category:'Food',
      source:{type:'manual',id:'fake',revision:'',attribution:''},
      baseAmount:50,baseUnit:'g',nutrients:makeNutrients(70)},
    createdAt:moment,updatedAt:moment})
}
function batch(id,profileId,entry) {
  return {id,profileId,source:'yazio',recordIds:[entry.id],
    entryFingerprints:{[entry.id]:yazioEntryFingerprint(entry)},status:'completed',
    sourceArchive:{meta:[{from:'2026-01-01',to:'2026-10-15'}]},
    importedAt:moment,schemaVersion:1}
}
function projects(){
  const ry=newYazio('remote-yazio',remoteId,'batch-remote')
  const ly=newYazio('local-yazio',localId,'batch-local')
  const saved={
    id:'remote-food',kind:'manual',name:'Saved local food',category:'Food',
    barcode:'',baseUnit:'g',nutrients:makeNutrients(),
    servings:[],source:{type:'manual'},verified:false,imageUrl:'',
    createdAt:moment,updatedAt:moment,
  }
  const remote=normalizeFoodProject({
    version:2,profile:{id:remoteId,name:'Drive display name',email,photo:''},
    targets:[{id:'remote-goal',effectiveFrom:'2026-10-15',
      values:{energyKcal:1800,protein:90,carbohydrate:200,fat:70}}],
    customFoods:[saved],recipes:[],diaryEntries:[ry,healthEntry('remote-health',remoteId),remoteOnlyMeal(remoteId)],
    favorites:[],recentFoods:[],recipeLibraries:[],sharingContacts:[],processedShareIds:[],
    importBatches:[batch('batch-remote',remoteId,ry)],settings:{},
    syncState:{localDirty:false},
  })
  const local=normalizeFoodProject({
    version:2,profile:{id:localId,name:'Email display name',email,photo:''},
    targets:[{id:'local-goal',effectiveFrom:'2026-10-15',
      values:{energyKcal:null,protein:null,carbohydrate:null,fat:null}}],
    customFoods:[],recipes:[],diaryEntries:[healthEntry('local-health',localId),ly],
    favorites:[],recentFoods:[],recipeLibraries:[],sharingContacts:[],processedShareIds:[],
    importBatches:[batch('batch-local',localId,ly)],settings:{},
    syncState:{localDirty:true},
  })
  // Model the real case: the later phone export holds additional raw-day
  // metadata even though it has the same complete YAZIO meal rows.
  local.importBatches[0].sourceArchive.meta[0].to='2026-10-18'
  local.importBatches[0].sourceArchive.raw_days=[{date:'2026-10-18',source:'synthetic'}]
  return {local,remote}
}
test('verified same-account adoption keeps Drive extras, goals, old YAZIO batch and deduplicates meals',()=>{
  const {local,remote}=projects()
  const original=structuredClone({local,remote})
  const {project,summary}=previewFoodSameAccountAdoption(local,remote,email)
  assert.deepEqual({local,remote},original,'Dry-run migration must never mutate the input.')
  assert.deepEqual(summary,{
    matchedLocalMeals:2,retainedDriveMeals:3,driveOnlyMeals:1,
    retainedSavedFoods:1,retainedYazioBatches:1,
  })
  assert.equal(project.profile.id,remoteId)
  assert.equal(project.profile.name,'Drive display name')
  assert.equal(project.targets[0].values.energyKcal,1800)
  assert.equal(project.customFoods.length,1)
  assert.equal(project.diaryEntries.length,3)
  assert.equal(project.syncState.localDirty,true)
  assert.equal(project.importBatches[0].id,'batch-remote')
  assert.equal(project.importBatches[0].additionalSourceArchives.length,1)
  assert.deepEqual(
    project.importBatches[0].additionalSourceArchives[0].sourceArchive,
    local.importBatches[0].sourceArchive,
    'Neither updated products nor new raw days may be lost.',
  )
  assert.deepEqual(project.importBatches[0].sourceArchive,remote.importBatches[0].sourceArchive)
  const entry=project.diaryEntries.find(e=>e.origin?.source==='yazio')
  assert.equal(entry.profileId,remoteId)
  assert.equal(entry.origin.profileId,remoteId)
  assert.equal(entry.origin.externalKey,`yazio:${remoteId}:id:synthetic-source-1`)
  assert.equal(entry.externalKey,entry.origin.externalKey)
  assert.equal(project.importBatches[0].entryFingerprints[entry.id],yazioEntryFingerprint(entry))
  assert.deepEqual(project.importBatches[0].entryFingerprints,remote.importBatches[0].entryFingerprints)
  assert.equal(project.diaryEntries[0].id,remote.diaryEntries[0].id)

  assert.deepEqual(foodBackupFromJson(foodBackupToJson(project),remoteId),project)
  const undo=undoYazioBatch(project,'batch-remote')
  assert.equal(undo.removed,1)
  assert.deepEqual(undo.modified,[])
  assert.equal(undo.project.diaryEntries.length,2)
})
test('different connected Google account or manually conflicting local changes stop migration',()=>{
  const {local,remote}=projects()
  assert.throws(()=>previewFoodSameAccountAdoption(local,remote,'other@example.invalid'),/igazolt Google-fiókhoz/)
  const different=structuredClone(local)
  different.diaryEntries[0].snapshot.nutrients.energyKcal=777
  assert.throws(()=>previewFoodSameAccountAdoption(different,remote,email),/eltérő étkezés/)
  const newEntry=structuredClone(local)
  newEntry.diaryEntries.push({...newEntry.diaryEntries[0],id:'fresh-local',externalKey:'healthconnect:fake.app:other-key'})
  assert.throws(()=>previewFoodSameAccountAdoption(newEntry,remote,email),/különálló vagy eltérő étkezés/)
  const target=structuredClone(local)
  target.targets[0].values.energyKcal=2250
  assert.throws(()=>previewFoodSameAccountAdoption(target,remote,email),/eltérő napi célértékek/)
})
test('multiple ambiguous YAZIO source archives block an automatic migration',()=>{
  const {local,remote}=projects()
  local.importBatches.push({...local.importBatches[0],id:'second-local-batch'})
  assert.throws(()=>previewFoodSameAccountAdoption(local,remote,email),/Több eltérő YAZIO-importköteg/)
})
test('tampered old YAZIO undo fingerprints cannot be silently rewritten',()=>{
  const {local,remote}=projects()
  remote.importBatches[0].entryFingerprints['remote-yazio']='previously-edited'
  assert.throws(()=>previewFoodSameAccountAdoption(local,remote,email),/automatikus migráció leállt/)
})
test('unrelated local saved foods and duplicated YAZIO source IDs stop profile migration',()=>{
  const {local,remote}=projects()
  local.customFoods.push({...remote.customFoods[0],id:'local-only-product'})
  assert.throws(()=>previewFoodSameAccountAdoption(local,remote,email),/customFoods/)
  local.customFoods=[]
  local.diaryEntries.push({...local.diaryEntries[1],id:'duplicate-id'})
  assert.throws(()=>previewFoodSameAccountAdoption(local,remote,email),/Ismétlődő külső étkezésazonosító/)
})
