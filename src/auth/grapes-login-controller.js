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
  const separator = $('.separator')
  const footer = $('.footer-links')
  if ([form, username, password, google, register, forgot, toggle, submit, feedback, signOut, separator, footer].some(x => !x)) {
    throw new Error('Approved Grapes TEST login markup is incomplete')
  }

  let mode = 'login'
  let busy = false
  let authenticated = false
  const configured = Boolean(flow)
  const show = (message) => {
    feedback.textContent = message
    feedback.hidden = false
  }
  const setBusy = (value) => {
    busy = value
    submit.disabled = value || !configured || (authenticated && mode !== 'update')
    google.disabled = value || !configured || authenticated || mode === 'update'
    forgot.disabled = value || !configured || authenticated || mode === 'update'
    register.disabled = value || !configured || authenticated || mode === 'update'
    signOut.disabled = value || !configured
  }
  const renderState = () => {
    form.hidden = authenticated && mode !== 'update'
    google.hidden = authenticated || mode === 'update'
    separator.hidden = authenticated || mode === 'update'
    footer.hidden = authenticated || mode === 'update'
    signOut.hidden = !authenticated
    setBusy(busy)
  }
  const setMode = next => {
    mode = next
    username.setAttribute('autocomplete', next === 'login' ? 'username' : 'email')
    password.setAttribute('autocomplete', next === 'login' ? 'current-password' : 'new-password')
    username.closest('.field').hidden = next === 'update'
    password.closest('.field').hidden = next === 'recovery'
    submit.textContent = next === 'login' ? 'Bejelentkezés' : next === 'registration' ? 'Regisztráció' : next === 'update' ? 'Új jelszó mentése' : 'Visszaállító e-mail kérése'
    register.textContent = next === 'login' ? 'Regisztráció' : 'Bejelentkezés'
    forgot.textContent = next === 'recovery' ? 'Bejelentkezés' : 'Elfelejtett jelszó?'
    feedback.hidden = true
    renderState()
  }
  renderState()
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
  register.addEventListener('click', () => { if (!busy && configured && !authenticated && mode !== 'update') setMode(mode === 'registration' ? 'login' : 'registration') })
  forgot.addEventListener('click', () => { if (!busy && configured && !authenticated && mode !== 'update') setMode(mode === 'recovery' ? 'login' : 'recovery') })
  google.addEventListener('click', async () => {
    if (busy || !configured || authenticated || mode === 'update') return
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
    if (busy || !configured || (authenticated && mode !== 'update')) return
    const identifier = username.value.trim()
    if (mode !== 'update' && !identifier.includes('@')) {
      show('A tesztfázisban e-mail-címmel tudsz belépni. A felhasználónév még előkészítés alatt áll.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await flow.signInWithPassword(identifier, password.value)
        authenticated = true
        renderState()
        show('Sikeres Grapes TEST-bejelentkezés. Az éles app és az adataid nem módosultak.')
      } else if (mode === 'registration') {
        const r = await flow.signUp(identifier, password.value)
        show(r.status === 'confirmation_required' ? 'Nézd meg az e-mail-fiókodat a regisztráció megerősítéséhez.' : 'Sikeres Grapes TEST-regisztráció.')
        if (r.status === 'authenticated') { authenticated = true; renderState() }
      } else if (mode === 'update') {
        await flow.updatePassword(password.value)
        setMode('login')
        show('Sikeresen megváltoztattad a Grapes TEST-fiókod jelszavát.')
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
    if (busy || !configured || !authenticated) return
    setBusy(true)
    try {
      await flow.signOut()
      authenticated = false
      username.value = ''
      password.value = ''
      setMode('login')
      show('Kijelentkeztél a Grapes TEST-fiókból.')
    } catch { show('A TEST-kijelentkezés nem sikerült.') }
    finally { setBusy(false) }
  })
  return {
    configured,
    getMode: () => mode,
    setNotice: show,
    setRecoveryMode() {
      setMode('update')
      show('Adj meg egy új, legalább 8 karakteres jelszót a Grapes TEST-fiókodhoz.')
    },
    setSession(user) {
      const previous = authenticated
      authenticated = Boolean(user?.id)
      if (!authenticated && (previous || mode === 'update')) {
        username.value = ''
        password.value = ''
        setMode('login')
        show('A Grapes TEST-munkamenet véget ért. Újra bejelentkezhetsz.')
      }
      renderState()
      if (authenticated && mode !== 'update') show('Grapes TEST-fiók hitelesítve. A Health és az E-book adatai változatlanok.')
    },
  }
}
