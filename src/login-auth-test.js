import { bindGrapesTestLogin } from './auth/grapes-login-controller.js'
import { startGrapesTestAuth } from './auth/grapes-test-runtime.js'

/**
 * Grapes TEST route only. Existing login-preview.html and normal Drive login
 * never import this file. A production build has no active Supabase Auth flow.
 */
export function initializeGrapesAuthTest({ root = document } = {}) {
  return bindGrapesTestLogin(root, null)
}

/**
 * Entry for the separately reviewed official SDK. Do not call before
 * @supabase/supabase-js is installed with an exact version + lockfile,
 * Google / email redirects configured and TEST Auth explicitly enabled.
 * The key is publishable, never a service_role/secret key.
 */
export async function activateGrapesAuthTest({
  createClient,
  root = document,
  url = import.meta.env?.VITE_GRAPES_TEST_SUPABASE_URL,
  publishableKey = import.meta.env?.VITE_GRAPES_TEST_SUPABASE_PUBLISHABLE_KEY,
  location = globalThis.location?.href,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  return startGrapesTestAuth({ createClient, root, url, publishableKey, location, sessionStorage })
}

if (typeof document !== 'undefined' && document.querySelector('#grapes-login-form')) {
  // Explicitly disabled until the official Supabase SDK is pinned/installed and
  // reviewed. A later PR will enable activation only on this TEST route.
  initializeGrapesAuthTest()
}
