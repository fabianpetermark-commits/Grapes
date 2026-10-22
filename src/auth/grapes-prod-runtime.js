import { validateGrapesProdAuthConfig, GRAPES_PROD_PROJECT_REF } from './grapes-prod-config.js'
import { createGrapesAuthFlow } from './grapes-auth-flow.js'
import { bindGrapesProdLogin } from './grapes-prod-login-controller.js'

/**
 * Grapes PROD only. This accepts the official Supabase JS createClient factory
 * after its exact package version and lockfile are reviewed and installed.
 * It does not load third-party code from a CDN or expose any service-role key.
 */
export const GRAPES_PROD_PROJECT_URL = `https://${GRAPES_PROD_PROJECT_REF}.supabase.co`
export const GRAPES_PROD_STORAGE_KEY = 'grapes-prod-auth-yopabovoxyffhokhbgxl'
const VALID_HOSTS = new Set(['fabianpetermark-commits.github.io', 'localhost', '127.0.0.1'])
const CALLBACK_PATH = '/Grapes/login-auth-prod.html'
const ANDROID_AUTH_URL = 'https://grapes-prod-auth.invalid/assets/login-auth-prod.html'

export class GrapesProdAuthConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GrapesProdAuthConfigError'
  }
}

export function makeGrapesProdAuthConfig({ url, publishableKey, location, sessionStorage, nativeOAuth, legacyDataIsolationReviewed = false } = {}) {
  if (url !== GRAPES_PROD_PROJECT_URL) {
    throw new GrapesProdAuthConfigError('A Grapes PROD Supabase URL nem egyezik a külön éles projektével.')
  }
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey)) {
    throw new GrapesProdAuthConfigError('Kizárólag a Grapes PROD publishable kulcsa használható.')
  }
  if (!sessionStorage || ['getItem', 'setItem', 'removeItem'].some(key => typeof sessionStorage[key] !== 'function')) {
    throw new GrapesProdAuthConfigError('Biztonságos PROD-munkamenet tároló nem érhető el.')
  }
  let origin
  try {
    const loc = new URL(String(location))
    const android = Boolean(nativeOAuth) && loc.href === ANDROID_AUTH_URL
    if (nativeOAuth && !android) throw new Error('Android Auth origin mismatch')
    if (!android && (!VALID_HOSTS.has(loc.hostname) || (loc.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(loc.hostname) && loc.protocol === 'http:')) || loc.pathname !== CALLBACK_PATH)) {
      throw new Error('Invalid login PROD URL')
    }
    origin = loc.origin
  } catch {
    throw new GrapesProdAuthConfigError('A PROD-hitelesítés csak a jóváhagyott bejelentkezési útvonalon indulhat.')
  }
  validateGrapesProdAuthConfig({ enabled: true, projectRef: GRAPES_PROD_PROJECT_REF, approvedProjectRef: GRAPES_PROD_PROJECT_REF, legacyDataIsolationReviewed, supabaseUrl: url, publishableKey })
  return Object.freeze({
    url: GRAPES_PROD_PROJECT_URL,
    publishableKey,
    callbackUrl: nativeOAuth ? null : origin + CALLBACK_PATH,
    recoveryUrl: nativeOAuth ? null : origin + CALLBACK_PATH,
    storage: sessionStorage,
    storageKey: GRAPES_PROD_STORAGE_KEY,
  })
}

/**
 * The only route permitted to initialize Supabase PROD Auth. Scope is limited
 * to auth; no Food/Water/Drive/Health store is imported or passed to the SDK.
 */
export async function startGrapesProdAuth({
  createClient, root, url, publishableKey, location, sessionStorage, nativeOAuth,
  onAuthenticated = null, suppressAutoOpen = false, legacyDataIsolationReviewed = false,
} = {}) {
  if (typeof createClient !== 'function') {
    throw new GrapesProdAuthConfigError('A hivatalos Supabase-kliens még nincs telepítve.')
  }
  if (nativeOAuth && ['begin', 'resume', 'cancel'].some(name => typeof nativeOAuth[name] !== 'function')) {
    throw new GrapesProdAuthConfigError('Érvénytelen Android PROD OAuth-adapter.')
  }
  const config = makeGrapesProdAuthConfig({ url, publishableKey, location, sessionStorage, nativeOAuth, legacyDataIsolationReviewed })
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: !nativeOAuth,
      autoRefreshToken: true,
      persistSession: true,
      storageKey: config.storageKey,
      storage: config.storage,
    },
  })
  if (!client?.auth?.onAuthStateChange || !client?.auth?.getUser) {
    throw new GrapesProdAuthConfigError('Nem megfelelő Supabase Auth-kliens.')
  }
  const baseFlow = createGrapesAuthFlow(client, {
    callbackUrl: config.callbackUrl,
    recoveryUrl: config.recoveryUrl,
  })
  const flow = nativeOAuth ? Object.freeze({
    ...baseFlow,
    signInWithGoogle: () => nativeOAuth.begin(client),
    signOut: async () => {
      await nativeOAuth.cancel()
      const result = await baseFlow.signOut()
      if (typeof nativeOAuth.finishSignOut === 'function') await nativeOAuth.finishSignOut()
      return result
    },
  }) : baseFlow
  const ui = bindGrapesProdLogin(root, flow)
  let authRevision = 0
  let recoveryPending = false
  let disposed = false
  let forwarded = false
  const notifyVerified = (user) => {
    // Only getUser-validated sessions may unlock the PROD app. The native gate
    // cannot be bypassed by simply clicking a button on the login screen.
    if (!user?.id || recoveryPending || suppressAutoOpen || disposed ||
      forwarded || typeof onAuthenticated !== 'function') return
    forwarded = true
    Promise.resolve().then(() => onAuthenticated(user)).catch(error => {
      forwarded = false
      if (!disposed) {
        // Native owner-binding failures are already sanitized on the Android
        // side. Show a concrete recovery message instead of an endless splash.
        const message = typeof error?.message === 'string' && error.message.length <= 200
          ? error.message : 'A Grapes-fiók összekapcsolása nem sikerült. Próbáld újra.'
        ui.setNotice(message)
      }
    })
  }
  const { data: listener } = client.auth.onAuthStateChange((event) => {
    if (disposed) return
    if (event === 'SIGNED_OUT') {
      authRevision += 1
      recoveryPending = false
      forwarded = false
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
      notifyVerified(current)
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
    if (!disposed && initialRevision === authRevision) {
      ui.setSession(current)
      notifyVerified(current)
    }
  } catch {
    if (!disposed && initialRevision === authRevision) {
      ui.setSession(null)
      ui.setNotice('A PROD-kapcsolat nem ellenőrizhető. Próbáld újra később.')
    }
  }
  return {
    client,
    ui,
    notifyVerified,
    dispose: () => {
      disposed = true
      authRevision += 1
      listener?.subscription?.unsubscribe?.()
    },
  }
}
