import test from 'node:test'
import assert from 'node:assert/strict'
import { previewHealthMigration } from '../src/sync/grapes-health-migration-preview.js'

const entry = (recordId, payload, kind = 'food_diary') =>
  ({ profileId: 'profile-a', kind, recordId, schemaVersion: 1, payload })
const source = records => ({ provider: 'google-drive', sourceId: 'drive-file-a',
  version: 'v1', profileId: 'profile-a', records })
test('preview preserves source bytes and separate equal-looking diary entries', () => {
  const records = [entry('one', { amount: 100 }), entry('two', { amount: 100 })]
  const inventory = source(records)
  const before = JSON.stringify(inventory)
  const result = previewHealthMigration({ sources: [inventory] })
  assert.equal(result.canImport, true)
  assert.equal(result.plan.length, 2)
  assert.equal(JSON.stringify(inventory), before)
  assert.deepEqual(result.plan.map(item => item.recordId), ['one', 'two'])
})
test('preview rejects E-book and cross-profile records without reading or writing them', () => {
  const result = previewHealthMigration({ sources: [source([
    entry('book', { name: 'private' }, 'ebook'),
    { ...entry('wrong', {}), profileId: 'profile-b' }
  ])] })
  assert.equal(result.canImport, false)
  assert.equal(result.plan.length, 0)
  assert.equal(result.invalid.length, 2)
})
test('preview distinguishes a duplicate source record from conflicting provenance', () => {
  const same = entry('yazio-id', { externalKey: 'yazio:old-key', amount: 100 }, 'yazio_import')
  const inventory = source([same, structuredClone(same)])
  const duplicate = previewHealthMigration({ sources: [inventory] })
  assert.equal(duplicate.duplicates.length, 1)
  assert.equal(duplicate.conflicts.length, 0)
  const changed = previewHealthMigration({ sources: [inventory, {
    ...source([entry('yazio-id', { externalKey: 'yazio:old-key', amount: 120 }, 'yazio_import')]),
    sourceId: 'drive-file-b'
  }] })
  assert.equal(changed.canImport, false)
  assert.equal(changed.conflicts.length, 1)
  assert.equal(changed.plan[0].payload.externalKey, 'yazio:old-key')
})
test('existing target revision blocks initial import', () => {
  const result = previewHealthMigration({ sources: [source([entry('one', {})])],
    targetHeads: [{ profileId: 'profile-a', kind: 'food_diary', recordId: 'one', revision: 3 }] })
  assert.equal(result.canImport, false)
  assert.equal(result.conflicts[0].targetRevision, 3)
})

test('equal bytes from distinct providers are not silently collapsed', () => {
  const record = entry('same-id', { amount: 100 })
  const result = previewHealthMigration({ sources: [source([record]),
    { ...source([structuredClone(record)]), provider: 'indexeddb' }] })
  assert.equal(result.canImport, false)
  assert.equal(result.conflicts.length, 1)
})

test('preview preserves original Health Connect identity, time and source payload', () => {
  const original = { externalKey: 'healthconnect:package:record-7',
    sourceRecordId: 'record-7', measuredAt: '2026-10-20T12:30:00Z',
    original: { packageName: 'com.synthetic.health', calories: null } }
  const result = previewHealthMigration({ sources: [source([entry('record-7', original, 'health_record')])] })
  assert.equal(result.canImport, true)
  assert.deepEqual(result.plan[0].payload, original)
})
