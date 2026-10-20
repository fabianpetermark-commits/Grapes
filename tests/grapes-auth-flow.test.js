import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrapesAuthFlow, GrapesAuthError } from '../src/auth/grapes-auth-flow.js'

const calls = []
function fixture(overrides = {}) {
  calls.length = 0
  const auth = {
    signInWithPassword: async args => { calls.push(['password', args]); return { data: { user: { id: 'synthetic-a' }, session: { access_token: 'synthetic-token' } }, error: null } },
    signInWithOAuth: async args => { calls.push(['google', args]); return { data: { url: 'https://example.invalid/authorize' }, error: null } },
    signUp: async args => { calls.push(['sign-up', args]); return { data: { user: { id: 'synthetic-b' }, session: null }, error: null } },
    resetPasswordForEmail: async (email, args) => { calls.push(['reset', email, args]); return { data: {}, error: null } },
    getUser: async () => ({ data: { user: { id: 'synthetic-a', email: 'synthetic@example.invalid' } }, error: null }),
    signOut: async args => { calls.push(['sign-out', args]); return { error: null } },
    ...overrides,
  }
  return createGrapesAuthFlow({ auth }, { callbackUrl: 'https://example.test/Grapes/login-auth-test.html', recoveryUrl: 'https://example.test/Grapes/reset-password.html' })
}

test('email login delegates to Supabase and returns only the user ID', async () => {
  const flow = fixture()
  assert.deepEqual(await flow.signInWithPassword(' synthetic@example.invalid ', 'secret'), { status: 'authenticated', userId: 'synthetic-a' })
  assert.deepEqual(calls, [['password', { email: 'synthetic@example.invalid', password: 'secret' }]])
})

test('username aliases never trigger an unsafe directory lookup', async () => {
  const flow = fixture()
  await assert.rejects(flow.signInWithPassword('useralias', 'password'), { code: 'EMAIL_REQUIRED' })
  assert.equal(calls.length, 0)
})

test('Google OAuth redirects via Supabase without Drive scopes', async () => {
  const flow = fixture()
  assert.deepEqual(await flow.signInWithGoogle(), { status: 'redirect_started', url: 'https://example.invalid/authorize' })
  assert.deepEqual(calls, [['google', { provider: 'google', options: { redirectTo: 'https://example.test/Grapes/login-auth-test.html' } }]])
})

test('registration does not claim a verified session before email confirmation', async () => {
  const flow = fixture()
  assert.deepEqual(await flow.signUp('a@example.invalid', 'randompassword'), { status: 'confirmation_required', userId: 'synthetic-b' })
})

test('password reset uses dedicated redirect and non-enumerating result', async () => {
  const flow = fixture()
  assert.deepEqual(await flow.requestPasswordReset('a@example.invalid'), { status: 'request_received' })
  assert.deepEqual(calls, [['reset', 'a@example.invalid', { redirectTo: 'https://example.test/Grapes/reset-password.html' }]])
})

test('session failure never reports a successful login', async () => {
  const flow = fixture({ signInWithPassword: async () => ({ data: { user: { id: 'synthetic-a' }, session: null }, error: null }) })
  await assert.rejects(flow.signInWithPassword('a@example.invalid', 'password'), { code: 'SESSION_MISSING' })
})

test('provider errors never expose internal messages', async () => {
  const flow = fixture({ signInWithPassword: async () => ({ error: { message: 'private provider debug and password' } }) })
  await assert.rejects(flow.signInWithPassword('a@example.invalid', 'password'), e => e instanceof GrapesAuthError && !e.message.includes('private'))
})

test('sign-out is Supabase-local; never touches Google Drive', async () => {
  const flow = fixture()
  assert.deepEqual(await flow.signOut(), { status: 'signed_out' })
  assert.deepEqual(calls, [['sign-out', { scope: 'local' }]])
})

test('invalid recovery HTTP URL outside loopback is rejected', () => {
  assert.throws(() => createGrapesAuthFlow({ auth: {
    signInWithPassword() {}, signInWithOAuth() {}, signUp() {}, resetPasswordForEmail() {}, getUser() {}, signOut() {},
  } }, { callbackUrl: 'http://malicious.invalid/login' }), { code: 'INVALID_REDIRECT' })
})

test('new password requires 8 characters and uses Supabase updateUser only', async () => {
  const flow = fixture({ updateUser: async args => { calls.push(['update', args]); return { data: {user:{id:'synthetic-a'}}, error:null } } })
  await assert.rejects(flow.updatePassword('short'), {code:'WEAK_PASSWORD'})
  assert.equal(calls.length,0)
  assert.deepEqual(await flow.updatePassword('new-test-password'),{status:'password_updated'})
  assert.deepEqual(calls,[['update',{password:'new-test-password'}]])
})
