// Runs only against the Supabase CLI stack started on this GitHub runner.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const cwd = process.env.GRAPES_SUPABASE_LOCAL_DIR
if (!cwd) throw new Error('GRAPES_SUPABASE_LOCAL_DIR is required')
const projectRoot = resolve(import.meta.dirname, '../../..')
const status = execFileSync('supabase', ['status', '-o', 'env'], { cwd, encoding: 'utf8' })
const settings = Object.fromEntries(status.split('\n').map(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (!match) return null
  return [match[1], match[2].replace(/^['"]|['"]$/g, '')]
}).filter(Boolean))
const apiUrl = settings.API_URL
const dbUrl = settings.DB_URL
const anonKey = settings.ANON_KEY
const serviceKey = settings.SERVICE_ROLE_KEY
if (![apiUrl, dbUrl, anonKey, serviceKey].every(Boolean)) throw new Error('Local Supabase status lacks required URLs or keys')
for (const url of [apiUrl, dbUrl]) {
  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error(`Refusing nonlocal endpoint: ${host}`)
}

function psql(args, input) {
  return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl, ...args],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
const sql = statement => psql(['-qAt', '-c', statement])
const uuid = value => { assert.match(value, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i); return value }

async function request(path, key, token, body, schema) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      ...(schema ? { 'Content-Profile': schema, 'Accept-Profile': schema } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

const runId = randomUUID().slice(0, 8)
const password = `Synthetic-${randomUUID()}-A1!`
async function createIdentity(label) {
  const email = `grapes-ci-${label}-${runId}@example.invalid`
  const created = await request('/auth/v1/admin/users', serviceKey, serviceKey,
    { email, password, email_confirm: true })
  assert.ok([200, 201].includes(created.status), `local Auth user creation ${label}: ${JSON.stringify(created)}`)
  const signedIn = await request('/auth/v1/token?grant_type=password', anonKey, anonKey,
    { email, password })
  assert.equal(signedIn.status, 200, `local Auth password sign-in ${label}: ${JSON.stringify(signedIn)}`)
  assert.ok(signedIn.data.access_token)
  const who = await request('/auth/v1/user', anonKey, signedIn.data.access_token)
  assert.equal(who.status, 200)
  assert.equal(who.data.id, created.data.id)
  return { id: uuid(created.data.id), token: signedIn.data.access_token }
}

const a = await createIdentity('a'), b = await createIdentity('b')
console.log('PASS: two separate synthetic identities signed in through local Supabase Auth')

psql(['-f', resolve(projectRoot, 'poc/supabase-sync/schema-proposal.sql')])
console.log('PASS: proposed schema applied to ephemeral local Supabase PostgreSQL')
psql(['-v', `user_a=${a.id}`, '-v', `user_b=${b.id}`,
  '-f', resolve(projectRoot, 'poc/supabase-sync/security-tests.sql')])
console.log('PASS: all proposed SQL security assertions')

sql(`insert into grapes_private.profiles(user_id, profile_id) values ('${a.id}', 'ci-a'), ('${b.id}', 'ci-b')`)
const rpc = (token, args, key = anonKey) => request('/rest/v1/rpc/compare_and_swap', key, token, args, 'api')
const write = (profile, record, op, expected, value) => ({
  p_profile_id: profile, p_kind: 'food', p_record_id: record,
  p_operation_id: op, p_expected_revision: expected,
  p_schema_version: 1, p_candidate: { value },
})
const actualOp = randomUUID()
const actual = await rpc(a.token, write('ci-a', 'real-auth', actualOp, 0, 'A'))
assert.equal(actual.status, 200, JSON.stringify(actual))
assert.equal(actual.data.status, 'committed')
const replay = await rpc(a.token, write('ci-a', 'real-auth', actualOp, 0, 'A'))
assert.deepEqual(replay, actual)
const staleOp = randomUUID()
const stale = await rpc(a.token, write('ci-a', 'real-auth', staleOp, 0, 'stale'))
assert.equal(stale.status, 200, JSON.stringify(stale))
assert.equal(stale.data.status, 'conflict')
const recovered = await request('/rest/v1/rpc/read_attempt', anonKey, a.token,
  { p_operation_id: staleOp }, 'api')
assert.equal(recovered.status, 200, JSON.stringify(recovered))
assert.deepEqual(recovered.data.candidate, { value: 'stale' })
const foreignRecovery = await request('/rest/v1/rpc/read_attempt', anonKey, b.token,
  { p_operation_id: staleOp }, 'api')
assert.equal(foreignRecovery.status, 200, JSON.stringify(foreignRecovery))
assert.equal(foreignRecovery.data, null)
const denied = await rpc(b.token, write('ci-a', 'real-auth', randomUUID(), 1, 'B'))
assert.ok([401, 403].includes(denied.status), `cross-user write was not denied: ${JSON.stringify(denied)}`)
const anonymous = await rpc(null, write('ci-a', 'real-auth', randomUUID(), 1, 'anon'))
assert.ok([401, 403].includes(anonymous.status), `anonymous write was not denied: ${JSON.stringify(anonymous)}`)
const own = await rpc(b.token, write('ci-b', 'real-auth', randomUUID(), 0, 'B'))
assert.equal(own.status, 200, JSON.stringify(own))
assert.equal(own.data.status, 'committed')
const privateSchema = await request('/rest/v1/documents?select=*', anonKey, a.token, undefined, 'grapes_private')
assert.ok([400, 404, 406].includes(privateSchema.status), `private schema was exposed: ${JSON.stringify(privateSchema)}`)
console.log('PASS: real local JWTs enforce A/B isolation, anonymous denial, retries and recovery reads')

const grants = sql(`select
  has_function_privilege('authenticated', 'api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb)', 'EXECUTE'),
  has_function_privilege('anon', 'api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb)', 'EXECUTE'),
  has_schema_privilege('anon', 'grapes_private', 'USAGE'),
  (select prosecdef from pg_proc where oid='api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb)'::regprocedure),
  (select prosecdef from pg_proc where oid='grapes_private.compare_and_swap_internal(text,text,text,uuid,bigint,integer,jsonb)'::regprocedure)`)
assert.equal(grants, 't|f|f|f|t', `unexpected function/schema privilege state: ${grants}`)
console.log('PASS: exposed invoker, private definer and explicit function/schema grants')

// Two live psql processes hold separate database connections. A keeps its
// transaction open after writing; B must wait on the advisory transaction lock.
function session() {
  const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl],
    { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { errors += chunk })
  const waitFor = async marker => {
    for (let i = 0; i < 100; i++) {
      if (output.includes(marker)) return
      if (child.exitCode !== null) throw new Error(`psql exited before ${marker}: ${errors}`)
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    throw new Error(`psql timed out before ${marker}: ${errors}`)
  }
  return { child, waitFor, output: () => output, errors: () => errors }
}
const first = session(), second = session()
const opA = randomUUID(), opB = randomUUID()
const setup = user => `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`
first.child.stdin.write(`${setup(a.id)} select 'FIRST:' || (api.compare_and_swap('ci-a','food','race','${opA}',0,1,'{"value":"first"}'::jsonb)->>'status');\n`)
await first.waitFor('FIRST:committed')
second.child.stdin.write(`${setup(a.id)} select 'SECOND:' || (api.compare_and_swap('ci-a','food','race','${opB}',0,1,'{"value":"second"}'::jsonb)->>'status');\n`)
await new Promise(resolveWait => setTimeout(resolveWait, 400))
assert.ok(!second.output().includes('SECOND:'), 'second connection did not block on first uncommitted write')
first.child.stdin.write(`commit; select 'FIRST_DONE';\n`)
await first.waitFor('FIRST_DONE')
await second.waitFor('SECOND:conflict')
second.child.stdin.write(`commit; select 'SECOND_DONE';\n`)
await second.waitFor('SECOND_DONE')
first.child.stdin.end(); second.child.stdin.end()
assert.equal(sql(`select revision from grapes_private.documents where user_id='${a.id}' and profile_id='ci-a' and record_id='race'`), '1')
assert.equal(sql(`select count(*) from grapes_private.revisions where user_id='${a.id}' and profile_id='ci-a' and record_id='race'`), '1')
assert.equal(sql(`select count(*) from grapes_private.attempts where user_id='${a.id}' and profile_id='ci-a' and record_id='race' and outcome='conflict'`), '1')
console.log('PASS: two independent database connections serialize CAS; stale candidate remains recoverable')
