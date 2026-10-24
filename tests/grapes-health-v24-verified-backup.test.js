import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareV24HealthBackup, assertVerifiedV24HealthBackup } from '../src/sync/grapes-health-v24-verified-backup.js'

async function version(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return 'sha256:' + [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
}
async function fixture() {
  const document = { id: 'food-tracker-synthetic', module: 'Ételnapló',
    data: { profile: { id: 'synthetic' }, diaryEntries: [{
      id: 'entry-1', note: 'synthetic private note' }] } }
  const raw = '{"2026-10-20":{"entries":[{"id":"water-1"}]}}'
  const foodVersion = await version(JSON.stringify(document))
  const waterVersion = await version(raw)
  return { inventories: [
    { source: { provider: 'indexeddb', sourceId: document.id,
      ownerId: null, version: foodVersion } },
    { source: { provider: 'localStorage', sourceId: 'grapes-water-v1',
      ownerId: null, version: waterVersion } }
  ], snapshots: [
    { provider: 'indexeddb', sourceId: document.id, version: foodVersion, document },
    { provider: 'localStorage', sourceId: 'grapes-water-v1', version: waterVersion, raw }
  ] }
}

test('backup keeps both raw source snapshots and requires matching native readback', async () => {
  const capture = await fixture()
  const before = JSON.stringify(capture)
  const prepared = await prepareV24HealthBackup(capture, {
    exportedAt: '2026-10-24T12:00:00Z'
  })
  assert.equal(prepared.filename, 'grapes-health-attekintes-2026-10-24.json')
  assert.equal(JSON.parse(prepared.json).ownership, 'unclaimed')
  assert.deepEqual(JSON.parse(prepared.json).sources, capture.snapshots)
  assert.equal(JSON.stringify(capture), before)
  assert.equal(assertVerifiedV24HealthBackup(prepared,
    { bytes: prepared.bytes, sha256: prepared.sha256 }, capture).verified, true)
})

test('interrupted, short or altered file cannot report a verified backup', async () => {
  const capture = await fixture()
  const prepared = await prepareV24HealthBackup(capture)
  assert.throws(() => assertVerifiedV24HealthBackup(prepared, null, capture), /verified/)
  assert.throws(() => assertVerifiedV24HealthBackup(prepared,
    { bytes: prepared.bytes - 1, sha256: prepared.sha256 }, capture), /verified/)
  assert.throws(() => assertVerifiedV24HealthBackup(prepared,
    { bytes: prepared.bytes, sha256: '0'.repeat(64) }, capture), /verified/)
})

test('changed local source after export blocks later claim', async () => {
  const capture = await fixture()
  const prepared = await prepareV24HealthBackup(capture)
  const newer = structuredClone(capture)
  newer.inventories[1].source.version = 'sha256:' + 'f'.repeat(64)
  newer.snapshots[1].version = 'sha256:' + 'f'.repeat(64)
  assert.throws(() => assertVerifiedV24HealthBackup(prepared,
    { bytes: prepared.bytes, sha256: prepared.sha256 }, newer), /changed/)
})

test('foreign owner and tampered raw snapshot are rejected before export', async () => {
  const owned = await fixture()
  owned.inventories[0].source.ownerId = 'another-user'
  await assert.rejects(prepareV24HealthBackup(owned), /mismatch/)
  const tampered = await fixture()
  tampered.snapshots[1].raw += ' '
  await assert.rejects(prepareV24HealthBackup(tampered), /changed/)
})
