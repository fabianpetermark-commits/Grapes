import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryV24FoodSnapshot as food, inventoryV24WaterSnapshot as water } from '../src/sync/grapes-health-v24-inventory.js'
import { previewHealthMigrationForOwner as preview } from '../src/sync/grapes-health-migration-preview.js'

const alice = '11111111-1111-4111-8111-111111111111'
const entry = { id: 'entry-1', profileId: 'drive-profile', occurredAt: '2026-10-20T12:00:00Z',
  origin: { profileId: 'drive-profile', source: 'yazio', sourceRecordId: 'y-7',
    sourceTimestamp: '2026-10-20T12:00:00Z', sourcePayload: { log: { id: 'y-7' } } } }
const data = () => ({ version: 2, profile: { id: 'drive-profile' },
  diaryEntries: [structuredClone(entry)],
  customFoods: [{ id: 'food-1', name: 'Synthetic' }],
  recipes: [{ id: 'recipe-1', ownerProfileId: 'drive-profile',
    ingredients: [{ id: 'ingredient-1', foodId: 'food-1' }] }],
  targets: [{ id: 'target-1', values: { energyKcal: 2000 } }],
  importBatches: [{ id: 'batch-1', profileId: 'drive-profile', source: 'yazio',
    sourceArchive: { nutrition_log: [{ id: 'y-7' }] } }] })
const local = value => ({ id: 'food-tracker-drive-profile', module: 'food', data: value })

test('v24 Food inventory keeps record IDs, YAZIO source and recipe ingredients', () => {
  const document = local(data())
  const before = JSON.stringify(document)
  const result = food({ provider: 'indexeddb', sourceId: document.id,
    version: 'snapshot-1', document })
  assert.equal(result.complete, true)
  assert.deepEqual(result.source.records.map(row => row.kind),
    ['food_diary', 'food_custom', 'food_recipe', 'food_recipe_ingredient',
      'nutrient_goal', 'yazio_import'])
  assert.equal(result.source.records[3].recordId, 'recipe-1/ingredient-1')
  assert.deepEqual(result.source.records[0].payload.origin.sourcePayload, entry.origin.sourcePayload)
  assert.equal(result.source.ownerId, null)
  assert.equal(JSON.stringify(document), before)
  assert.equal(preview({ verifiedOwnerId: alice, sources: [result.source] }).canImport, false)
})

test('v24 Drive Food snapshot keeps file provenance without a Drive request', () => {
  const result = food({ provider: 'google-drive', sourceId: 'synthetic-drive-file',
    version: 'modified-time-1', document: {
      grapesProject: true, module: 'food', data: data() } })
  assert.equal(result.source.sourceId, 'synthetic-drive-file')
  assert.equal(result.source.provider, 'google-drive')
})

test('Food inventory rejects mismatched profile and duplicate record identities', () => {
  assert.throws(() => food({ provider: 'indexeddb', sourceId: 'food-tracker-wrong',
    version: 'snapshot-1', document: local(data()) }), /profile/)
  const changed = data()
  changed.diaryEntries.push(structuredClone(entry))
  assert.throws(() => food({ provider: 'indexeddb', sourceId: 'food-tracker-drive-profile',
    version: 'snapshot-1', document: local(changed) }), /Duplicate/)
})

test('unmapped Food metadata is surfaced, never silently treated as migrated', () => {
  const changed = data()
  changed.recipeLibraries = [{ id: 'library-1' }]
  const result = food({ provider: 'indexeddb', sourceId: 'food-tracker-drive-profile',
    version: 'snapshot-1', document: local(changed) })
  assert.equal(result.complete, false)
  assert.equal(result.unmapped[0].field, 'recipeLibraries')
})

test('v24 Water inventory preserves entries and flags unmapped daily goals', () => {
  const raw = JSON.stringify({ '2026-10-20': { goal: 2200, entries: [{
    id: 'water-1', amount: 250, at: '2026-10-20T12:00:00Z',
    externalKey: 'healthconnect:water-1' }] } })
  const result = water({ raw, version: 'sha256-synthetic' })
  assert.equal(result.complete, false)
  assert.equal(result.unmapped[0].field, 'waterGoal')
  assert.equal(result.source.records[0].recordId, 'water-1')
  assert.equal(result.source.records[0].payload.externalKey, 'healthconnect:water-1')
  assert.equal(result.source.ownerId, null)
  assert.equal(preview({ verifiedOwnerId: alice, sources: [result.source] }).canImport, false)
})

test('damaged Water JSON and duplicate IDs fail closed', () => {
  assert.throws(() => water({ raw: '{', version: 'x' }), /Damaged/)
  const raw = JSON.stringify({
    '2026-10-20': { entries: [{ id: 'same', amount: 250, at: '2026-10-20T12:00:00Z' }] },
    '2026-10-21': { entries: [{ id: 'same', amount: 250, at: '2026-10-21T12:00:00Z' }] }
  })
  assert.throws(() => water({ raw, version: 'x' }), /Duplicate/)
})
