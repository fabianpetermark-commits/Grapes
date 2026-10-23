import test from 'node:test'
import assert from 'node:assert/strict'
import { checkProdOAuthRedirect } from '../scripts/check-prod-oauth-redirect.mjs'

const project = 'https://yopabovoxyffhokhbgxl.supabase.co'
const key = 'sb_publishable_0123456789abcdefghijklmn'
const response = (location, status = 302) => new Response(null, { status, headers: { location } })

function fixture({ rewriteReturn = url => url, rewriteProvider = url => url } = {}) {
  const calls = []
  let returnUrl
  return {
    calls,
    fetchImpl: async (input, options) => {
      const url = new URL(input)
      calls.push(url)
      assert.equal(url.origin, project)
      assert.equal(options.redirect, 'manual')
      assert.equal(options.headers.apikey, key)
      if (url.pathname === '/auth/v1/settings') {
        return Response.json({ external: { google: true } })
      }
      if (url.pathname === '/auth/v1/authorize') {
        assert.equal(url.searchParams.get('provider'), 'google')
        assert.equal(url.searchParams.get('code_challenge_method'), 's256')
        assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/)
        returnUrl = new URL(url.searchParams.get('redirect_to'))
        assert.match(returnUrl.searchParams.get('state'), /^[a-f0-9]{64}$/)
        const provider = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        provider.searchParams.set('state', 'our-new-synthetic-flow')
        provider.searchParams.set('redirect_uri', project + '/auth/v1/callback')
        return response(rewriteProvider(provider).href)
      }
      assert.equal(url.pathname, '/auth/v1/callback')
      assert.equal(url.searchParams.get('state'), 'our-new-synthetic-flow')
      assert.equal(url.searchParams.get('error'), 'access_denied')
      assert.equal(url.searchParams.has('code'), false)
      returnUrl.searchParams.set('error', 'access_denied')
      returnUrl.hash = 'error=access_denied'
      return response(rewriteReturn(returnUrl).href)
    },
  }
}

test('checks the actual Android return and nonce using only a fresh cancelled flow', async () => {
  const f = fixture()
  assert.deepEqual(await checkProdOAuthRedirect({ publishableKey: key, fetchImpl: f.fetchImpl }), {
    status: 'verified', callback: 'hu.grapes.healthconnect://auth/callback',
  })
  assert.equal(f.calls.length, 3)
})

test('Google handoff success must not mask the localhost fallback', async () => {
  const f = fixture({ rewriteReturn: () => new URL('http://localhost:3000/?error=access_denied') })
  await assert.rejects(checkProdOAuthRedirect({ publishableKey: key, fetchImpl: f.fetchImpl }), /return is incorrect/)
})

for (const [name, rewriteReturn] of [
  ['missing nonce', url => { url.searchParams.delete('state'); return url }],
  ['wrong nonce', url => { url.searchParams.set('state', 'wrong'); return url }],
  ['duplicate nonce', url => { url.searchParams.append('state', 'other'); return url }],
  ['TEST scheme', url => { url.protocol = 'hu.grapes.healthconnect.test:'; return url }],
]) {
  test('rejects ' + name, async () => {
    const f = fixture({ rewriteReturn })
    await assert.rejects(checkProdOAuthRedirect({ publishableKey: key, fetchImpl: f.fetchImpl }), /return is incorrect/)
  })
}

test('does not send provider state to an untrusted callback', async () => {
  const f = fixture({ rewriteProvider: url => {
    url.searchParams.set('redirect_uri', 'https://untrusted.invalid/callback')
    return url
  } })
  await assert.rejects(checkProdOAuthRedirect({ publishableKey: key, fetchImpl: f.fetchImpl }), /Unexpected Google/)
  assert.equal(f.calls.length, 2)
})

test('rejects secret keys before making any request', async () => {
  const f = fixture()
  await assert.rejects(checkProdOAuthRedirect({ publishableKey: 'sb_secret_not_a_public_key', fetchImpl: f.fetchImpl }), /public PROD/)
  assert.equal(f.calls.length, 0)
})
