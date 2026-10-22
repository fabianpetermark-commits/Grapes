const CALLBACK = 'hu.grapes.healthconnect://auth/callback'
const PROJECT = 'https://yopabovoxyffhokhbgxl.supabase.co'
const PENDING_KEY = 'grapes-prod-android-oauth-pending-v1'
const MAX_AGE_MS = 5 * 60 * 1000

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
  byte => byte.toString(16).padStart(2, '0')).join('')

export function validateProdAuthorizeUrl(value, state) {
  try {
    const url = new URL(value)
    const redirect = CALLBACK + '?state=' + state
    return url.origin === PROJECT && url.pathname === '/auth/v1/authorize' &&
      url.username === '' && url.password === '' && url.hash === '' &&
      url.searchParams.get('provider') === 'google' &&
      url.searchParams.get('redirect_to') === redirect &&
      url.searchParams.getAll('provider').length === 1 &&
      url.searchParams.getAll('redirect_to').length === 1 &&
      !url.searchParams.has('scopes') && !url.searchParams.has('scope')
  } catch { return false }
}

export function createAndroidProdOAuth({ bridge = globalThis.GrapesAndroid,
  events = globalThis, storage = globalThis.localStorage, now = Date.now } = {}) {
  if (!bridge || typeof bridge.postMessage !== 'function' ||
      !storage || typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function') throw new Error('PROD Android Auth bridge unavailable')

  const call = (method, args = []) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const onResult = event => {
      if (event.detail?.requestId !== requestId) return
      events.removeEventListener('grapes:android-result', onResult)
      if (!event.detail.ok) reject(new Error(typeof event.detail.error === 'string' ? event.detail.error : 'PROD Android Auth handoff failed'))
      else {
        try { resolve(JSON.parse(event.detail.payload)) }
        catch { reject(new Error('Invalid PROD Android Auth response')) }
      }
    }
    events.addEventListener('grapes:android-result', onResult)
    bridge.postMessage(JSON.stringify({ method, requestId, args }))
  })

  const pending = () => {
    try {
      const value = JSON.parse(storage.getItem(PENDING_KEY) || 'null')
      return value && /^[a-f0-9]{64}$/.test(value.state) &&
        now() - value.started >= 0 && now() - value.started <= MAX_AGE_MS ? value : null
    } catch { return null }
  }

  return Object.freeze({
    storage,
    // This flag lives in Android app-private preferences; reading it does not
    // expose a token or share the separate Supabase Auth origin with Drive.
    async takeLaunchMode() { return call('takeProdAuthLaunchMode') },
    // The owner-binding consent and secure device challenge are asynchronous.
    // Wait for an explicit native acknowledgement instead of silently assuming
    // that successful Supabase login already unlocked unscoped local records.
    enterApp(verifiedUserId) {
      if (typeof verifiedUserId !== 'string' || !/^[a-f0-9-]{36}$/i.test(verifiedUserId)) throw new Error('Invalid PROD user identity')
      return call('completeProdAuthLogin', [verifiedUserId])
    },
    async finishSignOut() { await call('finishProdAuthSignOut') },
    async begin(client) {
      const state = randomState()
      const redirectTo = CALLBACK + '?state=' + state
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error || !data?.url || !validateProdAuthorizeUrl(data.url, state)) {
        throw new Error('PROD Google OAuth could not start')
      }
      storage.setItem(PENDING_KEY, JSON.stringify({ state, started: now() }))
      try {
        await call('beginProdAuthOAuth', [data.url, state])
        return { status: 'redirect_started' }
      } catch (error) {
        storage.removeItem(PENDING_KEY)
        throw error
      }
    },
    async resume(client, ui, onVerified = null) {
      const result = await call('takeProdAuthCallback')
      if (result.status === 'none') return
      const saved = pending()
      storage.removeItem(PENDING_KEY)
      if (!saved || saved.state !== result.state) {
        ui.setNotice('A PROD-bejelentkezés lejárt vagy nem ehhez az alkalmazáshoz tartozik.')
        return
      }
      if (result.status === 'cancel') {
        ui.setNotice('A Google-bejelentkezést megszakítottad.')
        return
      }
      if (result.status !== 'code' || typeof result.code !== 'string') return
      try {
        const { error } = await client.auth.exchangeCodeForSession(result.code)
        if (error) throw error
        const { data } = await client.auth.getUser()
        const user = data?.user?.id ? { id: data.user.id, email: data.user.email } : null
        ui.setSession(user)
        if (user?.id && typeof onVerified === 'function') onVerified(user)
      } catch {
        ui.setNotice('A PROD-bejelentkezés nem fejeződött be. Indíts új belépést.')
      }
    },
    async cancel() {
      storage.removeItem(PENDING_KEY)
      await call('cancelProdAuthOAuth').catch(() => {})
    },
  })
}
