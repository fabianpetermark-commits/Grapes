/**
 * Grapes production Auth preflight. This module is deliberately side-effect
 * free: it neither signs a user in nor touches app-local Food, Water or Drive.
 * No production app may use the Supabase TEST project.
 *
 * This validation does not enable an Android route by itself. The independent
 * production project's OAuth configuration and Android intent filter must be
 * reviewed before activating the feature in a production release.
 */
export const GRAPES_TEST_PROJECT_REF = 'aighqtqjlzirlokxwupt'
export const GRAPES_PROD_ANDROID_PACKAGE = 'hu.grapes.healthconnect'
export const GRAPES_PROD_AUTH_ORIGIN = 'https://grapes-prod-auth.invalid'
export const GRAPES_PROD_ANDROID_CALLBACK = 'hu.grapes.healthconnect://auth/callback'
export const GRAPES_PROD_AUTH_URL = GRAPES_PROD_AUTH_ORIGIN + '/assets/login-auth-prod.html'

export class GrapesProdAuthConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GrapesProdAuthConfigError'
  }
}

const PROJECT_REF = /^[a-z]{20}$/
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/

/**
 * Enabling is explicit, never inferred from the existence of a key.
 * Returns only public client configuration. Never accepts secret/service-role
 * keys. The production ref must be an actual separate Supabase project.
 */
export function validateGrapesProdAuthConfig({
  enabled = false,
  projectRef,
  approvedProjectRef,
  supabaseUrl,
  publishableKey,
  applicationId = GRAPES_PROD_ANDROID_PACKAGE,
} = {}) {
  if (enabled !== true) return Object.freeze({ enabled: false })
  if (applicationId !== GRAPES_PROD_ANDROID_PACKAGE) {
    throw new GrapesProdAuthConfigError('Az éles bejelentkezés csak az éles Android alkalmazáshoz engedélyezhető.')
  }
  if (typeof projectRef !== 'string' || !PROJECT_REF.test(projectRef) ||
      projectRef === GRAPES_TEST_PROJECT_REF || approvedProjectRef !== projectRef) {
    throw new GrapesProdAuthConfigError('Külön, jóváhagyott Grapes PROD Supabase projektazonosító szükséges.')
  }
  if (supabaseUrl !== `https://${projectRef}.supabase.co`) {
    throw new GrapesProdAuthConfigError('Az éles Supabase címnek pontosan az éles projekthez kell tartoznia.')
  }
  if (typeof publishableKey !== 'string' || !PUBLISHABLE_KEY.test(publishableKey)) {
    throw new GrapesProdAuthConfigError('Érvényes, nyilvános publishable API-kulcs szükséges; titkos kulcs tilos.')
  }
  return Object.freeze({
    enabled: true,
    projectRef,
    supabaseUrl,
    publishableKey,
    authOrigin: GRAPES_PROD_AUTH_ORIGIN,
    authUrl: GRAPES_PROD_AUTH_URL,
    callbackUrl: GRAPES_PROD_ANDROID_CALLBACK,
    storageKey: `grapes-prod-auth-${projectRef}`,
  })
}
