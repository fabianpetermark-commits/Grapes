import { isGrapesAndroidApp, requestAndroidYazio } from '../android-bridge.js'
import { readYazioApiBundle, yazioDateRange } from './yazio-api-import.js'

export function createYazioApiPanel({ openSheet, closeSheet, importBundle, openFileImport, getProfileKey }) {
  const sheet = document.createElement('section')
  sheet.className = 'bottom-sheet'
  sheet.dataset.yazioApiSheet = ''
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-label', 'YAZIO-kapcsolat'); sheet.setAttribute('aria-hidden', 'true'); sheet.inert = true
  sheet.innerHTML = `<div class="sheet-handle"></div><h2>YAZIO-kapcsolat</h2>
    <p>Az étkezéseidet közvetlenül a YAZIO-ból kérjük le. Mentés előtt átnézheted a találatokat.</p>
    <p>Nem hivatalos kapcsolat. E-mailes YAZIO-belépés szükséges; Google- vagy Apple-belépés itt nem használható. A jelszó csak a YAZIO-hoz kerül, nem mentjük el.</p>
    <form data-yazio-api-form class="sheet-form">
      <label>E-mail<input class="search" name="email" type="email" autocomplete="off" required></label>
      <label>YAZIO-jelszó<input class="search" name="password" type="password" autocomplete="off" required></label>
      <label>Ettől<input class="search" name="from" type="date" required></label>
      <label>Eddig<input class="search" name="to" type="date" required></label>
      <p>Legfeljebb 31 nap. Az API-s import most a termékként naplózott ételeket veszi át; a kimaradó recepteket és egyéb tételeket jelzi.</p>
      <button class="primary module-cta" type="submit">Belépés és beolvasás</button>
    </form>
    <p data-yazio-api-status role="status" aria-live="polite"></p>
    <button class="quick-action" type="button" data-yazio-api-cancel>Mégse</button>
    <button class="quick-action" type="button" data-yazio-api-files>Fájlimport és visszavonás</button>`
  document.querySelector('.phone').append(sheet)
  const form = sheet.querySelector('form'), status = sheet.querySelector('[role="status"]')
  const submit = form.querySelector('button')
  let busy = false, cancelled = false
  new MutationObserver(() => {
    if (!sheet.classList.contains('is-open')) {
      form.elements.password.value = ''
      if (busy) cancelled = true
    }
  }).observe(sheet, { attributes: true, attributeFilter: ['class'] })
  sheet.querySelector('[data-yazio-api-files]').addEventListener('click', () => { if (!busy) openFileImport() })
  const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const checkCancelled = () => { if (cancelled || !sheet.classList.contains('is-open')) throw new Error('A lekérés megszakítva. Nem történt import.') }
  sheet.querySelector('[data-yazio-api-cancel]').addEventListener('click', () => {
    cancelled = true
    form.elements.password.value = ''
    if (busy) status.textContent = 'Megszakítás…'
    else closeSheet()
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (busy) return
    if (!isGrapesAndroidApp()) { status.textContent = 'A közvetlen YAZIO-kapcsolat az Android appban használható.'; return }
    let session = ''
    try {
      const targetProfile = getProfileKey()
      const from = form.elements.from.value, to = form.elements.to.value
      yazioDateRange(from, to)
      if (to > dateString(new Date())) throw new Error('Jövőbeli nap nem kérhető le.')
      busy = true; cancelled = false; submit.disabled = true
      status.textContent = 'Belépés a YAZIO-ba…'
      const login = requestAndroidYazio('login', form.elements.email.value.trim(), form.elements.password.value)
      form.elements.password.value = ''
      session = (await login).session
      checkCancelled()
      const bundle = await readYazioApiBundle({ from, to, checkCancelled,
        request: (operation, value) => requestAndroidYazio(operation, session, value),
        onProgress: message => { status.textContent = message } })
      checkCancelled()
      if (getProfileKey() !== targetProfile) throw new Error('A Grapes-fiók megváltozott. Indítsd újra a beolvasást.')
      if (!bundle.nutrition_log.length) {
        status.textContent = ['Ebben az időszakban nincs importálható termékbejegyzés.', ...bundle.warnings.map(row => row.message)].join(' ')
        return
      }
      closeSheet()
      try { await importBundle(JSON.stringify(bundle)) }
      catch (error) { openSheet(sheet); throw error }
    } catch (error) { status.textContent = error?.message || 'A YAZIO-lekérés nem sikerült.' }
    finally {
      form.elements.password.value = ''
      if (session) await requestAndroidYazio('logout', session).catch(() => {})
      busy = false; submit.disabled = false
    }
  })
  return { open() {
    if (!busy) {
      const today = new Date(), start = new Date(); start.setDate(start.getDate() - 6)
      form.elements.from.value = dateString(start)
      form.elements.to.value = dateString(today)
      form.elements.to.max = dateString(today); form.elements.from.max = dateString(today)
      status.textContent = ''; form.elements.password.value = ''
    }
    openSheet(sheet)
  } }
}
