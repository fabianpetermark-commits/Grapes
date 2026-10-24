import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesTestDocumentGateway } from '../src/sync/grapes-supabase-test-gateway.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const PROFILE = 'grapes:00000000-0000-4000-8000-000000000003'
const OP1 = '00000000-0000-4000-8000-000000000004'
const OP2 = '00000000-0000-4000-8000-000000000005'
const input = (operationId, expectedRevision, candidate) => ({
  profileId: PROFILE, kind: 'food_diary', recordId: 'entry-1', operationId,
  expectedRevision, schemaVersion: 1, candidate,
})

function fakeServer() {
  let revision = 0
  let payload = null
  let failAfterCommit = false
  const attempts = new Map()
  const makeClient = id => ({
    current: id,
    auth: { async getUser() { return { data: { user: this.owner.current ? { id: this.owner.current } : null } } } },
    async rpc(name, args) {
      if (this.current !== A) return { error: { message: 'profile denied' }, status: 403 }
      if (name === 'read_document') return { data: revision ? {
        profileId: PROFILE, kind: 'food_diary', recordId: 'entry-1', revision, payload,
      } : null, status: 200 }
      if (name === 'read_attempt') {
        const attempt = attempts.get(args.p_operation_id)
        return { data: attempt ? {
          profileId: PROFILE, kind: 'food_diary', recordId: 'entry-1',
          status: attempt.result.status, candidate: attempt.candidate,
        } : null, status: 200 }
      }
      if (name !== 'compare_and_swap') throw new Error('unexpected RPC')
      const prior = attempts.get(args.p_operation_id)
      if (prior) return { data: prior.result, status: 200 }
      const result = args.p_expected_revision === revision
        ? { status: 'committed', revision: ++revision }
        : { status: 'conflict', revision, snapshotId: args.p_operation_id }
      if (result.status === 'committed') payload = args.p_candidate
      attempts.set(args.p_operation_id, { result, candidate: args.p_candidate })
      if (failAfterCommit) { failAfterCommit = false; throw new Error('response lost') }
      return { data: result, status: 200 }
    },
    loseResponseOnce() { failAfterCommit = true },
  })
  const a = makeClient(A), b = makeClient(B)
  a.auth.getUser = a.auth.getUser.bind({ owner: a })
  b.auth.getUser = b.auth.getUser.bind({ owner: b })
  return { a, b }
}

test('a lost response never reports success; the same operation ID resolves by retry', async () => {
  const { a } = fakeServer()
  const gateway = createGrapesTestDocumentGateway(a, A)
  a.loseResponseOnce()
  await assert.rejects(gateway.compareAndSwap(input(OP1, 0, { amount: 1 })), /nem ellenőrizhető/)
  assert.deepEqual(await gateway.compareAndSwap(input(OP1, 0, { amount: 1 })),
    { status: 'committed', revision: 1 })
  assert.equal((await gateway.read(PROFILE, 'food_diary', 'entry-1')).revision, 1)
})

test('a stale candidate remains available and does not overwrite the head', async () => {
  const { a } = fakeServer()
  const gateway = createGrapesTestDocumentGateway(a, A)
  await gateway.compareAndSwap(input(OP1, 0, { amount: 1 }))
  assert.deepEqual(await gateway.compareAndSwap(input(OP2, 0, { amount: 2 })),
    { status: 'conflict', revision: 1, snapshotId: OP2 })
  assert.deepEqual((await gateway.readAttempt(OP2)).candidate, { amount: 2 })
  assert.deepEqual((await gateway.read(PROFILE, 'food_diary', 'entry-1')).payload, { amount: 1 })
})

test('account switch and foreign profile fail closed', async () => {
  const { a, b } = fakeServer()
  const gateway = createGrapesTestDocumentGateway(a, A)
  a.current = B
  await assert.rejects(gateway.compareAndSwap(input(OP1, 0, { amount: 1 })), /megváltozott/)
  const foreign = createGrapesTestDocumentGateway(b, B)
  await assert.rejects(foreign.read(PROFILE, 'food_diary', 'entry-1'), /sikertelen/)
})

test('malformed CAS responses cannot be accepted as saved', async () => {
  const client = { auth: { async getUser() { return { data: { user: { id: A } } } } },
    async rpc() { return { data: { status: 'committed', revision: 0 }, status: 200 } } }
  await assert.rejects(createGrapesTestDocumentGateway(client, A)
    .compareAndSwap(input(OP1, 0, {})), /nem igazolható/)
})
