/**
 * Production Android Grapes Auth environment validator.
 *
 * This is a release-build configuration guard, NOT an authorization decision.
 * Android must still verify a fresh Supabase user (getUser) and gate WebView
 * navigation. No service_role/secret key, account data, or Drive OAuth here.
 *
 * Do not wire this to PROD until a distinct Grapes PROD Supabase project is
 * explicitly selected and the native redirect is configured and tested.
 */
export const GRAPES_TEST_PROJECT_REF = 'aighqtqjlzirlokxwupt'
export const GRAPES_PROD_PACKAGE = 'hu.grapes.healthconnect'
export const GRAPES_PROD_AUTH_CALLBACK = 'hu.grapes.healthconnect://auth/callback'
export const GRAPES_PROD_AUTH_STORAGE_PREFIX = 'grapes-prod-auth-'

const SUPABASE_REF = /^[a-z]{20}$/
const PUBLIC_KEY = /^sb_publishable_[a-zA-Z0-9_-]{16,}$/

/**
 * Avoid accepting the TEST URL, user-supplied custom hosts, a legacy shared
 * project or a secret key inside the distributable PROD Android client.
 *
 * The caller must pass the trusted/approved project reference explicitly;
 * until its value has been reviewed, production Auth remains disabled.
 */
export function validateGrapesProdAuthEnvironment({
  approvedProjectRef,
  projectUrl,
  publishableKey,
  callback = GRAPES_PROD_AUTH_CALLBACK,
} = {}) {
  if (typeof approvedProjectRef !== 'string' ||
      !SUPABASE_REF.test(approvedProjectRef) ||
      approvedProjectRef === GRAPES_TEST_PROJECT_REF) {
    throw new Error('A külön Grapes PROD Supabase projekt még nincs jóváhagyva.')
  }
  const expectedUrl = `https://${approvedProjectRef}.supabase.co`
  if (projectUrl !== expectedUrl) {
    throw new Error('Az éles hitelesítés nem használhat TEST vagy idegen Supabase URL-t.')
  }
  if (!PUBLIC_KEY.test(String(publishableKey ?? ''))) {
    throw new Error('Az éles alkalmazásban csak Supabase publishable kulcs engedélyezett.')
  }
  if (callback !== GRAPES_PROD_AUTH_CALLBACK) {
    throw new Error('Érvénytelen éles Android hitelesítési visszatérési cím.')
  }
  return Object.freeze({
    url: expectedUrl,
    publishableKey,
    redirectTo: GRAPES_PROD_AUTH_CALLBACK,
    storageKey: GRAPES_PROD_AUTH_STORAGE_PREFIX + approvedProjectRef,
  })
}
