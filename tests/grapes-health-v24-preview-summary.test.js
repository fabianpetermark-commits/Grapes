import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeV24HealthInventory } from '../src/sync/grapes-health-v24-preview-summary.js'

test('TEST preview shows counts and blockers without leaking payloads or identifiers', () => {
  const result = summarizeV24HealthInventory({ inventories: [{
    source: { ownerId: null, sourceId: 'private-drive-file',
      records: [{ kind: 'food_diary', recordId: 'private-entry',
        payload: { email: 'private@example.invalid' } },
      { kind: 'yazio_import', recordId: 'private-yazio',
        payload: { sourcePayload: 'private export' } }] },
    unmapped: [{ field: 'waterGoal', date: '2026-10-20' },
      { field: 'unknownPrivateField', value: 'private value' }]
  }] })
  assert.equal(result.sources, 1)
  assert.equal(result.records, 2)
  assert.equal(result.ownerClaimRequired, true)
  assert.deepEqual(result.counts.map(item => item.count), [1, 1])
  assert.deepEqual(result.blockers.map(item => item.label),
    ['Víz napi cél', 'Egyéb, még nem leképezett adat'])
  assert.doesNotMatch(JSON.stringify(result), /private|2026-10-20/)
})

test('empty inventory is not treated as account ownership', () => {
  const result = summarizeV24HealthInventory({ inventories: [] })
  assert.equal(result.sources, 0)
  assert.equal(result.ownerClaimRequired, false)
})

test('owned and malformed input fails closed', () => {
  assert.throws(() => summarizeV24HealthInventory({ inventories: [{
    source: { ownerId: 'synthetic-user', records: [] }, unmapped: []
  }] }), /unowned/)
  assert.throws(() => summarizeV24HealthInventory({ inventories: [{
    source: { ownerId: null, records: [{ kind: 'ebook' }] }, unmapped: []
  }] }), /Unknown/)
})
