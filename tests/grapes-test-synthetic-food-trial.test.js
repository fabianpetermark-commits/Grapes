import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesTestSyntheticFoodTrial } from '../src/sync/grapes-test-synthetic-food-trial.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const P = 'grapes:00000000-0000-4000-8000-000000000003'
const OP = '00000000-0000-4000-8000-000000000004'
const candidate = { syntheticQA: true, fixture: 'grapes-test-food-one-entry-v1',
  label: 'Grapes TEST – mesterséges próbaétel', grams: 100, kcal: 123 }

function fixture() {
  const memory = new Map(), rows = new Map()
  let subject = A, created = 0, calls = 0, offline = false, tamper = false
  const storage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, value) },
  }
  const gateway = {
    async createProfile() { created++; return P },
    async read(profileId, kind, recordId) {
      return { profileId, kind, recordId, revision: 1, schemaVersion: 1,
        payload: tamper ? { kcal: 999 } : candidate }
    },
  }
  const outbox = {
    async enqueue(job) {
      const existing = rows.get(job.operationId)
      if (existing && JSON.stringify(existing.candidate) !== JSON.stringify(job.candidate)) throw Error('collision')
      if (!existing) rows.set(job.operationId, { ...job, userId: subject, candidate: job.candidate, status: 'pending' })
    },
    async list(profileId) {
      return [...rows.values()].filter(row => row.profileId === profileId && row.userId === subject)
    },
    async retry(profileId) {
      calls++
      if (offline) throw Error('offline')
      for (const row of rows.values()) if (row.profileId === profileId && row.status === 'pending') {
        row.status = 'committed'
        row.serverRevision = 1
      }
    },
  }
  const openFoundation = async () => ({ subject, gateway, outbox })
  function trial(enabled = true) {
    return createGrapesTestSyntheticFoodTrial({ enabled, storage, openFoundation, randomUUID: () => OP })
  }
  return { trial, rows, memory, setSubject: value => { subject = value },
    setOffline: value => { offline = value }, setTamper: value => { tamper = value },
    created: () => created, calls: () => calls }
}

test('QA flag defaults OFF; no account, storage or server side effects', async () => {
  const f = fixture()
  await assert.rejects(createGrapesTestSyntheticFoodTrial({ openFoundation: () => { throw Error('should not call') } }).prepare(), /ki van kapcsolva/)
  await assert.rejects(f.trial(false).save(), /ki van kapcsolva/)
  await assert.rejects(f.trial(false).readBack(), /ki van kapcsolva/)
  assert.equal(f.created(), 0)
})

test('prepares exactly one dedicated synthetic profile and durable candidate', async () => {
  const f = fixture()
  const first = await f.trial().prepare()
  assert.equal(first.status, 'pending')
  assert.equal((await f.trial().prepare()).operationId, first.operationId)
  assert.equal(f.created(), 1)
  assert.equal(f.rows.size, 1)
  assert.equal([...f.rows.values()][0].candidate.fixture, candidate.fixture)
  await assert.rejects(f.trial().readBack(), /még nincs igazolva/)
})

test('offline failure leaves candidate pending; retry and separate remote read verify it', async () => {
  const f = fixture()
  await f.trial().prepare()
  f.setOffline(true)
  await assert.rejects(f.trial().save(), /offline/)
  assert.equal([...f.rows.values()][0].status, 'pending')
  f.setOffline(false)
  assert.deepEqual(await f.trial().save(), { phase: 'saved', revision: 1, operationId: OP })
  assert.equal(f.created(), 1)
  assert.equal(f.calls(), 2)
  assert.deepEqual(await f.trial().readBack(), { phase: 'readback-verified', revision: 1, operationId: OP })
  f.setTamper(true)
  await assert.rejects(f.trial().readBack(), /eltér vagy hiányzik/)
})

test('switching native account never sends the previous account operation', async () => {
  const f = fixture()
  await f.trial().prepare()
  f.setSubject(B)
  await assert.rejects(f.trial().save(), /Előbb készítsd elő/)
  assert.equal(f.calls(), 0)
  assert.equal([...f.rows.values()][0].userId, A)
})

test('corrupt local pointer blocks duplicate profile creation', async () => {
  const f = fixture()
  await f.trial().prepare()
  f.memory.set('grapes-test-synthetic-food-trial-v1:' + A, '{broken-json')
  await assert.rejects(f.trial().prepare(), /azonosítója sérült/)
  assert.equal(f.created(), 1)
})
