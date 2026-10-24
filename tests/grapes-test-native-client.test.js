import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesTestNativeClient } from '../src/sync/grapes-test-native-client.js'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'

test('native TEST client exposes only verified identity and allowlisted RPCs', async () => {
  const calls = []
  const client = createGrapesTestNativeClient({ subject: A, request: async (...args) => {
    calls.push(args)
    return args[0] === 'supabaseTestWhoAmI' ? A : '{"status":"committed","revision":1}'
  } })
  assert.equal((await client.auth.getUser()).data.user.id, A)
  assert.deepEqual((await client.rpc('compare_and_swap', { p_record_id: 'synthetic' })).data,
    { status: 'committed', revision: 1 })
  assert.deepEqual(calls, [['supabaseTestWhoAmI'],
    ['supabaseTestRpc', 'compare_and_swap', { p_record_id: 'synthetic' }]])
  await assert.rejects(client.rpc('delete_user', {}), /Nem engedélyezett/)
  assert.equal(calls.length, 2)
})

test('native TEST client rejects a switched account before RPC', async () => {
  const client = createGrapesTestNativeClient({ subject: A,
    request: async method => method === 'supabaseTestWhoAmI' ? B : '{}' })
  await assert.rejects(client.auth.getUser(), /megváltozott/)
})
