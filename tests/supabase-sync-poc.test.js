import test from 'node:test'
import assert from 'node:assert/strict'
import { MemorySyncServer, MemoryOutbox, retryOutbox } from '../poc/supabase-sync/reference-model.js'

const user = 'synthetic-user-a', other = 'synthetic-user-b', profileId = 'legacy-google-id'
const write = (operationId, expectedRevision, payload, userId = user) => ({ userId, profileId, kind: 'food', recordId: 'entry-1', operationId, expectedRevision, payload })
const serverWithProfiles = () => { const server = new MemorySyncServer(); server.addProfile(user, profileId); server.addProfile(other, 'other-profile'); return server }

test('two clients racing at one revision yield one head and a recoverable loser', async () => {
  const server = serverWithProfiles()
  const [a, b] = await Promise.all([server.write(write('op-a', 0, { meal: 'A' })), server.write(write('op-b', 0, { meal: 'B' }))])
  assert.deepEqual([a.status, b.status].sort(), ['committed', 'conflict'])
  assert.equal(server.history({ userId: user, profileId, kind: 'food', recordId: 'entry-1' }).length, 1)
  const loser = a.status === 'conflict' ? 'op-a' : 'op-b'
  assert.deepEqual(server.conflict({ userId: user, operationId: loser }).payload, loser === 'op-a' ? { meal: 'A' } : { meal: 'B' })
})

test('stale revision is rejected; rollback is a new compared revision', async () => {
  const server = serverWithProfiles()
  assert.equal((await server.write(write('first', 0, { meal: 'old' }))).revision, 1)
  assert.equal((await server.write(write('second', 1, { meal: 'new' }))).revision, 2)
  assert.equal((await server.write(write('stale', 1, { meal: 'stale' }))).status, 'conflict')
  assert.deepEqual(server.read({ userId: user, profileId, kind: 'food', recordId: 'entry-1' }).payload, { meal: 'new' })
  assert.equal((await server.write(write('rollback', 2, { meal: 'old' }))).revision, 3)
  assert.deepEqual(server.history({ userId: user, profileId, kind: 'food', recordId: 'entry-1' }).map(x => x.payload.meal), ['old', 'new', 'old'])
})

test('foreign user cannot read, write, inspect history or conflict', async () => {
  const server = serverWithProfiles()
  await server.write(write('first', 0, { private: true }))
  for (const operation of [
    () => server.read({ userId: other, profileId, kind: 'food', recordId: 'entry-1' }),
    () => server.history({ userId: other, profileId, kind: 'food', recordId: 'entry-1' }),
    () => server.write(write('foreign', 1, { private: false }, other)),
  ]) await assert.rejects(async () => operation(), { code: 'FORBIDDEN' })
  assert.equal(server.conflict({ userId: other, operationId: 'first' }), null)
})

test('offline outbox retries the same operation after an unknown response', async () => {
  const server = serverWithProfiles(), outbox = new MemoryOutbox()
  const item = write('offline-op', 0, { externalKey: 'healthconnect:synthetic:1' })
  outbox.put(item)
  await assert.rejects(server.write(item, { loseResponse: true }), { code: 'UNKNOWN_RESULT' })
  assert.equal(outbox.list().length, 1)
  assert.deepEqual(await retryOutbox(outbox, server), [{ status: 'committed', revision: 1 }])
  assert.equal(outbox.list().length, 0)
  assert.equal(server.history({ userId: user, profileId, kind: 'food', recordId: 'entry-1' }).length, 1)
})

test('aborted write never reports success and retains the queued edit', async () => {
  const server = serverWithProfiles(), outbox = new MemoryOutbox(), item = write('abort-op', 0, { meal: 'offline' })
  outbox.put(item)
  await assert.rejects(server.write(item, { failBeforeCommit: true }), /aborted/)
  assert.equal(server.read({ userId: user, profileId, kind: 'food', recordId: 'entry-1' }), null)
  assert.equal(outbox.list().length, 1)
  assert.deepEqual(await retryOutbox(outbox, server), [{ status: 'committed', revision: 1 }])
  await assert.rejects(server.write({ ...item, payload: { meal: 'different' } }), { code: 'OPERATION_MISMATCH' })
})
