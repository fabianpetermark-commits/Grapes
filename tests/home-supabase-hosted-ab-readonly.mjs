import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createHomeTestReadOnlyGate, HOME_SUPABASE_TEST_REF } from '../src/home/home-supabase-test-readonly.js'

/**
 * Live TEST-only A/B READ PROOF.
 * A and B must be existing, distinct, manually approved Grapes QA accounts.
 * No account creation, household modification, invites, RPC CAS, or PROD access.
 * Auth sign-in/sign-out do create/revoke Supabase TEST sessions.
 * Credentials are read from GitHub Actions secrets and NEVER logged.
 */
const url = 'https://' + HOME_SUPABASE_TEST_REF + '.supabase.co'
const key = process.env.GRAPES_TEST_SUPABASE_PUBLISHABLE_KEY
const credentials = [
  [process.env.GRAPES_TEST_QA_A_EMAIL, process.env.GRAPES_TEST_QA_A_PASSWORD],
  [process.env.GRAPES_TEST_QA_B_EMAIL, process.env.GRAPES_TEST_QA_B_PASSWORD],
]
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '') ||
    credentials.some(([email, pass]) => !email || !pass)) {
  throw new Error('Két meglévő TEST QA-fiók biztonságosan megadott GitHub Secret hitelesítése és publishable kulcs szükséges.')
}
const connect = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'X-Grapes-QA-Read-Only': 'true' } },
})
const clients = [connect(), connect()]
try {
  const identities = []
  for (let i = 0; i < 2; i++) {
    const [email, password] = credentials[i]
    const result = await clients[i].auth.signInWithPassword({email, password})
    assert.ifError(result.error)
    assert.ok(result.data?.user?.id, 'TEST QA Auth did not return authenticated user')
    identities.push(result.data.user.id)
  }
  assert.notEqual(identities[0], identities[1], 'A and B must be different QA accounts')
  const gates = clients.map((client, i) => createHomeTestReadOnlyGate({
    client, expectedUserId: identities[i], projectRef:HOME_SUPABASE_TEST_REF,
    testGateEnabled:true,
  }))
  const [a,b] = await Promise.all(gates.map(gate => gate.list()))
  assert.ok(a.length>0 && b.length>0,'Both TEST accounts must belong to a Home')
  const as = new Map(a.map(x => [x.householdId, x]))
  const bs = new Map(b.map(x => [x.householdId, x]))
  const shared = [...as.keys()].filter(id => bs.has(id))
  assert.ok(shared.length > 0, 'A and B must share at least one invited Home')
  for (const id of shared) {
    const [fromA,fromB] = await Promise.all(gates.map(gate => gate.read(id)))
    assert.equal(fromA.householdId,fromB.householdId)
    assert.equal(fromA.revision,fromB.revision)
    assert.deepEqual(fromA.inventory,fromB.inventory,'Shared inventory must read back identically')
    assert.deepEqual(fromA.shopping,fromB.shopping,'Shared shopping must read back identically')
    assert.equal(fromA.role,as.get(id).role)
    assert.equal(fromB.role,bs.get(id).role)
  }
  const aOnly=[...as.keys()].filter(id=>!bs.has(id))
  const bOnly=[...bs.keys()].filter(id=>!as.has(id))
  assert.ok(aOnly.length+bOnly.length>0,
    'TEST fixture must include a household NOT shared across A/B to prove privacy')
  for(const id of aOnly){
    await gates[0].read(id)
    await assert.rejects(gates[1].read(id),'B must not read A-only Home')
  }
  for(const id of bOnly){
    await gates[1].read(id)
    await assert.rejects(gates[0].read(id),'A must not read B-only Home')
  }
  console.log('PASS: authenticated TEST A/B independent users, shared Home identical reads, private Home denied, matched roles/revisions; no Home writes.')
} finally {
  // Do not preserve QA access or expose sessions after the smoke test.
  await Promise.allSettled(clients.map(client => client.auth.signOut({scope:'local'})))
}
