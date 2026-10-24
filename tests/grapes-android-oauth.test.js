import test from 'node:test'
import assert from 'node:assert/strict'
import { createAndroidTestOAuth, validateTestAuthorizeUrl } from '../src/auth/grapes-android-oauth.js'
import { makeGrapesTestAuthConfig } from '../src/auth/grapes-test-runtime.js'

const project = 'https://aighqtqjlzirlokxwupt.supabase.co'
const state = 'a'.repeat(64)
const redirect = 'hu.grapes.healthconnect.test://auth/callback?state=' + state
const authorize = () => project + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirect)

function harness() {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  const events = new EventTarget()
  const calls = []
  let response = { status: 'none' }
  const bridge = { postMessage(raw) {
    const message = JSON.parse(raw)
    calls.push(message)
    queueMicrotask(() => events.dispatchEvent(new CustomEvent('grapes:android-result', {
      detail: { requestId: message.requestId, ok: true, payload: JSON.stringify(response) },
    })))
  } }
  const adapter = createAndroidTestOAuth({ bridge, events, storage, now: () => 1000 })
  const exchanges = []
  const client = { auth: {
    async signInWithOAuth({ provider, options }) {
      assert.equal(provider, 'google')
      assert.equal(options.skipBrowserRedirect, true)
      assert.equal(options.scopes, undefined)
      return { data: { url: project + '/auth/v1/authorize?provider=google&redirect_to=' +
        encodeURIComponent(options.redirectTo) }, error: null }
    },
    async exchangeCodeForSession(code) { exchanges.push(code); return { error: null } },
    async getUser() { return { data: { user: { id: 'synthetic-user' } } } },
    async getSession() { return { data: { session: { access_token: 'synthetic-jwt' } }, error: null } },
  } }
  const notices = []
  const users = []
  const ui = { setNotice: x => notices.push(x), setSession: x => users.push(x) }
  return { adapter, client, ui, calls, exchanges, notices, users, setResponse: x => { response = x }, values }
}

test('authorize URL is pinned to TEST project, Google and exact callback', () => {
  assert.equal(validateTestAuthorizeUrl(authorize(), state), true)
  for (const invalid of [
    authorize().replace('aighqtqjlzirlokxwupt', 'another-project'),
    authorize().replace('provider=google', 'provider=github'),
    authorize() + '&scopes=https://www.googleapis.com/auth/drive',
    authorize().replace('auth%2Fcallback', 'evil%2Fcallback'),
  ]) assert.equal(validateTestAuthorizeUrl(invalid, state), false)
})

test('external browser request and same-client one-time PKCE code exchange', async () => {
  const h = harness()
  await h.adapter.begin(h.client)
  assert.equal(h.calls[0].method, 'beginTestAuthOAuth')
  const pending = JSON.parse([...h.values.values()][0])
  h.setResponse({ status: 'code', state: pending.state, code: 'synthetic-auth-code' })
  await h.adapter.resume(h.client, h.ui)
  assert.deepEqual(h.exchanges, ['synthetic-auth-code'])
  assert.equal(h.users[0].id, 'synthetic-user')
  assert.equal(h.values.size, 0)
  await h.adapter.resume(h.client, h.ui)
  assert.deepEqual(h.exchanges, ['synthetic-auth-code'])
})

test('forged state, cancel, no return and expired local transaction never exchange', async () => {
  for (const returned of ['forged', 'cancel', 'none']) {
    const h = harness()
    await h.adapter.begin(h.client)
    h.setResponse({ status: returned === 'none' ? 'none' : returned,
      state: returned === 'forged' ? 'b'.repeat(64) : JSON.parse([...h.values.values()][0]).state,
      code: 'synthetic-auth-code' })
    await h.adapter.resume(h.client, h.ui)
    assert.equal(h.exchanges.length, 0)
    if (returned === 'none') assert.equal(h.values.size, 1)
  }
  const h = harness()
  await h.adapter.begin(h.client)
  const key = [...h.values.keys()][0]
  const saved = JSON.parse(h.values.get(key))
  h.values.set(key, JSON.stringify({ ...saved, started: -400000 }))
  h.setResponse({ status: 'code', state: saved.state, code: 'synthetic-auth-code' })
  await h.adapter.resume(h.client, h.ui)
  assert.equal(h.exchanges.length, 0)
})

test('sign-out handoff clears pending transaction without Drive calls', async () => {
  const h = harness()
  await h.adapter.begin(h.client)
  await h.adapter.cancel()
  assert.equal(h.values.size, 0)
  assert.equal(h.calls.at(-1).method, 'cancelTestAuthOAuth')
})

test('Android TEST runtime requires exact asset origin and public key', () => {
  const storage = { getItem() {}, setItem() {}, removeItem() {} }
  const nativeOAuth = { begin() {}, resume() {}, cancel() {} }
  const args = { url: project, publishableKey: 'sb_publishable_' + 'a'.repeat(20),
    sessionStorage: storage, nativeOAuth }
  assert.equal(makeGrapesTestAuthConfig({ ...args,
    location: 'https://grapes-test-auth.invalid/assets/login-auth-test.html' }).callbackUrl, null)
  assert.throws(() => makeGrapesTestAuthConfig({ ...args,
    location: 'https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html' }))
  assert.throws(() => makeGrapesTestAuthConfig({ ...args,
    location: 'https://grapes-test-auth.invalid/assets/login-auth-test.html?other=1' }))
  assert.throws(() => makeGrapesTestAuthConfig({ ...args,
    location: 'https://grapes-test-auth.invalid/assets/login-auth-test.html',
    publishableKey: 'sb_secret_bad' }))
})


test('QA navigation handoff obtains persisted logout decision without exposing OAuth tokens', async () => {
  const h = harness()
  h.setResponse({ logout: true })
  assert.deepEqual(await h.adapter.takeLaunchMode(), { logout: true })
  assert.equal(h.calls.at(-1).method, 'takeTestAuthLaunchMode')
  const userId = '123e4567-e89b-12d3-a456-426614174000'
  assert.throws(() => h.adapter.enterApp({ id: 'not-a-user-id' }), /azonosító/)
  h.adapter.enterApp({ id: userId })
  assert.equal(h.calls.at(-1).method, 'completeTestAuthLogin')
  assert.deepEqual(h.calls.at(-1).args, [userId])
  await h.adapter.finishSignOut()
  assert.equal(h.calls.at(-1).method, 'finishTestAuthSignOut')
})

test('TEST data handoff sends bearer only from isolated Auth adapter to native', async () => {
  const h = harness()
  const id = '123e4567-e89b-12d3-a456-426614174000'
  await h.adapter.authorizeSession(h.client, { id })
  assert.equal(h.calls.at(-1).method, 'authorizeTestSupabaseSession')
  assert.deepEqual(h.calls.at(-1).args, [id, 'synthetic-jwt'])
  assert.equal(h.values.size, 0, 'bearer must not enter adapter storage')
  await assert.rejects(h.adapter.authorizeSession({ auth: { async getSession() {
    return { data: { session: null }, error: null }
  } } }, { id }), /munkamenet/)
})

test('successful PKCE return invokes optional app-unlock callback only after getUser verification', async () => {
  const h = harness()
  const routed = []
  await h.adapter.begin(h.client)
  const pending = JSON.parse([...h.values.values()][0])
  h.setResponse({ status: 'code', state: pending.state, code: 'one-time-code' })
  await h.adapter.resume(h.client, h.ui, user => routed.push(user.id))
  assert.deepEqual(routed, ['synthetic-user'])
  assert.deepEqual(h.exchanges, ['one-time-code'])
})
