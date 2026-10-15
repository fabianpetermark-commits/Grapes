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
    <form data-yazio-api-form class="sheet-form">
      <label>E-mail<input class="search" name="email" type="email" autocomplete="off" required></label>
      <label>YAZIO-jelszó<input class="search" name="password" type="password" autocomplete="off" required></label>
      <label>Ettől<input class="search" name="from" type="date" required></label>
      <label>Eddig<input class="search" name="to" type="date" required></label>
      <div class="yazio-api-actions"><button class="primary module-cta yazio-api-action" type="submit">Szinkronizálás</button>
      <button class="primary module-cta yazio-api-action yazio-api-guide-button" type="button" data-yazio-api-guide-open>Útmutató</button></div>
    </form>
    <p data-yazio-api-status role="status" aria-live="polite"></p>
    <div class="yazio-api-guide" data-yazio-api-guide hidden>
      <div class="yazio-api-guide-heading"><span data-yazio-guide-count></span><button type="button" class="quick-action" data-yazio-guide-close>Bezárás</button></div>
      <div class="yazio-api-guide-slide" aria-live="polite"><span class="yazio-api-guide-icon" data-yazio-guide-icon></span><h3 data-yazio-guide-title></h3><p data-yazio-guide-description></p></div>
      <div class="yazio-api-guide-navigation"><button type="button" class="quick-action" data-yazio-guide-prev>Előző</button><div class="yazio-api-guide-dots" data-yazio-guide-dots></div><button type="button" class="primary yazio-api-guide-next" data-yazio-guide-next>Következő</button></div>
    </div>`
  document.querySelector('.phone').append(sheet)
  const form = sheet.querySelector('form'), status = sheet.querySelector('[role="status"]')
  const submit = form.querySelector('button[type="submit"]')
  const guide = sheet.querySelector('[data-yazio-api-guide]')
  const guideSlides = [
    { icon: '✉', title: 'E-mailes YAZIO-fiók', description: 'Ha e-mail-címmel és jelszóval használod a YAZIO-t, egyszerűen add meg ezeket a szinkronizálási űrlapon, válaszd ki az időszakot, majd nyomd meg a Szinkronizálás gombot.' },
    { icon: '↪', title: 'Google-belépés esetén: kijelentkezés', description: 'A YAZIO alkalmazásban nyisd meg: Profil → Beállítások → Fiók → Kijelentkezés. A naplódat ez nem törli.' },
    { icon: '@', title: 'Folytatás e-mail-címmel', description: 'A bejelentkezési képernyőn válaszd a „Folytatás e-mail-címmel” lehetőséget, majd az „Elfelejtetted a jelszavadat?” hivatkozást.' },
    { icon: '✉', title: 'Jelszó-visszaállítás', description: 'Add meg a Google-belépéshez használt e-mail-címedet. Nyisd meg a YAZIO-tól kapott levelet, válaszd a jelszó visszaállítását, és állíts be új YAZIO-jelszót. A Google-fiókod jelszavát nem kell megváltoztatni.' },
    { icon: '✓', title: 'Ellenőrizd az új belépést', description: 'Térj vissza a YAZIO-hoz. A „Folytatás e-mail-címmel” lehetőségnél lépj be a Google-fiókodhoz tartozó e-mail-címmel és az új YAZIO-jelszóval.' },
    { icon: '⇄', title: 'Szinkronizálás a Grapesben', description: 'Ha a YAZIO-ba sikerült belépned, a Grapesben is add meg ugyanezt az e-mail-címet és az új YAZIO-jelszót. Válaszd ki a dátumokat, majd indítsd a szinkronizálást. Az eredményeket mentés előtt ellenőrizheted.' },
  ]
  let guideIndex = 0
  function renderGuide() {
    const slide = guideSlides[guideIndex]
    sheet.querySelector('[data-yazio-guide-count]').textContent = `${guideIndex + 1} / ${guideSlides.length}`
    sheet.querySelector('[data-yazio-guide-icon]').textContent = slide.icon
    sheet.querySelector('[data-yazio-guide-title]').textContent = slide.title
    sheet.querySelector('[data-yazio-guide-description]').textContent = slide.description
    sheet.querySelector('[data-yazio-guide-prev]').disabled = guideIndex === 0
    sheet.querySelector('[data-yazio-guide-next]').textContent = guideIndex === guideSlides.length - 1 ? 'Befejezés' : 'Következő'
    sheet.querySelector('[data-yazio-guide-dots]').textContent = guideSlides.map((_, index) => index === guideIndex ? '●' : '○').join(' ')
  }
  sheet.querySelector('[data-yazio-api-guide-open]').addEventListener('click', () => { guideIndex = 0; guide.hidden = false; renderGuide(); guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) })
  sheet.querySelector('[data-yazio-guide-close]').addEventListener('click', () => { guide.hidden = true })
  sheet.querySelector('[data-yazio-guide-prev]').addEventListener('click', () => { if (guideIndex > 0) { guideIndex--; renderGuide() } })
  sheet.querySelector('[data-yazio-guide-next]').addEventListener('click', () => { if (guideIndex < guideSlides.length - 1) { guideIndex++; renderGuide() } else guide.hidden = true })
  let busy = false, cancelled = false
  new MutationObserver(() => {
    if (!sheet.classList.contains('is-open')) {
      form.elements.password.value = ''
      if (busy) cancelled = true
    }
  }).observe(sheet, { attributes: true, attributeFilter: ['class'] })
  const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const checkCancelled = () => { if (cancelled || !sheet.classList.contains('is-open')) throw new Error('A lekérés megszakítva. Nem történt import.') }

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
      const today = new Date(), start = new Date(today.getFullYear(), 0, 1)
      form.elements.from.value = dateString(start)
      form.elements.to.value = dateString(today)
      form.elements.to.max = dateString(today); form.elements.from.max = dateString(today)
      status.textContent = ''; form.elements.password.value = ''; guide.hidden = true
    }
    openSheet(sheet)
  } }
}
