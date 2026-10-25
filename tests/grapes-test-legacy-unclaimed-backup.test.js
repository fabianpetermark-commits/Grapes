import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareUnclaimedLegacyBackup, verifyUnclaimedLegacyBackup,
} from '../src/sync/grapes-test-legacy-unclaimed-backup.js'

const sample = () => ({
  ownership: 'unclaimed',
  sources: [
    { provider: 'indexeddb', sourceId: 'finance-tracker-current',
      raw: JSON.stringify({
        id: 'finance-tracker-current', module: 'Pénzügyi Napló',
        data: { transactions: [{ id: 'synthetic-1', note: 'Őrzött QA ☘' }],
          receipt: 'data:image/png;base64,SGVsbG8=' } }) },
    { provider: 'indexeddb', sourceId: 'food-conflict-synthetic',
      raw: JSON.stringify({ id: 'food-conflict-synthetic',
        originalId: 'food-tracker-local-food-profile', data: { qa: 'recovery' } }) },
    { provider: 'localStorage', sourceId: 'grapes-water-v1',
      raw: '{"2026-10-25":{"goal":2000,"entries":[{"id":"synthetic","amount":250,"at":"2026-10-25T07:00:00Z"}]}}' },
    { provider: 'localStorage', sourceId: 'grapes-ebook-reading-progress-v1',
      raw: '{"version":1,"books":{"synthetic-ebook":{"percent":47}}}' },
  ],
})

test('full raw data, orphan recovery, unicode and bytes survive an unclaimed envelope', async () => {
  const capture = sample()
  const before = JSON.stringify(capture)
  const ready = await prepareUnclaimedLegacyBackup(capture, { exportedAt: '2026-10-25T07:00:00Z' })
  const parsed = JSON.parse(ready.json)
  assert.equal(ready.filename, 'grapes-helyi-adatok-2026-10-25.json')
  assert.equal(parsed.ownership, 'unclaimed')
  assert.equal(parsed.grapesLocalMigrationBackup, true)
  assert.deepEqual(parsed.sources, capture.sources)
  assert.equal(parsed.manifest.length, 4)
  assert.equal(parsed.sources[0].raw.includes('Őrzött QA ☘'), true)
  assert.equal(JSON.stringify(capture), before)
  const gate = await verifyUnclaimedLegacyBackup(ready, {
    bytes: ready.bytes, sha256: ready.sha256,
  }, capture)
  assert.deepEqual(gate, {
    verified: true, ownership: 'unclaimed', sourceCount: 4,
    bytes: ready.bytes, sha256: ready.sha256, migrationAuthorized: false,
  })
})

test('an unknown, missing, short, altered or forged native receipt fails closed', async () => {
  const capture = sample()
  const prepared = await prepareUnclaimedLegacyBackup(capture)
  for (const receipt of [
    null, {}, { bytes: prepared.bytes - 1, sha256: prepared.sha256 },
    { bytes: prepared.bytes, sha256: '0'.repeat(64) },
  ]) {
    await assert.rejects(verifyUnclaimedLegacyBackup(prepared, receipt, capture), /visszaolvasása/)
  }
  const forged = { ...prepared, json: prepared.json.replace('Őrzött', 'Törölt') }
  await assert.rejects(
    verifyUnclaimedLegacyBackup(forged,
      { bytes: prepared.bytes, sha256: prepared.sha256 }, capture),
    /visszaolvasása/)
})

test('changed historical Water, Finance or E-book after export prevents completed backup', async () => {
  const initial = sample()
  const prepared = await prepareUnclaimedLegacyBackup(initial)
  for (const index of [0, 1, 2, 3]) {
    const changed = structuredClone(initial)
    changed.sources[index].raw += index < 2 ? ' ' : '\n'
    await assert.rejects(
      verifyUnclaimedLegacyBackup(prepared, {
        bytes: prepared.bytes, sha256: prepared.sha256,
      }, changed), /megváltoztak|mismatches/)
  }
})

test('refuse foreign owned, duplicate, missing, non-JSON and non-identical project identities', async () => {
  const source = sample()
  await assert.rejects(
    prepareUnclaimedLegacyBackup({ ...source, ownership: 'a-user' }),
    /tulajdonosa/)
  const duplicate = sample()
  duplicate.sources.push(structuredClone(duplicate.sources[0]))
  await assert.rejects(prepareUnclaimedLegacyBackup(duplicate), /Duplicate/)
  const missing = sample()
  missing.sources[0].sourceId = ''
  await assert.rejects(prepareUnclaimedLegacyBackup(missing), /Invalid/)
  const mismatch = sample()
  mismatch.sources[0].sourceId = 'another-project'
  await assert.rejects(prepareUnclaimedLegacyBackup(mismatch), /identity/)
  const invalid = sample()
  invalid.sources[0].raw = '{invalid JSON'
  await assert.rejects(prepareUnclaimedLegacyBackup(invalid), /JSON|token|position|Unexpected/)
})

test('refuse empty capture, duplicate keys or tampered hash manifest', async () => {
  await assert.rejects(prepareUnclaimedLegacyBackup({
    ownership: 'unclaimed', sources: [],
  }), /No legacy/)
  const capture = sample()
  const prepared = await prepareUnclaimedLegacyBackup(capture)
  const altered = { ...prepared, manifest: [...prepared.manifest].reverse() }
  await assert.rejects(verifyUnclaimedLegacyBackup(altered, {
    sha256: prepared.sha256, bytes: prepared.bytes,
  }, capture), /tartalma/)
})


test('saved backup raw bytes must independently match per-source manifest even with matching outer SHA', async () => {
  const capture = sample()
  const prepared = await prepareUnclaimedLegacyBackup(capture)
  const envelope = JSON.parse(prepared.json)
  envelope.sources[0].raw = envelope.sources[0].raw.replace('Őrzött', 'Módosított')
  const json = JSON.stringify(envelope)
  const hash = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(json)))
  const sha256 = [...hash].map(x => x.toString(16).padStart(2, '0')).join('')
  const forged = { ...prepared, json, sha256, bytes: new TextEncoder().encode(json).length }
  await assert.rejects(
    verifyUnclaimedLegacyBackup(forged, {
      bytes: forged.bytes, sha256: forged.sha256,
    }, capture), /mentett helyi források/)
})
