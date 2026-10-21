import { createGrapesAuthFlow } from './grapes-auth-flow.js'
import { bindGrapesTestLogin } from './grapes-login-controller.js'

/**
 * Grapes TEST only. This accepts the official Supabase JS createClient factory
 * after its exact package version and lockfile are reviewed and installed.
 * It does not load third-party code from a CDN or expose any service-role key.
 */
export const GRAPES_TEST_PROJECT_URL = 'https://aighqtqjlzirlokxwupt.supabase.co'
export const GRAPES_TEST_STORAGE_KEY = 'grapes-test-auth-aighqtqjlzirlokxwupt'
const VALID_HOSTS = new Set(['fabianpetermark-commits.github.io', 'localhost', '127.0.0.1'])
const CALLBACK_PATH = '/Grapes/login-auth-test.html'

export class GrapesTestAuthConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GrapesTestAuthConfigError'
  }
}

export function makeGrapesTestAuthConfig({ url, publishableKey, location, sessionStorage } = {}) {
  if (url !== GRAPES_TEST_PROJECT_URL) {
    throw new GrapesTestAuthConfigError('A Grapes TEST Supabase URL nem egyezik a külön tesztprojektével.')
  }
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey)) {
    throw new GrapesTestAuthConfigError('Kizárólag a Grapes TEST publishable kulcsa használható.')
  }
  if (!sessionStorage || ['getItem', 'setItem', 'removeItem'].some(key => typeof sessionStorage[key] !== 'function')) {
    throw new GrapesTestAuthConfigError('Biztonságos TEST-munkamenet tároló nem érhető el.')
  }
  let origin
  try {
    const loc = new URL(String(location))
    if (!VALID_HOSTS.has(loc.hostname) || (loc.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(loc.hostname) && loc.protocol === 'http:')) || loc.pathname !== CALLBACK_PATH) {
      throw new Error('Invalid login TEST URL')
    }
    origin = loc.origin
  } catch {
    throw new GrapesTestAuthConfigError('A TEST-hitelesítés csak a jóváhagyott bejelentkezési útvonalon indulhat.')
  }
  return Object.freeze({
    url: GRAPES_TEST_PROJECT_URL,
    publishableKey,
    callbackUrl: origin + CALLBACK_PATH,
    recoveryUrl: origin + CALLBACK_PATH,
    storage: sessionStorage,
    storageKey: GRAPES_TEST_STORAGE_KEY,
  })
}

/**
 * The only route permitted to initialize Supabase TEST Auth. Scope is limited
 * to auth; no Food/Water/Drive/Health store is imported or passed to the SDK.
 */
export async function startGrapesTestAuth({ createClient, root, url, publishableKey, location, sessionStorage } = {}) {
  if (typeof createClient !== 'function') {
    throw new GrapesTestAuthConfigError('A hivatalos Supabase-kliens még nincs telepítve.')
  }
  const config = makeGrapesTestAuthConfig({ url, publishableKey, location, sessionStorage })
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
      storageKey: config.storageKey,
      storage: config.storage,
    },
  })
  if (!client?.auth?.onAuthStateChange || !client?.auth?.getUser) {
    throw new GrapesTestAuthConfigError('Nem megfelelő Supabase Auth-kliens.')
  }
  const flow = createGrapesAuthFlow(client, {
    callbackUrl: config.callbackUrl,
    recoveryUrl: config.recoveryUrl,
  })
  const ui = bindGrapesTestLogin(root, flow)
  let authRevision = 0
  let recoveryPending = false
  let disposed = false
  const { data: listener } = client.auth.onAuthStateChange((event) => {
    if (disposed) return
    if (event === 'SIGNED_OUT') {
      authRevision += 1
      recoveryPending = false
      ui.setSession(null)
      return
    }
    if (event !== 'SIGNED_IN' && event !== 'PASSWORD_RECOVERY') return
    if (event === 'PASSWORD_RECOVERY') recoveryPending = true
    const revision = ++authRevision
    // Supabase recommends not awaiting other auth methods inside its callback:
    // defer the network-backed identity check to a separate microtask.
    Promise.resolve().then(async () => {
      let current = null
      try { current = await flow.currentUser() } catch {
        // An invalidated/expired session is not considered authenticated.
      }
      if (disposed || revision !== authRevision) return
      ui.setSession(current)
      if (current?.id && recoveryPending) ui.setRecoveryMode()
      if (!current?.id && recoveryPending) {
        ui.setNotice('A jelszó-visszaállítási munkamenet lejárt. Kérj új e-mailt.')
      }
    })
  })
  const initialRevision = authRevision
  try {
    // Initial state must be validated server-side. Ignore this result if a
    // later auth event superseded it while getUser() was in flight.
    const current = await flow.currentUser()
    if (!disposed && initialRevision === authRevision) ui.setSession(current)
  } catch {
    if (!disposed && initialRevision === authRevision) {
      ui.setSession(null)
      ui.setNotice('A TEST-kapcsolat nem ellenőrizhető. Próbáld újra később.')
    }
  }
  return {
    client,
    ui,
    dispose: () => {
      disposed = true
      authRevision += 1
      listener?.subscription?.unsubscribe?.()
    },
  }
}
