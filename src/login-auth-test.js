import { createClient } from '@supabase/supabase-js'
import { bindGrapesTestLogin } from './auth/grapes-login-controller.js'
import { startGrapesTestAuth } from './auth/grapes-test-runtime.js'

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
  return startGrapesTestAuth({
    createClient: createClientFactory, root, url, publishableKey, location, sessionStorage,
  })
}

if (typeof document !== 'undefined' && document.querySelector('#grapes-login-form')) {
  if (import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true') {
    activateGrapesAuthTest().catch(() => {
      // Fail closed: do not let an unconfigured page transmit credentials.
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
