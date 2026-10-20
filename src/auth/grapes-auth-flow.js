/**
 * TEST-only Grapes Auth application adapter.
 *
 * Accepts a configured @supabase/supabase-js client; it does not create a
 * client, expose a secret, perform redirects itself, or own token storage.
 * Do not connect to Health storage or replace the current Drive login here.
 */
export class GrapesAuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'GrapesAuthError'
    this.code = code
  }
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const asEmail = value => {
  const email = String(value ?? '').trim()
  if (!VALID_EMAIL.test(email) || email.length > 254) {
    throw new GrapesAuthError('EMAIL_REQUIRED', 'Adj meg egy érvényes e-mail-címet.')
  }
  return email
}

const requirePassword = value => {
  if (typeof value !== 'string' || !value) {
    throw new GrapesAuthError('PASSWORD_REQUIRED', 'Add meg a jelszavadat.')
  }
  return value
}

const requireRedirect = value => {
  const redirect = new URL(String(value))
  if (!['https:', 'http:'].includes(redirect.protocol) ||
      (redirect.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)) ||
      redirect.username || redirect.password || redirect.hash) {
    throw new GrapesAuthError('INVALID_REDIRECT', 'A teszt-visszatérési cím érvénytelen.')
  }
  return redirect.href
}

const check = result => {
  if (!result || typeof result !== 'object') {
    throw new GrapesAuthError('AUTH_FAILED', 'A bejelentkezés nem sikerült.')
  }
  if (result.error) {
    // Never surface provider internals, credentials or tokens in the UI.
    throw new GrapesAuthError('AUTH_FAILED', 'Az azonosítás nem sikerült. Ellenőrizd az adatokat, vagy próbáld újra.')
  }
  return result.data ?? {}
}

export function createGrapesAuthFlow(client, { callbackUrl, recoveryUrl } = {}) {
  const auth = client?.auth
  if (!auth || !['signInWithPassword', 'signInWithOAuth', 'signUp', 'resetPasswordForEmail', 'getUser', 'signOut'].every(name => typeof auth[name] === 'function')) {
    throw new GrapesAuthError('CLIENT_MISSING', 'A Supabase Auth kliens nincs előkészítve.')
  }
  const googleReturn = callbackUrl ? requireRedirect(callbackUrl) : null
  const passwordReturn = recoveryUrl ? requireRedirect(recoveryUrl) : null

  return Object.freeze({
    async signInWithPassword(identifier, password) {
      // Supabase Auth supports email/password natively. Username aliases must
      // be resolved in a separate privacy-reviewed server-side flow; do not
      // leak a user directory or silently treat a username as an email.
      const email = asEmail(identifier)
      const data = check(await auth.signInWithPassword({ email, password: requirePassword(password) }))
      if (!data.user?.id || !data.session?.access_token) {
        throw new GrapesAuthError('SESSION_MISSING', 'Nem érkezett érvényes munkamenet.')
      }
      return { status: 'authenticated', userId: data.user.id }
    },
    async signInWithGoogle() {
      if (!googleReturn) throw new GrapesAuthError('GOOGLE_NOT_CONFIGURED', 'A Google-belépés teszt-visszatérési címe még nincs beállítva.')
      const data = check(await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: googleReturn } }))
      // The Supabase SDK handles PKCE, OAuth redirect, session exchange, and
      // token persistence. In particular do not request Google Drive scopes.
      return { status: 'redirect_started', url: typeof data.url === 'string' ? data.url : null }
    },
    async signUp(emailInput, password) {
      const email = asEmail(emailInput)
      const data = check(await auth.signUp({
        email, password: requirePassword(password),
        ...(googleReturn ? { options: { emailRedirectTo: googleReturn } } : {}),
      }))
      return { status: data.session ? 'authenticated' : 'confirmation_required', userId: data.user?.id ?? null }
    },
    async requestPasswordReset(emailInput) {
      const email = asEmail(emailInput)
      if (!passwordReturn) throw new GrapesAuthError('RECOVERY_NOT_CONFIGURED', 'A jelszó-visszaállítási cím még nincs beállítva.')
      check(await auth.resetPasswordForEmail(email, { redirectTo: passwordReturn }))
      return { status: 'request_received' } // Non-enumerating feedback.
    },
    async currentUser() {
      const data = check(await auth.getUser())
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
    },
    async signOut() {
      check(await auth.signOut({ scope: 'local' }))
      // Never revoke Google Drive OAuth or modify the E-book's token store.
      return { status: 'signed_out' }
    },
  })
}
