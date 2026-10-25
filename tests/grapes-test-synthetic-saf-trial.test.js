import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesTestSyntheticSafTrial, createSyntheticSafFixture } from '../src/sync/grapes-test-synthetic-saf-trial.js'
import {
  prepareUnclaimedLegacyBackup, verifyUnclaimedLegacyBackup,
} from '../src/sync/grapes-test-legacy-unclaimed-backup.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const instant = '2026-10-25T13:00:00.000Z'

test('no user storage is queried and native independent receipt proves synthetic file only', async () => {
  const calls = []
  const store = createGrapesTestSyntheticSafTrial({
    enabled: true, isAndroid: () => true, authEnabled: async () => true,
    getSubject: async () => A, now: () => instant,
    save: async prepared => {
      calls.push(prepared)
      assert.match(prepared.filename, /^grapes-helyi-teszt-/)
      assert.equal(JSON.parse(prepared.json).ownership, 'unclaimed')
      assert.equal(JSON.parse(prepared.json).sources.length, 4)
      assert.ok(JSON.parse(prepared.json).sources.every(x =>
        !x.raw.includes(A) && !x.raw.includes('real-private')))
      return { bytes: prepared.bytes, sha256: prepared.sha256 }
    },
  })
  const result = await store.run()
  assert.equal(calls.length, 1)
  assert.deepEqual(result, {
    status: 'PASS', sources: 4, bytes: calls[0].bytes,
    sha256: calls[0].sha256, ownership: 'unclaimed',
    migrationAuthorized: false, syntheticOnly: true,
    filename: 'grapes-helyi-teszt-2026-10-25.json',
  })
  assert.ok(createSyntheticSafFixture().sources.every(x =>
    !x.raw.includes('real-private')))
})

test('cancelled, short, forged and malformed native receipts cannot produce PASS', async () => {
  const cases = [
    async () => { throw new Error('Android fájlválasztó bezárva') },
    async p => ({ bytes: p.bytes - 1, sha256: p.sha256 }),
    async p => ({ bytes: p.bytes, sha256: '0'.repeat(64) }),
    async () => null,
  ]
  for (const save of cases) {
    const trial = createGrapesTestSyntheticSafTrial({
      enabled: true, isAndroid: () => true,
      authEnabled: async () => true, getSubject: async () => A,
      save, now: () => instant,
    })
    await assert.rejects(trial.run())
  }
})

test('changed TEST user or lost auth after file save never produces PASS', async () => {
  let current = A
  const switched = createGrapesTestSyntheticSafTrial({
    enabled: true, isAndroid: () => true,
    authEnabled: async () => true, getSubject: async () => current,
    save: async p => {
      current = B
      return { bytes: p.bytes, sha256: p.sha256 }
    },
    now: () => instant,
  })
  await assert.rejects(switched.run(), /megváltozott/)
  const lostAuth = createGrapesTestSyntheticSafTrial({
    enabled: true, isAndroid: () => true,
    authEnabled: async () => false, getSubject: async () => A,
    save: async () => { throw Error('must never be called') }, now: () => instant,
  })
  await assert.rejects(lostAuth.run(), /nincs engedélyezve/)
})

test('proof remains unclaimed and forbids migration regardless of matching hash', async () => {
  const fixture = createSyntheticSafFixture()
  const prepared = await prepareUnclaimedLegacyBackup(fixture, { exportedAt: instant })
  const verified = await verifyUnclaimedLegacyBackup(prepared,
    { bytes: prepared.bytes, sha256: prepared.sha256 }, createSyntheticSafFixture())
  assert.equal(verified.verified, true)
  assert.equal(verified.migrationAuthorized, false)
})
