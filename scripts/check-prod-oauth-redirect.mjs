import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const PROJECT = 'https://yopabovoxyffhokhbgxl.supabase.co'
const CALLBACK = 'hu.grapes.healthconnect://auth/callback'
const isRedirect = response => [302, 303, 307].includes(response.status)

// Use only a fresh synthetic OAuth transaction. Never accept a user's code,
// token or OAuth state as input, and never log the provider Location header.
export async function checkProdOAuthRedirect({ publishableKey, fetchImpl = fetch } = {}) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey ?? '')) {
    throw new Error('A public PROD publishable key is required')
  }
  const request = url => fetchImpl(url, {
    headers: { apikey: publishableKey }, redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  })
  const settings = await request(PROJECT + '/auth/v1/settings')
  if (!settings.ok || (await settings.json()).external?.google !== true) {
    throw new Error('PROD Google provider is unavailable or disabled')
  }
  const nonce = randomBytes(32).toString('hex')
  const authorize = new URL(PROJECT + '/auth/v1/authorize')
  authorize.searchParams.set('provider', 'google')
  authorize.searchParams.set('redirect_to', CALLBACK + '?state=' + nonce)
  authorize.searchParams.set('code_challenge', randomBytes(32).toString('base64url'))
  authorize.searchParams.set('code_challenge_method', 's256')
  const handoff = await request(authorize)
  if (!isRedirect(handoff)) throw new Error('PROD Google handoff failed')
  const provider = new URL(handoff.headers.get('location') ?? '', PROJECT)
  if (provider.protocol !== 'https:' || provider.hostname !== 'accounts.google.com' ||
      provider.port || provider.username || provider.password ||
      provider.searchParams.get('redirect_uri') !== PROJECT + '/auth/v1/callback') {
    throw new Error('Unexpected Google OAuth provider or callback')
  }
  const providerStates = provider.searchParams.getAll('state')
  if (providerStates.length !== 1 || !providerStates[0]) {
    throw new Error('Missing synthetic provider state')
  }
  // Simulate denial of OUR new flow. This does not log in, create a user, or
  // exchange an authorization code, but exercises Supabase's selected return URL.
  const cancel = new URL(PROJECT + '/auth/v1/callback')
  cancel.searchParams.set('state', providerStates[0])
  cancel.searchParams.set('error', 'access_denied')
  cancel.searchParams.set('error_description', 'Synthetic redirect configuration check')
  const returned = await request(cancel)
  if (!isRedirect(returned)) throw new Error('Synthetic OAuth return failed')
  const destination = new URL(returned.headers.get('location') ?? '', PROJECT)
  const expected = new URL(CALLBACK)
  if (destination.protocol !== expected.protocol || destination.host !== expected.host ||
      destination.pathname !== expected.pathname || destination.username || destination.password ||
      destination.searchParams.getAll('state').length !== 1 ||
      destination.searchParams.get('state') !== nonce ||
      destination.searchParams.get('error') !== 'access_denied') {
    throw new Error('PROD OAuth return is incorrect: verify Redirect URLs includes hu.grapes.healthconnect://auth/callback?state=*; a Google handoff alone is not sufficient')
  }
  return { status: 'verified', callback: CALLBACK }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkProdOAuthRedirect({ publishableKey: process.env.VITE_GRAPES_PROD_SUPABASE_PUBLISHABLE_KEY })
    .then(() => console.log('PASS: PROD Google handoff AND Android return URL/state verified using synthetic cancellation; no user login performed.'))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
