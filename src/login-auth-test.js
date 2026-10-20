import { bindGrapesTestLogin } from './auth/grapes-login-controller.js'

/**
 * Grapes TEST login entrypoint. Disabled until an official Supabase SDK client
 * is configured on a follow-up reviewed branch. Does NOT authenticate, store
 * sessions, read passwords or send any data in its unconfigured state.
 */
export function initializeGrapesAuthTest({ root = document, flow = null } = {}) {
  return bindGrapesTestLogin(root, flow)
}
if (typeof document !== 'undefined' && document.querySelector('#grapes-login-form')) {
  initializeGrapesAuthTest()
}
