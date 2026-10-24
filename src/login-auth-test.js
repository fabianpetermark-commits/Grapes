import { createClient } from '@supabase/supabase-js'
import { bindGrapesTestLogin } from './auth/grapes-login-controller.js'
import { startGrapesTestAuth } from './auth/grapes-test-runtime.js'
import { createAndroidTestOAuth } from './auth/grapes-android-oauth.js'

/**
 * Grapes TEST route only. The existing login-preview.html and Google Drive
 * login do not import this entrypoint. No SDK credentials are baked into
 * source. The publishable key is client configuration, never a secret.
 */
export function initializeGrapesAuthTest({ root = document } = {}) {
  return bindGrapesTestLogin(root, null)
}

export async function activateGrapesAuthTest({
  createClientFactory = createClient,
  root = document,
  url = import.meta.env?.VITE_GRAPES_TEST_SUPABASE_URL,
  publishableKey = import.meta.env?.VITE_GRAPES_TEST_SUPABASE_PUBLISHABLE_KEY,
  location = globalThis.location?.href,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  const isAndroid = location === 'https://grapes-test-auth.invalid/assets/login-auth-test.html' &&
    typeof globalThis.GrapesAndroid?.postMessage === 'function'
  const nativeOAuth = isAndroid ? createAndroidTestOAuth() : null
  let navigatingToApp = false
  const revealLogin = () => {
    if (isAndroid) globalThis.document?.documentElement?.removeAttribute('data-grapes-qa-starting')
  }
  // Read the app-private logout request before checking the persisted session,
  // otherwise a formerly signed-in user could be forwarded to the app again.
  const logoutRequested = nativeOAuth
    ? (await nativeOAuth.takeLaunchMode()).logout === true : false
  const app = await startGrapesTestAuth({
    createClient: createClientFactory, root, url, publishableKey, location,
    sessionStorage: nativeOAuth ? nativeOAuth.storage : sessionStorage, nativeOAuth,
    onAuthenticated: nativeOAuth ? user => {
      nativeOAuth.enterApp(user)
      navigatingToApp = true
    } : null,
    suppressAutoOpen: logoutRequested,
  })
  if (nativeOAuth && logoutRequested) {
    try {
      // The Supabase SDK clears only its own TEST Auth session. It does not
      // touch Food, Water, Finance, Drive or the signed-in Google account.
      await nativeOAuth.cancel()
      const { error } = await app.client.auth.signOut({ scope: 'local' })
      if (error) throw error
      app.ui.setSession(null)
      await nativeOAuth.finishSignOut()
      app.ui.setNotice('Kijelentkeztél a Grapes TEST-fiókból.')
    } catch {
      // Android retains logout-pending across app process death. Never
      // auto-open the app until logout succeeds.
      app.ui.setNotice('A kijelentkezés nem sikerült. Ellenőrizd az internetet, és próbáld újra.')
    }
  } else if (nativeOAuth) {
    await nativeOAuth.resume(app.client, app.ui, app.notifyVerified).catch(() => {
      app.ui.setNotice('A TEST-visszatérés nem ellenőrizhető. Indíts új belépést.')
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
  if (import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true') {
    activateGrapesAuthTest().catch(() => {
      // Fail closed: do not let an unconfigured page transmit credentials.
      // A broken TEST config must still expose the error instead of showing
      // an endless account-check splash.
      document.documentElement.removeAttribute('data-grapes-qa-starting')
      initializeGrapesAuthTest()
      const feedback = document.querySelector('#grapes-feedback')
      if (feedback) {
        feedback.textContent = 'A Grapes TEST bejelentkezése még nem használható. Ellenőrizni kell az Auth-konfigurációt.'
        feedback.hidden = false
      }
    })
  } else {
    // This remains the default on main, PROD and ordinary Android builds.
    initializeGrapesAuthTest()
  }
}
