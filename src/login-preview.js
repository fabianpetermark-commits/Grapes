// Approved login UI preview. No credential values are read, saved, or sent.
export function initLoginPreview(root = document) {
  const feedback = root.querySelector('#grapes-feedback')
  const password = root.querySelector('#grapes-password')
  const toggle = root.querySelector('#toggle-password')
  const showInfo = (message) => {
    feedback.textContent = message
    feedback.hidden = false
  }

  root.querySelector('#google-sign-in').addEventListener('click', () => {
    showInfo('A Google-bejelentkezés a Grapes Supabase Auth integrációjával válik elérhetővé.')
  })
  root.querySelector('#grapes-login-form').addEventListener('submit', (event) => {
    event.preventDefault()
    showInfo('Ez egy felületi prototípus. A bejelentkezés még nincs bekötve, ezért nem történik fiókellenőrzés.')
  })
  root.querySelector('#forgot-password').addEventListener('click', () => {
    showInfo('A jelszó-visszaállítás a Supabase Auth integrációja után lesz elérhető.')
  })
  root.querySelector('#register').addEventListener('click', () => {
    showInfo('A regisztráció a Supabase Auth integrációja után lesz elérhető.')
  })
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password'
    password.type = visible ? 'text' : 'password'
    toggle.setAttribute('aria-pressed', String(visible))
    toggle.setAttribute('aria-label', visible ? 'Jelszó elrejtése' : 'Jelszó megjelenítése')
  })
}

if (typeof document !== 'undefined' && document.querySelector('#grapes-login-form')) {
  initLoginPreview()
}
