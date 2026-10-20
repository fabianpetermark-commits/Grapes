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
  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user?.id) ui.setSession({ id: session.user.id })
    if (event === 'PASSWORD_RECOVERY') ui.setRecoveryMode()
    if (event === 'SIGNED_OUT') ui.setSession(null)
  })
  try {
    // Explicitly validate session server-side; never trust a cached user object.
    const current = await flow.currentUser()
    ui.setSession(current)
  } catch {
    ui.setSession(null)
    ui.setNotice('A korábbi TEST-munkamenet nem ellenőrizhető. Jelentkezz be újra.')
  }
  return {
    client,
    ui,
    dispose: () => listener?.subscription?.unsubscribe?.(),
  }
}
