import { createClient } from '@supabase/supabase-js'
import { bindGrapesProdLogin } from './auth/grapes-prod-login-controller.js'
import { startGrapesProdAuth } from './auth/grapes-prod-runtime.js'
import { createAndroidProdOAuth } from './auth/grapes-android-prod-oauth.js'

/**
 * Grapes PROD route only. The existing login-preview.html and Google Drive
 * login do not import this entrypoint. No SDK credentials are baked into
 * source. The publishable key is client configuration, never a secret.
 */
export function initializeGrapesAuthProd({ root = document } = {}) {
  return bindGrapesProdLogin(root, null)
}

export async function activateGrapesAuthProd({
  createClientFactory = createClient,
  root = document,
  url = import.meta.env?.VITE_GRAPES_PROD_SUPABASE_URL,
  publishableKey = import.meta.env?.VITE_GRAPES_PROD_SUPABASE_PUBLISHABLE_KEY,
  location = globalThis.location?.href,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  const isAndroid = location === 'https://grapes-prod-auth.invalid/assets/login-auth-prod.html' &&
    typeof globalThis.GrapesAndroid?.postMessage === 'function'
  const nativeOAuth = isAndroid ? createAndroidProdOAuth() : null
  let navigatingToApp = false
  const revealLogin = () => {
    if (isAndroid) globalThis.document?.documentElement?.removeAttribute('data-grapes-prod-starting')
  }
  // Read the app-private logout request before checking the persisted session,
  // otherwise a formerly signed-in user could be forwarded to the app again.
  const logoutRequested = nativeOAuth
    ? (await nativeOAuth.takeLaunchMode()).logout === true : false
  const app = await startGrapesProdAuth({
    createClient: createClientFactory, root, url, publishableKey, location,
    sessionStorage: nativeOAuth ? nativeOAuth.storage : sessionStorage, nativeOAuth,
    legacyDataIsolationReviewed: import.meta.env?.VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED === 'true',
    onAuthenticated: nativeOAuth ? async verifiedUser => {
      navigatingToApp = true
      try {
        // The Android owner may cancel enrollment or decline the backup
        // acknowledgement; neither outcome may unlock the legacy profile.
        await nativeOAuth.enterApp(verifiedUser.id)
      } catch (error) {
        navigatingToApp = false
        revealLogin()
        throw error
      }
    } : null,
    suppressAutoOpen: logoutRequested,
  })
  if (nativeOAuth && logoutRequested) {
    try {
      // The Supabase SDK clears only its own PROD Auth session. It does not
      // touch Food, Water, Finance, Drive or the signed-in Google account.
      await nativeOAuth.cancel()
      const { error } = await app.client.auth.signOut({ scope: 'local' })
      if (error) throw error
      app.ui.setSession(null)
      await nativeOAuth.finishSignOut()
      app.ui.setNotice('Kijelentkeztél a Grapes PROD-fiókból.')
    } catch {
      // Android retains logout-pending across app process death. Never
      // auto-open the app until logout succeeds.
      app.ui.setNotice('A kijelentkezés nem sikerült. Ellenőrizd az internetet, és próbáld újra.')
    }
  } else if (nativeOAuth) {
    await nativeOAuth.resume(app.client, app.ui, app.notifyVerified).catch(() => {
      app.ui.setNotice('A PROD-visszatérés nem ellenőrizhető. Indíts új belépést.')
    })
  }
  if (nativeOAuth && !logoutRequested && !navigatingToApp) {
    // A SIGNED_IN event can supersede the first getUser() during restoration.
    // Verify one final time before revealing the login; only a validated
    // Supabase user may request the native app handoff.
    try {
      const { data, error } = await app.client.auth.getUser()
      if (!error && data?.user?.id) app.notifyVerified(data.user)
    } catch { /* Keep the original actionable Auth notice. */ }
    await Promise.resolve() // drain the onAuthenticated microtask
  }
  if (nativeOAuth && !navigatingToApp) revealLogin()
  return app
}

if (typeof document !== 'undefined' && document.querySelector('#grapes-login-form')) {
  if (import.meta.env?.VITE_GRAPES_PROD_AUTH_ENABLED === 'true' &&
      import.meta.env?.VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED === 'true') {
    activateGrapesAuthProd().catch(() => {
      // Fail closed: do not let an unconfigured page transmit credentials.
      // A broken PROD config must still expose the error instead of showing
      // an endless account-check splash.
      document.documentElement.removeAttribute('data-grapes-prod-starting')
      initializeGrapesAuthProd()
      const feedback = document.querySelector('#grapes-feedback')
      if (feedback) {
        feedback.textContent = 'A Grapes PROD bejelentkezése még nem használható. Ellenőrizni kell az Auth-konfigurációt.'
        feedback.hidden = false
      }
    })
  } else {
    // This remains the default on main, PROD and ordinary Android builds.
    initializeGrapesAuthProd()
  }
}
