import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyFoodProject, foodBackupFromJson, foodBackupToJson } from '../src/food/food-data.js'
import { aggregateNutritionSeries, buildDailyNutritionSeries } from '../src/food/food-stats.js'
import { parseYazioExport, prepareYazioImport, applyYazioBatch, markYazioBatchComplete, undoYazioBatch } from '../src/food/food-yazio-import.js'
const profile = { id: 'profile-one', name: 'Teszt' }
const row = (override = {}) => ({ date: '2024-01-02', logged_at: '2024-01-02 12:00:00', meal: 'lunch', entry_id: 'id1', source_id: 'p1', product: 'Alma', type: 'product', amount: 100, energy_kcal: 88.00001, protein_g: 1, carbs_g: 19, fat_g: 0, sodium_mg: 1.123456, fiber_g: null, ...override })
const json = (rows = [row()], extra = {}) => JSON.stringify({ meta: [{ tool_version: '0.2.0', from: '2020-01-01', to: '2026-10-15' }], tables: [{ name: 'nutrition_log' }], nutrition_log: rows, daily_summary: [{ date: '2024-01-02', energy_kcal: 88.00001 }], products: [{ product_id: 'p1', name: 'Alma', base_unit: 'g' }], recipes: [], recipe_ingredients: [], recipe_instructions: [], warnings: [], ...extra })
const plan = (rows = [row()], existingEntries = [], extra = {}) => prepareYazioImport(json(rows, extra), { profileId: profile.id, existingEntries })
const apply = (p, project = createEmptyFoodProject(profile), indexes = null, batch = 'batch1') => applyYazioBatch(project, p, indexes || p.records.filter(r => r.status === 'ready').map(r => r.index), batch)

test('üres export', () => { const p = plan([]); assert.equal(p.records.length, 0); assert.equal(apply(p).added, 0) })
test('egynapos import', () => { assert.equal(apply(plan()).project.diaryEntries.length, 1) })
test('többéves import', () => { const p = plan([row({ date: '2021-01-01', logged_at: '2021-01-01 12:00:00' }), row({ date: '2026-09-01', logged_at: '2026-09-01 12:00:00', entry_id: 'id2' })]); assert.equal(p.from, '2021-01-01'); assert.equal(p.to, '2026-09-01') })
test('hiányzó tápanyag nem nulla', () => { assert.equal(plan().records[0].entry.snapshot.nutrients.fiber, null) })
test('két külön ID-s azonos étkezés', () => { assert.equal(plan([row(), row({entry_id:'id2'})]).counts.ready, 2) })
test('két ID nélküli azonos étkezés', () => { const p = plan([row({entry_id:null}), row({entry_id:null})]); assert.equal(p.counts.ready, 2); assert.notEqual(p.records[0].entry.externalKey,p.records[1].entry.externalKey) })
test('belső biztos duplikáció', () => { assert.equal(plan([row(), row()]).counts.duplicate, 1) })
test('ismételt export idempotens', () => { const first = apply(plan()).project; const second = apply(plan([row()],first.diaryEntries), first); assert.equal(second.added,0); assert.equal(second.project.diaryEntries.length,1) })
test('átfedő export ID alapján', () => { const first = apply(plan()).project; const p = plan([row(),row({entry_id:'id2'})],first.diaryEntries); assert.equal(p.counts.ready,1); assert.equal(p.counts.duplicate,1) })
test('Health Connect lehetséges átfedése bizonytalan', () => { const prior = apply(plan()).project.diaryEntries[0]; const health = {...prior,externalKey:'healthconnect:app:id1',origin:undefined}; const p=plan([row()],[health]); assert.equal(p.counts.uncertain,1); assert.equal(apply(p).added,0) })
test('előnézet nem módosít', () => { const before=createEmptyFoodProject(profile); plan([row()],before.diaryEntries); assert.equal(before.diaryEntries.length,0) })
test('hibás JSON elutasítva', () => { assert.throws(()=>parseYazioExport('{'),/Hibás/) })
test('ismeretlen formátum elutasítva', () => { assert.throws(()=>parseYazioExport('{}'),/Ismeretlen/) })
test('ismeretlen verzió elutasítva', () => { const j=JSON.parse(json());j.meta[0].tool_version='99.0';assert.throws(()=>parseYazioExport(JSON.stringify(j)),/Nem támogatott/) })
test('mg és mikrogramm egységek', () => { const n=plan([row({folate_ug:20.7})]).records[0].entry.snapshot.nutrients.extras;assert.equal(n.sodium.unit,'mg');assert.equal(n.folate.unit,'µg') })
test('recept hozzávaló kapcsolat megőrződik', () => { const p=plan([row({type:'recipe_portion',source_id:'r1'})],[],{recipes:[{recipe_id:'r1',name:'Recept'}],recipe_ingredients:[{recipe_id:'r1',amount:100}]}); assert.equal(p.records[0].entry.origin.sourcePayload.linked.ingredients.length,1) })
test('hiányzó termékadat naplója importálható', () => { assert.equal(plan([row({source_id:'unknown'})],[],{products:[]}).counts.ready,1) })
test('forrásrekord megmarad precízen', () => { const n=apply(plan()).project.diaryEntries[0];assert.equal(n.snapshot.nutrients.energyKcal,88.00001);assert.equal(n.origin.sourcePayload.log.sodium_mg,1.123456) })
test('köteg visszavonása', () => { const first=apply(plan());const u=undoYazioBatch(first.project,first.batchId);assert.equal(u.removed,1);assert.equal(u.project.diaryEntries.length,0) })

test('importálás közbeni óraátlépés nem jelöl új rekordot utólag módosítottnak', () => {
  const NativeDate = globalThis.Date
  let tick = NativeDate.parse('2026-10-15T10:00:00Z')
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [tick++])) } }
  try {
    const result = apply(plan())
    assert.equal(result.project.diaryEntries[0].createdAt, result.project.diaryEntries[0].updatedAt)
    assert.equal(undoYazioBatch(result.project, result.batchId).removed, 1)
  } finally { globalThis.Date = NativeDate }
})
test('módosított bejegyzés visszavonáskor megmarad', () => { const first=apply(plan());first.project.diaryEntries[0].updatedAt='2026-10-15T10:00:00Z';const u=undoYazioBatch(first.project,first.batchId);assert.equal(u.removed,0);assert.equal(u.modified.length,1) })
test('profilok el vannak szigetelve', () => { assert.throws(()=>apply(plan(),createEmptyFoodProject({id:'profile-two'})),/Google-fiókhoz/) })
test('megszakított import folytatása', () => { const p=plan([row(),row({entry_id:'id2'})]);const first=apply(p,createEmptyFoodProject(profile),[0]);const second=apply(p,first.project,[0,1]);assert.equal(second.added,1);const done=markYazioBatchComplete(second.project,'batch1');assert.equal(done.importBatches.length,1);assert.equal(done.importBatches[0].status,'completed') })
test('statisztika eredeti forrásnap szerint', () => { assert.equal(buildDailyNutritionSeries(apply(plan()).project.diaryEntries,profile.id)[0].date,'2024-01-02') })
test('napi eltérés megjelenik', () => { assert.equal(plan([row()],[],{daily_summary:[{date:'2024-01-02',energy_kcal:300}]}).discrepancies.length>0,true) })
test('meglévő katalógust nem módosít', () => {const start=createEmptyFoodProject(profile);start.customFoods=[{id:'x',name:'X',nutrients:{energyKcal:2}}];const after=apply(plan(),start).project;assert.equal(after.customFoods[0].name,'X') })

test('csendben módosított tápértékek sem törölhetők visszavonáskor', () => {
  const first = apply(plan())
  first.project.diaryEntries[0].snapshot.nutrients.energyKcal = 999
  const reverted = undoYazioBatch(first.project, first.batchId)
  assert.equal(reverted.removed, 0)
  assert.equal(reverted.modified.length, 1)
})
test('azonos ID nélküli rekord átfedő exportban duplikátum marad', () => {
  const base = row({ entry_id: null })
  const first = apply(plan([base])).project
  const later = plan([base, row({ entry_id: 'another', logged_at: '2024-01-02 13:00:00' })], first.diaryEntries)
  assert.equal(later.records[0].status, 'duplicate')
  assert.equal(later.records[0].entry.externalKey, first.diaryEntries[0].externalKey)
  assert.equal(apply(later, first).added, 1)
})
test('a korábban mentett exportlenyomatos ID nélküli kulcsot is felismeri', () => {
  const base = row({ entry_id: null })
  const first = apply(plan([base])).project
  first.diaryEntries[0].externalKey += ':0123456789abcdef'
  const later = plan([base, row({ entry_id: 'another', logged_at: '2024-01-02 13:00:00' })], first.diaryEntries)
  assert.equal(later.records[0].status, 'duplicate')
})

test('mikrotápanyagok saját statisztikaként összesíthetők', () => {
  const p = plan([row({folate_ug:2.234567})])
  const series = buildDailyNutritionSeries(apply(p).project.diaryEntries, profile.id)
  assert.equal(series[0].nutrients['extra:folate'], 2.234567)
  assert.equal(aggregateNutritionSeries(series, 'extra:folate')[0].value, 2.23)
})

test('YAZIO előtti teljes Food backupból visszaállítható az eredeti projekt', () => {
  const before = createEmptyFoodProject(profile)
  before.diaryEntries = []
  const rawBackup = foodBackupToJson(before)
  const after = apply(plan(), before).project
  assert.equal(after.diaryEntries.length, 1)
  const restored = foodBackupFromJson(rawBackup, profile.id)
  assert.equal(restored.diaryEntries.length, 0)
  assert.equal(restored.importBatches.length, 0)
  assert.equal(restored.profile.id, profile.id)
})
test('teljesen ismeretlen tápanyagtartalom is null marad, a rekord megmarad', () => {
  const p = plan([row({energy_kcal:null, protein_g:null,carbs_g:null,fat_g:null,sodium_mg:null})])
  assert.equal(p.counts.ready, 1)
  assert.equal(p.records[0].entry.snapshot.nutrients.energyKcal, null)
})
