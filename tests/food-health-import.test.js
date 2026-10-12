import test from 'node:test'
import assert from 'node:assert/strict'

import { healthImportEntries, parseHealthBridgeExport, prepareHealthBridgeImport } from '../src/food/food-health-import.js'

const profileId = 'google-user-1'
const payload = {
  schemaVersion: 1,
  producer: 'hu.grapes.healthconnect',
  generatedAt: '2026-10-12T12:00:00.000Z',
  records: [
    { type: 'nutrition', externalId: 'healthconnect:com.samsung.android.app.healthdata:n1', sourcePackage: 'com.samsung.android.app.healthdata', clientRecordId: null, startTime: '2026-10-12T08:00:00.000Z', endTime: '2026-10-12T08:10:00.000Z', name: 'Reggeli', mealType: 'breakfast', energyKcal: 420, proteinGrams: 24, carbohydrateGrams: 48, fatGrams: 14, volumeMilliliters: null },
    { type: 'hydration', externalId: 'healthconnect:com.samsung.android.app.healthdata:h1', sourcePackage: 'com.samsung.android.app.healthdata', clientRecordId: null, startTime: '2026-10-12T09:00:00.000Z', endTime: '2026-10-12T09:00:00.000Z', name: null, mealType: null, energyKcal: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, volumeMilliliters: 250 },
  ],
}

test('a verziózott Health Connect exportot beolvassa', () => {
  const parsed = parseHealthBridgeExport(JSON.stringify(payload))
  assert.equal(parsed.records.length, 2)
  assert.equal(parsed.generatedAt, payload.generatedAt)
})

test('a táplálkozási és folyadék rekordból napló-pillanatképet készít', () => {
  const preview = prepareHealthBridgeImport(payload, { profileId })
  const entries = healthImportEntries(preview)
  assert.deepEqual(preview.counts, { ready: 2, duplicate: 0, invalid: 0 })
  assert.equal(entries[0].snapshot.nutrients.energyKcal, 420)
  assert.equal(entries[0].mealType, 'breakfast')
  assert.equal(entries[1].snapshot.name, 'Víz')
  assert.equal(entries[1].amount, 250)
  assert.equal(entries[1].unit, 'ml')
})

test('externalKey alapján a korábban és a fájlon belül ismétlődő rekordot kihagyja', () => {
  const repeated = { ...payload, records: [payload.records[0], payload.records[0], payload.records[1]] }
  const preview = prepareHealthBridgeImport(repeated, { profileId, existingEntries: [{ externalKey: payload.records[1].externalId }] })
  assert.deepEqual(preview.counts, { ready: 1, duplicate: 2, invalid: 0 })
  assert.equal(healthImportEntries(preview).length, 1)
})

test('a hibás rekord az előnézetben marad, de nem importálható', () => {
  const invalid = { ...payload, records: [{ ...payload.records[0], energyKcal: -1 }] }
  const preview = prepareHealthBridgeImport(invalid, { profileId })
  assert.equal(preview.counts.invalid, 1)
  assert.match(preview.records[0].error, /negatív/)
  assert.equal(healthImportEntries(preview).length, 0)
})

test('ismeretlen verziót és producert elutasít', () => {
  assert.throws(() => parseHealthBridgeExport({ ...payload, schemaVersion: 2 }), /verzió/)
  assert.throws(() => parseHealthBridgeExport({ ...payload, producer: 'other' }), /nem a Grapes/)
})

test('csak a kiválasztott előnézeti rekordokat adja át importálásra', () => {
  const preview = prepareHealthBridgeImport(payload, { profileId })
  const entries = healthImportEntries(preview, [1])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].externalKey, payload.records[1].externalId)
})
