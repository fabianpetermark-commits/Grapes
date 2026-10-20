/**
 * Explicitly opt-in Grapes TEST UI controller. No backend or token storage here.
 * The host supplies a configured official Supabase Auth adapter after review.
 * All operations are isolated from the existing Google Drive / E-book login.
 */
export function bindGrapesTestLogin(root, flow = null) {
  const $ = (selector) => root.querySelector(selector)
  const form = $('#grapes-login-form')
  const username = $('#grapes-username')
  const password = $('#grapes-password')
  const google = $('#google-sign-in')
  const register = $('#register')
  const forgot = $('#forgot-password')
  const toggle = $('#toggle-password')
  const submit = $('.submit-button')
  const feedback = $('#grapes-feedback')
  const signOut = $('#grapes-sign-out')
  if ([form, username, password, google, register, forgot, toggle, submit, feedback, signOut].some(x => !x)) {
    throw new Error('Approved Grapes TEST login markup is incomplete')
  }

  let mode = 'login'
  let busy = false
  const configured = Boolean(flow)
  const show = (message) => {
    feedback.textContent = message
    feedback.hidden = false
  }
  const setBusy = (value) => {
    busy = value
    submit.disabled = value || !configured
    google.disabled = value || !configured
    forgot.disabled = value || !configured
    register.disabled = value || !configured
    signOut.disabled = value || !configured
  }
  const setMode = next => {
    mode = next
    username.setAttribute('autocomplete', next === 'login' ? 'username' : 'email')
    password.closest('.field').hidden = next === 'recovery'
    submit.textContent = next === 'login' ? 'Bejelentkezés' : next === 'registration' ? 'Regisztráció' : 'Visszaállító e-mail kérése'
    register.textContent = next === 'login' ? 'Regisztráció' : 'Bejelentkezés'
    forgot.textContent = next === 'recovery' ? 'Bejelentkezés' : 'Elfelejtett jelszó?'
    feedback.hidden = true
  }
  setBusy(false)
  signOut.hidden = true
  if (!configured) {
    show('A Grapes TEST hitelesítése még nincs konfigurálva. A meglévő bejelentkezés változatlanul működik.')
  }
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password'
    password.type = visible ? 'text' : 'password'
    toggle.setAttribute('aria-pressed', String(visible))
    toggle.setAttribute('aria-label', visible ? 'Jelszó elrejtése' : 'Jelszó megjelenítése')
  })
  register.addEventListener('click', () => { if (!busy && configured) setMode(mode === 'registration' ? 'login' : 'registration') })
  forgot.addEventListener('click', () => { if (!busy && configured) setMode(mode === 'recovery' ? 'login' : 'recovery') })
  google.addEventListener('click', async () => {
    if (busy || !configured) return
    setBusy(true)
    try {
      await flow.signInWithGoogle()
      show('Átirányítás a Google-bejelentkezésre…')
    } catch {
      show('A Google-bejelentkezés sikertelen vagy még nincs beállítva a TEST projektben.')
    } finally { setBusy(false) }
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (busy || !configured) return
    const identifier = username.value.trim()
    if (!identifier.includes('@')) {
      show('A tesztfázisban e-mail-címmel tudsz belépni. A felhasználónév még előkészítés alatt áll.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await flow.signInWithPassword(identifier, password.value)
        signOut.hidden = false
        show('Sikeres Grapes TEST-bejelentkezés. Az éles app és az adataid nem módosultak.')
      } else if (mode === 'registration') {
        const r = await flow.signUp(identifier, password.value)
        show(r.status === 'confirmation_required' ? 'Nézd meg az e-mail-fiókodat a regisztráció megerősítéséhez.' : 'Sikeres Grapes TEST-regisztráció.')
        if (r.status === 'authenticated') signOut.hidden = false
      } else {
        await flow.requestPasswordReset(identifier)
        show('Ha ehhez az e-mail-címhez tartozik fiók, érkezni fog jelszó-visszaállító levél.')
      }
    } catch {
      show('A művelet nem sikerült. Ellenőrizd az adatokat és a TEST-konfigurációt.')
    } finally {
      password.value = ''
      setBusy(false)
    }
  })
  signOut.addEventListener('click', async () => {
    if (busy || !configured) return
    setBusy(true)
    try {
      await flow.signOut()
      signOut.hidden = true
      show('Kijelentkeztél a Grapes TEST-fiókból.')
    } catch { show('A TEST-kijelentkezés nem sikerült.') }
    finally { setBusy(false) }
  })
  return { configured, getMode: () => mode }
}
