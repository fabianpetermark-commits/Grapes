import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOOD_BACKUP_VERSION, FOOD_PROJECT_VERSION, foodBackupFromJson, foodBackupToJson,
  normalizeFoodProject,
} from '../src/food/food-data.js'
import {
  assertFoodDriveCreateSafe, chooseFoodDriveProject, foodProjectHasUserContent,
} from '../src/food/food-drive-safety.js'

const savedAt = '2025-08-11T07:30:00.000Z'
const profile = { id:'legacy-food-user', name:'Régi Food profil', email:'fake@example.invalid' }
const nutrients = (energyKcal,protein,carbohydrate,fat,extra={}) => ({
  energyKcal,protein,carbohydrate,fat,fiber:null,sugar:null,saturatedFat:null,salt:null,extras:extra,
})

// Realistic PRE-TEST Food v2 shape. No rich HTML, uploaded data-URL photo or new UI fields.
function stableLegacyProject() {
  return {
    version:2,profile,
    targets:[
      {id:'target-old',effectiveFrom:'2025-01-01',values:{energyKcal:2100,protein:100,carbohydrate:245,fat:75}},
      {id:'target-new',effectiveFrom:'2025-08-01',values:{energyKcal:1900,protein:90,carbohydrate:220,fat:60}},
    ],
    customFoods:[
      {id:'flour-1',kind:'manual',name:'Búzafinomliszt BL55',category:'Liszt',baseUnit:'g',
        nutrients:nutrients(350,9,73,1),source:{type:'manual'},
        createdAt:savedAt,updatedAt:savedAt},
      {id:'jam-1',kind:'product',name:'Régi importált termék',category:'Élelmiszer',baseUnit:'g',
        barcode:'5991234567890',nutrients:nutrients(250,0,60,0),
        source:{type:'fatsecret',id:'legacy-fs',attribution:'Korábbi import'},
        createdAt:savedAt,updatedAt:savedAt},
    ],
    recipes:[{id:'bread-1',foodId:'bread-food-1',ownerProfileId:profile.id,name:'Régi kenyérrecept',
      category:'Kenyerek',ingredients:[{id:'ingredient-1',foodId:'flour-1',amount:400,unit:'g'}],
      instructions:'1. Összeállítás: Keverd össze. 2. Sütés: 200 °C.',
      preparedWeight:690,yieldCount:27.6,averageUnitWeight:25,yieldUnit:'slice',revision:1,
      createdAt:savedAt,updatedAt:savedAt}],
    diaryEntries:[
      {id:'entry-bread',profileId:profile.id,mealType:'breakfast',occurredAt:'2025-08-11T08:00:00Z',
        amount:2,unit:'slice',servingId:'bread-1-yield',createdAt:savedAt,updatedAt:savedAt,
        snapshot:{foodId:'bread-food-1',name:'Régi kenyérrecept',category:'Kenyerek',source:{type:'recipe',id:'bread-1',revision:'1'},
          baseAmount:50,baseUnit:'g',nutrients:nutrients(230,6,48,1)}},
      {id:'entry-old-import',profileId:profile.id,mealType:'lunch',occurredAt:'2025-08-10T11:00:00Z',
        amount:125,unit:'g',createdAt:savedAt,updatedAt:savedAt,externalKey:'yazio:legacy:row42',
        snapshot:{foodId:'jam-1',name:'Régi importált termék',category:'Élelmiszer',source:{type:'fatsecret',id:'legacy-fs'},
          baseAmount:125,baseUnit:'g',nutrients:nutrients(312.12345678,0,75.12345678,0,{sodium:{amount:13.12345678,unit:'mg'}})},
        origin:{profileId:profile.id,source:'yazio',sourceRecordId:'row42',externalKey:'yazio:legacy:row42',
          importBatchId:'batch-old',sourceDate:'2025-08-10',sourceTimestamp:'2025-08-10T11:00:00Z',
          sourcePayload:{log:{product:'Régi importált termék',energy_kcal:312.12345678}},importedAt:savedAt,schemaVersion:1}},
    ],
    favorites:['jam-1'],recentFoods:['jam-1','bread-food-1'],
    recipeLibraries:[{id:'shared-recipes-old',name:'Kedvenceim'}],
    importBatches:[{id:'batch-old',source:'yazio',status:'completed',imported:1}],
    sharingContacts:[{email:'friend@example.invalid',name:'Közös recept',lastUsedAt:savedAt}],
    processedShareIds:['share-1'],syncState:{localDirty:false},
    settings:{mealCalorieLimits:{breakfast:500,dinner:650}},
  }
}

test('stable Food v2 data survives staged code normalization and JSON backup round-trip', () => {
  const legacy=stableLegacyProject()
  const original=structuredClone(legacy)
  const normalized=normalizeFoodProject(legacy,profile.id)
  assert.deepEqual(legacy,original,'A betöltés ne módosítsa a forrásprojektet.')
  assert.equal(normalized.version,FOOD_PROJECT_VERSION)
  assert.equal(FOOD_PROJECT_VERSION,2)
  assert.deepEqual(normalized.targets.map(x=>x.id),['target-old','target-new'])
  assert.deepEqual(normalized.customFoods.map(x=>x.id),['flour-1','jam-1'])
  assert.equal(normalized.customFoods[1].source.type,'fatsecret')
  assert.equal(normalized.recipes[0].ingredients[0].foodId,'flour-1')
  assert.equal(normalized.recipes[0].preparedWeight,690)
  assert.equal(normalized.recipes[0].averageUnitWeight,25)
  assert.equal(normalized.recipes[0].yieldCount,27.6)
  assert.equal(normalized.recipes[0].instructions,legacy.recipes[0].instructions)
  assert.equal(normalized.recipes[0].instructionsHtml,'')
  assert.equal(normalized.diaryEntries[0].snapshot.nutrients.energyKcal,230)
  assert.equal(normalized.diaryEntries[1].snapshot.nutrients.energyKcal,312.12345678)
  assert.equal(normalized.diaryEntries[1].origin.sourcePayload.log.energy_kcal,312.12345678)
  assert.equal(normalized.diaryEntries[1].externalKey,'yazio:legacy:row42')
  assert.equal(normalized.diaryEntries[1].snapshot.nutrients.fiber,null)
  const backup=foodBackupToJson(normalized,'2026-10-18T08:00:00Z')
  const parsed=JSON.parse(backup)
  assert.equal(parsed.grapesFoodBackup,true)
  assert.equal(parsed.version,FOOD_BACKUP_VERSION)
  const restored=foodBackupFromJson(backup,profile.id)
  assert.deepEqual(restored,normalized,'Az újraimportált projekt legyen ugyanaz, amit exportáltunk.')
  assert.deepEqual(restored.importBatches,legacy.importBatches)
  assert.deepEqual(restored.recipeLibraries,legacy.recipeLibraries)
  assert.deepEqual(restored.settings,legacy.settings)
  assert.deepEqual(restored.favorites,legacy.favorites)
  assert.deepEqual(restored.processedShareIds,legacy.processedShareIds)
  assert.equal(restored.diaryEntries.length,2)
  assert.throws(()=>foodBackupFromJson(backup,'other-user'),/másik Google-fiókhoz/)
})

test('default empty local Food may load one remote, but never pick a random one',()=>{
  const empty={version:2,targets:[{values:{energyKcal:2000,protein:null,carbohydrate:null,fat:null}}],settings:{}}
  assert.equal(foodProjectHasUserContent(empty),false)
  const one=chooseFoodDriveProject([{id:'remote-a'}],{localProject:empty})
  assert.equal(one.candidate.id,'remote-a')
  assert.equal(one.conflict,'')
  const two=chooseFoodDriveProject([{id:'remote-a'},{id:'remote-b'}],{localProject:empty})
  assert.equal(two.candidate,null)
  assert.match(two.conflict,/Több Food/)
})

test('unlinked existing local diary is never replaced with first Drive file',()=>{
  const local=stableLegacyProject()
  assert.equal(foodProjectHasUserContent(local),true)
  const files=[{id:'other-account-food'},{id:'actual-food'}]
  const selected=chooseFoodDriveProject(files,{localProject:local})
  assert.equal(selected.candidate,null)
  assert.match(selected.conflict,/helyi Food-napló/)
  const explicit=chooseFoodDriveProject(files,{localProject:local,linkedFileId:'actual-food'})
  assert.equal(explicit.candidate.id,'actual-food')
  const lost=chooseFoodDriveProject(files,{localProject:local,linkedFileId:'missing-remote'})
  assert.equal(lost.candidate,null)
  assert.match(lost.conflict,/nem található/)
  assert.deepEqual(chooseFoodDriveProject([],{localProject:local}),{candidate:null,conflict:''})
})

test('first upload checks for an already existing remote diary to prevent duplicates',()=>{
  assert.doesNotThrow(()=>assertFoodDriveCreateSafe([]))
  assert.throws(()=>assertFoodDriveCreateSafe([{id:'existing'}]),/Már létezik Food-napló/)
  assert.doesNotThrow(()=>assertFoodDriveCreateSafe(null))
})
