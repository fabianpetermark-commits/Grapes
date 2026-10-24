import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesTestOnePhoneIsolationProbe } from '../src/sync/grapes-test-one-phone-isolation.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const OP = '00000000-0000-4000-8000-000000000004'
const P = 'grapes:00000000-0000-4000-8000-000000000003'
const key = 'grapes-test-synthetic-food-trial-v1:' + A
const pointer = { version: 1, userId: A, profileId: P, operationId: OP, recordId: 'qa-food-' + OP }

function fixture({ denial = true, leak = false, corrupt = false, offline = false,
  foreignInList = false, noPointer = false } = {}) {
  const entries = noPointer ? [] : [[key, corrupt ? '{invalid' : JSON.stringify(pointer)]]
  const storage = {
    get length() { return entries.length },
    key(index) { return entries[index]?.[0] ?? null },
    getItem(name) { return entries.find(row => row[0] === name)?.[1] ?? null },
  }
  const calls = []
  const foundation = {
    subject: B,
    gateway: {
      async listProfiles() {
        calls.push('own-list')
        return foreignInList ? [{ profileId: P }] : []
      },
      async readAttempt(op) {
        assert.equal(op, OP)
        calls.push('foreign-attempt')
        return leak ? { candidate: { syntheticQA: true } } : null
      },
    },
  }
  const request = async (method, rpc, args) => {
    calls.push(rpc)
    assert.equal(method, 'supabaseTestRpc')
    assert.equal(args.p_profile_id, P)
    if (offline) throw new Error('Network timeout')
    if (denial) throw new Error('A TEST-adatművelet nem sikerült. HTTP 403')
    return '{}'
  }
  const probe = createGrapesTestOnePhoneIsolationProbe({
    enabled: true, storage, openFoundation: async () => foundation, request,
  })
  return { probe, calls, storage }
}

test('gate defaults OFF and performs no native calls', async () => {
  await assert.rejects(createGrapesTestOnePhoneIsolationProbe({
    openFoundation: async () => { throw new Error('Must not run') },
  }).verify(), /ki van kapcsolva/)
})

test('B cannot list, recover, read or read history of the earlier synthetic A record', async () => {
  const f = fixture()
  const result = await f.probe.verify()
  assert.equal(result.phase, 'read-only-isolation-verified')
  assert.equal(result.checks.length, 4)
  assert.deepEqual(f.calls,
    ['own-list', 'foreign-attempt', 'read_document', 'read_revision', 'own-list'])
})

test('generic timeout or offline failure is not accepted as authorization proof', async () => {
  const f = fixture({ offline: true })
  await assert.rejects(f.probe.verify(), /nem bizonyított/)
})

test('a successful foreign read fails closed', async () => {
  const f = fixture({ denial: false })
  await assert.rejects(f.probe.verify(), /lekérése engedélyezett/)
})

test('foreign profiles or attempts leaked to B fail closed', async () => {
  await assert.rejects(fixture({ foreignInList: true }).probe.verify(), /megjelent/)
  await assert.rejects(fixture({ leak: true }).probe.verify(), /olvasható/)
})

test('missing, corrupt or ambiguous foreign pointers fail closed', async () => {
  await assert.rejects(fixture({ noPointer: true }).probe.verify(), /Pontosan egy/)
  await assert.rejects(fixture({ corrupt: true }).probe.verify(), /Sérült/)
  const f = fixture()
  const badStorage = { length: 2, key: i => i === 0 ? key : key + '-extra',
    getItem: () => JSON.stringify(pointer) }
  await assert.rejects(createGrapesTestOnePhoneIsolationProbe({
    enabled: true, storage: badStorage,
    openFoundation: async () => ({ subject: B, gateway: { listProfiles() {}, readAttempt() {} } }),
    request: async () => {},
  }).verify(), /Sérült/)
})
