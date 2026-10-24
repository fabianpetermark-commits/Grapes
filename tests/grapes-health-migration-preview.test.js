import test from 'node:test'
import assert from 'node:assert/strict'
import { previewHealthMigrationForOwner as preview } from '../src/sync/grapes-health-migration-preview.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const record = (id, payload = {}) => ({
  profileId: 'profile-a', kind: 'food_diary', recordId: id, schemaVersion: 1, payload
})
const source = (records, overrides = {}) => ({
  ownerId: alice, profileId: 'profile-a', provider: 'indexeddb',
  sourceId: 'local-a', version: 'v1', records, ...overrides
})

test('preview keeps two separate diary identifiers and leaves source untouched', () => {
  const original = source([record('one', { amount: 100 }), record('two', { amount: 100 })])
  const before = JSON.stringify(original)
  const result = preview({ verifiedOwnerId: alice, sources: [original] })
  assert.equal(result.canImport, true)
  assert.deepEqual(result.plan.map(item => item.recordId), ['one', 'two'])
  assert.equal(JSON.stringify(original), before)
  result.plan[0].payload.amount = 200
  assert.equal(original.records[0].payload.amount, 100)
})

test('unowned legacy source requires explicit claim and makes no import plan', () => {
  const result = preview({ verifiedOwnerId: alice,
    sources: [source([record('one')], { ownerId: null })] })
  assert.equal(result.canImport, false)
  assert.equal(result.plan.length, 0)
  assert.equal(result.claimsRequired.length, 1)
})

test('a different signed-in user cannot preview the prior owner data', () => {
  const result = preview({ verifiedOwnerId: bob, sources: [source([record('one')])] })
  assert.equal(result.canImport, false)
  assert.equal(result.plan.length, 0)
  assert.equal(result.conflicts[0].reason, 'source belongs to another owner')
})

test('foreign target inventory fails closed', () => {
  assert.throws(() => preview({ verifiedOwnerId: alice, sources: [],
    targetHeads: [{ ...record('one'), ownerId: bob, revision: 1 }] }),
  /foreign target/)
})

test('same source/version bytes dedupe; distinct provenance and target heads conflict', () => {
  const r = record('yazio-key', { externalId: 'yazio:7', timestamp: '2026-10-20T12:00:00Z' })
  const duplicate = preview({ verifiedOwnerId: alice, sources: [source([r, structuredClone(r)])] })
  assert.equal(duplicate.duplicates.length, 1)
  assert.equal(duplicate.canImport, true)
  const changed = preview({ verifiedOwnerId: alice, sources: [
    source([r]), source([structuredClone(r)], { sourceId: 'drive-a', provider: 'google-drive' })
  ] })
  assert.equal(changed.canImport, false)
  assert.equal(changed.conflicts.length, 1)
  const target = preview({ verifiedOwnerId: alice, sources: [source([r])],
    targetHeads: [{ ...r, ownerId: alice, revision: 3 }] })
  assert.equal(target.canImport, false)
  assert.equal(target.conflicts[0].targetRevision, 3)
})

test('E-book and cross-profile records cannot enter a Health plan', () => {
  const result = preview({ verifiedOwnerId: alice, sources: [source([
    { ...record('book'), kind: 'ebook' },
    { ...record('other'), profileId: 'profile-b' }
  ])] })
  assert.equal(result.canImport, false)
  assert.equal(result.plan.length, 0)
  assert.equal(result.invalid.length, 2)
})

test('Health Connect source identity and null nutrients survive unchanged', () => {
  const payload = { externalId: 'hc:7', measuredAt: '2026-10-20T12:00:00Z',
    original: { packageName: 'synthetic.health', calories: null } }
  const result = preview({ verifiedOwnerId: alice, sources: [
    source([{ ...record('hc-7', payload), kind: 'health_record' }])
  ] })
  assert.equal(result.canImport, true)
  assert.deepEqual(result.plan[0].payload, payload)
})
