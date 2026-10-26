import {
  connectGrapesDrive,
  disconnectGrapesDrive,
  getGrapesAccount,
  isGrapesDriveConnected,
  listGrapesProjects,
  onGrapesDriveChange,
} from './storage/grapes-drive.js'
import { listLocalProjects, claimLocalWaterOwner, getLocalWaterOwner } from './storage/local-project-store.js'
import { listMobileEbooks, saveMobileReadingProgress, uploadMobileEbook } from './ebook-mobile-library.js'
import { isMobileReadableEpub, normalizedReadingProgress, openMobileEpub } from './ebook-mobile-reader.js'
import { openEpubContent } from './ebook/epub-content.js'
import { createMobileFoodController } from './food/food-mobile.js'
import { createYazioApiPanel } from './food/yazio-api-panel.js'
import { registerFoodSharing, sendMealShare, sendRecipeShare } from './food/food-sharing-client.js'
import { hydrateMobileIcons, mobileIconSvg } from './android-mobile-icons.js'
import { createHomeMobile } from './home/home-mobile.js'
import { getAndroidAppUpdate, getAndroidTestAuthEnabled, getAndroidTestAuthSubject, requestAndroidTestAccountSignOut, installAndroidAppUpdate, isGrapesAndroidApp, openAndroidHealthConnectSettings, readAndroidHealthExport, saveAndroidJsonBackup, saveAndroidVerifiedHealthBackup } from './android-bridge.js'
import { waterBackupToJson, waterBackupFromJson, readWaterStoreStrict, waterBackupSummary,
  writeWaterStoreVerified, restoreWaterBackupVerified } from './water/water-backup.js'
import { waterProfileKey, readProfileWater, inspectLegacyWater, claimLegacyWater,
  profileWaterBackupToJson, profileWaterBackupFromJson } from './water/water-profile-store.js'
import {
  isMobileShareableBook,
  isTrustedPairingMessage,
  prepareMobileBookTransfer,
  prepareMobileLibraryPairing,
  revokeMobileBookTransfer,
} from './ebook-mobile-transfer.js'

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
const login = $('#login')
const app = $('#app')
const title = $('#app-title')
const subtitle = $('#app-subtitle')
const fab = $('[data-fab]')
const toast = $('.toast')
const sheet = $('[data-food-add-sheet]')
const sheetBackdrop = $('.sheet-backdrop')
const LOCAL_MODE_KEY = 'grapes-local-mode'
const WATER_STORE_KEY = 'grapes-water-v1'
// Fresh-owner rollout deliberately skips ALL unclaimed legacy Water and
// project storage. Default OFF until Food/Finance/E-book boundaries also pass.
const FRESH_OWNER_MODULES = isGrapesAndroidApp() &&
  import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true' &&
  import.meta.env?.VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED === 'true'
const WATER_PROFILE_QA = FRESH_OWNER_MODULES ||
  (import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_WATER_PROFILE_ENABLED === 'true')
const SYNTHETIC_WATER_PROFILE = '00000000-0000-4000-8000-000000000001'
let activeWaterProfileId = null
let freshWaterSession = null
let waterProfileLoading = null
let waterProfileGeneration = 0
let legacyWaterOwner = null
const waterStorageKey = () => WATER_PROFILE_QA
  ? waterProfileKey(activeWaterProfileId) : WATER_STORE_KEY
const SYNC_CHECK_KEY = 'grapes-sync-last-check-v1'
const UPDATE_READ_KEY = 'grapes-update-read-v1'
const moduleFolders = [
  ['Ételnapló', 'food', 'food'],
  ['Pénzügyi Napló', 'finance', 'finance'],
  ['QR & Barcode', 'qr', 'qr'],
  ['Számla és árajánlat', 'billing', 'billing'],
  ['2D Studio', 'brochure', 'brochure'],
  ['3D Studio', 'studio', 'studio'],
  ['E-mail Stúdió', 'email', 'email'],
]
let mobileEbooks = []
// Fresh-owner E-book never borrows the legacy Drive user or local progress.
let freshEbookPromise = null
let freshEbookEpoch = 0
let mobileReader = null
let mobileReaderBook = null
let mobileReaderChapterIndex = 0
let mobileReaderSaveTimer = null
let activeTransferBookId = ''
let activePairingNonce = ''
let mobileFood = null
const household = createHomeMobile($('[data-household-root]'), undefined,
  { freshOwnerMode: FRESH_OWNER_MODULES })
let activePage = 'home'
let menuReturnPage = ''
let menuEntry = ''
let availableAppUpdate = null
let activeSyncImport = ''
let yazioDirectEpoch = 0
let yazioPreviewEpoch = 0
let freshYazioPreview = null
let freshYazioSession = null
const freshYazioSheet = FRESH_OWNER_MODULES ? document.createElement('section') : null
if (freshYazioSheet) {
  freshYazioSheet.className = 'bottom-sheet'
  freshYazioSheet.dataset.freshYazioSheet = ''
  freshYazioSheet.setAttribute('role', 'dialog')
  freshYazioSheet.setAttribute('aria-modal', 'true')
  freshYazioSheet.setAttribute('aria-label', 'Saját YAZIO import előnézete')
  freshYazioSheet.setAttribute('aria-hidden', 'true')
  freshYazioSheet.inert = true
  freshYazioSheet.innerHTML = `<div class="sheet-handle"></div>
    <h2>YAZIO · Saját Food napló</h2>
    <p>Az import kézzel indítható. Az étkezések csak jóváhagyás után,
       az aktuális Grapes-fiókba kerülnek.</p>
    <p data-fresh-yazio-summary role="status"></p>
    <p data-fresh-yazio-warning></p>
    <div class="sheet-results" data-fresh-yazio-records></div>
    <button class="primary module-cta" type="button"
      data-fresh-yazio-confirm hidden>Megjelölt étkezések importálása</button>
    <p data-fresh-yazio-status role="status"></p>`
  document.querySelector('.phone').append(freshYazioSheet)
}
const freshYazioDirectSheet = FRESH_OWNER_MODULES ? document.createElement('section') : null
if (freshYazioDirectSheet) {
  freshYazioDirectSheet.className = 'bottom-sheet'
  freshYazioDirectSheet.dataset.freshYazioDirectSheet = ''
  freshYazioDirectSheet.setAttribute('role', 'dialog')
  freshYazioDirectSheet.setAttribute('aria-modal', 'true')
  freshYazioDirectSheet.setAttribute('aria-label', 'YAZIO egyszeri bejelentkezés')
  freshYazioDirectSheet.setAttribute('aria-hidden', 'true')
  freshYazioDirectSheet.inert = true
  freshYazioDirectSheet.innerHTML = `<div class="sheet-handle"></div>
    <h2>YAZIO · Egyszeri beolvasás</h2>
    <p>A bejelentkezés kizárólag ehhez a kézi importhoz használható.
       A YAZIO-jelszót és a munkamenetet nem mentjük el.</p>
    <form data-fresh-yazio-direct-form class="sheet-form">
      <label>YAZIO e-mail
        <input class="search" type="email" name="email" autocomplete="off" required></label>
      <label>YAZIO jelszó
        <input class="search" type="password" name="password" autocomplete="off" required></label>
      <label>Ettől
        <input class="search" type="date" name="from" required></label>
      <label>Eddig
        <input class="search" type="date" name="to" required></label>
      <button class="primary module-cta" type="submit">Adatok beolvasása</button>
    </form>
    <p data-fresh-yazio-direct-status role="status"></p>`
  document.querySelector('.phone').append(freshYazioDirectSheet)
  const directButton = document.createElement('button')
  directButton.type = 'button'
  directButton.dataset.freshYazioDirectOpen = ''
  directButton.textContent = 'Egyszeri fiókbeolvasás'
  $('[data-yazio-import]').closest('.sync-provider').append(directButton)
}
let waterHealthEpoch = 0
let waterHealthPreview = null
let waterHealthSession = null
const waterHealthSheet = FRESH_OWNER_MODULES ? document.createElement('section') : null
if (waterHealthSheet) {
  waterHealthSheet.className = 'bottom-sheet'
  waterHealthSheet.dataset.waterHealthSheet = ''
  waterHealthSheet.setAttribute('role', 'dialog')
  waterHealthSheet.setAttribute('aria-modal', 'true')
  waterHealthSheet.setAttribute('aria-label', 'Health Connect vízimport')
  waterHealthSheet.setAttribute('aria-hidden', 'true')
  waterHealthSheet.inert = true
  waterHealthSheet.innerHTML = `<div class="sheet-handle"></div>
    <h2>Health Connect · Víznapló</h2>
    <p>Csak a saját Water-naplódba mentünk, külön jóváhagyás után.
       Az étkezési adatok nem kerülnek ide, az automatikus import kikapcsolva.</p>
    <div class="sheet-form"><label>Vízadatok ettől a naptól
      <input class="search" type="date" data-water-health-from></label></div>
    <button class="primary module-cta" type="button" data-water-health-read>Vízadatok előnézete</button>
    <p data-water-health-summary role="status"></p>
    <div class="sheet-results" data-water-health-records></div>
    <button class="primary module-cta" type="button" data-water-health-confirm hidden>Kijelölt vízbejegyzések mentése</button>
    <p data-water-health-status role="status"></p>`
  document.querySelector('.phone').append(waterHealthSheet)
  const waterButton = document.createElement('button')
  waterButton.type = 'button'
  waterButton.dataset.waterHealthOpen = ''
  waterButton.textContent = 'Vízimport'
  waterButton.title = 'Health Connect vízbejegyzések kézi importálása saját Water-naplóba'
  $('[data-health-sync]').closest('.sync-provider').append(waterButton)
}
let activeWaterImportSource = 'health'
const samsungWaterFileInput = FRESH_OWNER_MODULES ? document.createElement('input') : null
if (samsungWaterFileInput) {
  samsungWaterFileInput.type = 'file'
  samsungWaterFileInput.accept = '.csv,text/csv'
  samsungWaterFileInput.hidden = true
  samsungWaterFileInput.dataset.samsungWaterCsvInput = ''
  document.querySelector('.phone').append(samsungWaterFileInput)
  const samsungButton = $('[data-samsung-sync-action]')
  samsungButton.textContent = 'CSV-import'
  samsungButton.title = 'Samsung Health személyes adatok → water_intake CSV → saját Water'
  const description = samsungButton.closest('.sync-provider')?.querySelector('div > span')
  if (description) description.textContent =
    'Vízadatok a Samsung Health exportált CSV-fájljából'
}
document.addEventListener('grapes:food-subtitle', event => {
  if (activePage === 'food') subtitle.textContent = event.detail?.subtitle || 'Mai áttekintés'
})

const labels = {
  home: ['Grapes', 'Mobil munkaterület'], projects: ['Projektek', 'Helyi és Drive'],
  sync: ['Szinkron', 'Adatok és fiók'], more: ['Beállítások', 'Fiók és alkalmazás'],
  food: ['Ételnapló', 'Mai áttekintés'], water: ['Víz', 'Napi folyadékbevitel'],
  household: ['Home / Háztartás', 'Ezen az eszközön tárolva'],
  'hub-home': ['Home', 'Háztartás'],
  'hub-health': ['Health', 'Ételnapló és receptek'],
  'hub-utility': ['Utility', 'Eszközök'],
  'hub-finance': ['Finance', 'Pénzügyek'],
  ebook: ['E-book', 'Könyvtár'], reader: ['A csend térképe', 'Olvasó'],
  transfer: ['E-book átvitel', 'Olvasóeszköz'],
}

function localMode() {
  try { return localStorage.getItem(LOCAL_MODE_KEY) === '1' } catch { return false }
}

function setLocalMode(enabled) {
  try { enabled ? localStorage.setItem(LOCAL_MODE_KEY, '1') : localStorage.removeItem(LOCAL_MODE_KEY) } catch {}
}

function updateHomeGreeting(date = new Date()) {
  const hour = date.getHours()
  const greeting = hour >= 5 && hour < 11
    ? 'Jó reggelt'
    : hour >= 11 && hour < 18
      ? 'Jó napot'
      : 'Jó estét'
  const label = $('[data-home-greeting]')
  if (label) label.textContent = greeting
}

function showToast(message) {
  toast.textContent = message
  toast.classList.add('is-visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2400)
}

function closeSheet() {
  if (freshYazioDirectSheet?.classList.contains('is-open')) {
    ++yazioDirectEpoch
    const form = $('[data-fresh-yazio-direct-form]')
    form.elements.email.value = ''
    form.elements.password.value = ''
  }
  if (freshYazioSheet?.classList.contains('is-open')) {
    yazioPreviewEpoch++
    freshYazioPreview = null
    freshYazioSession = null
    $('[data-fresh-yazio-records]').replaceChildren()
  }
  // Any closing/opening of a sheet invalidates the old Health preview,
  // including pending Android permission requests and account changes.
  waterHealthEpoch++
  waterHealthPreview = null
  waterHealthSession = null
  $$('.bottom-sheet').forEach(node => {
    node.classList.remove('is-open')
    node.setAttribute('aria-hidden', 'true')
    node.inert = true
  })
  sheetBackdrop.classList.remove('is-open')
}

// Shared drag-to-dismiss behavior: only the handle starts a drag, never the scrolling content.
function installSheetGestures() {
  const fields = sheet => [...sheet.querySelectorAll('input:not([type="file"]), select, textarea')]
    .map(field => [field.name || field.id || field.dataset?.field || '', field.type === 'checkbox' ? field.checked : field.value])
  function dismiss(sheet) {
    const changed = sheet.dataset.sheetInitialValues !== JSON.stringify(fields(sheet))
    const hasForm = !!sheet.querySelector('input:not([type="file"]), textarea, select')
    if (changed && hasForm && !window.confirm('A nem mentett módosítások elvesznek. Bezárod?')) return false
    if (activePage === 'food' && mobileFood?.handleBack()) return true
    closeSheet()
    return true
  }
  document.querySelectorAll('.bottom-sheet').forEach(sheet => {
    const handle = sheet.querySelector('.sheet-handle')
    if (!handle) return
    handle.setAttribute('role', 'button')
    handle.setAttribute('tabindex', '0')
    handle.setAttribute('aria-label', 'Panel bezárása')
    handle.style.touchAction = 'none'
    let drag = null
    const reset = () => {
      drag = null
      sheet.style.removeProperty('transform')
      sheet.style.removeProperty('transition')
    }
    const snapBack = () => {
      drag = null
      sheet.style.transition = 'transform 180ms ease-out'
      sheet.style.transform = 'translateY(0)'
      sheet.addEventListener('transitionend', () => {
        if (sheet.classList.contains('is-open')) {
          sheet.style.removeProperty('transform')
          sheet.style.removeProperty('transition')
        }
      }, { once: true })
    }
    handle.addEventListener('pointerdown', event => {
      if (!sheet.classList.contains('is-open') || event.button !== 0) return
      drag = { id: event.pointerId, y: event.clientY, delta: 0 }
      handle.setPointerCapture(event.pointerId)
      sheet.style.transition = 'none'
    })
    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return
      drag.delta = Math.max(0, event.clientY - drag.y)
      sheet.style.transform = `translateY(${drag.delta}px)`
    })
    handle.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return
      const shouldDismiss = drag.delta >= 90
      if (shouldDismiss && dismiss(sheet)) {
        reset()
      } else {
        snapBack()
      }
    })
    handle.addEventListener('pointercancel', reset)
    handle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(sheet) }
    })
    new MutationObserver(() => {
      if (sheet.classList.contains('is-open')) {
        sheet.dataset.sheetInitialValues = JSON.stringify(fields(sheet))
      } else reset()
    }).observe(sheet, { attributes: true, attributeFilter: ['class'] })
  })
}

function setSyncProviderStatus(message, state = '') {
  const status = $('[data-yazio-status]')
  if (!status) return
  status.textContent = message
  status.dataset.state = state
}

function openSyncImport(provider) {
  if (FRESH_OWNER_MODULES && !['health', 'yazio'].includes(provider)) {
    showToast('Ez az importkapcsolat még nincs Grapes-fiókhoz kötve.')
    return
  }
  activeSyncImport = provider
  const title = $('[data-sync-import-title]')
  const copy = $('[data-sync-import-copy]')
  const details = $('[data-sync-import-details]')
  const confirm = $('[data-sync-import-confirm]')
  const undo = $('[data-yazio-undo]')
  const healthRange = $('[data-sync-health-range]')
  const healthFrom = $('[data-sync-health-from]')
  const healthSettings = $('[data-sync-health-settings]')
  const configs = {
    health: {
      title: 'Health Connect import', action: 'Egészségadatok beolvasása',
      copy: 'A Grapes csak az általad engedélyezett étel- és vízbejegyzéseket olvassa. Az Android szükség esetén engedélyt kér.',
      details: ['Az import előtt átnézheted a találatokat.', 'A már korábban átvett rekordok nem kerülnek be kétszer.'],
    },
    samsung: {
      title: 'Samsung Health import', action: 'Samsung-adatok beolvasása',
      copy: 'A Grapes először a Samsung Health közvetlen vízadatait próbálja beolvasni. Ha a Samsung-adatkapcsolat nincs elérhető, a Health Connect megosztást kell bekapcsolnod a Samsung Healthben.',
      details: ['Samsung Health: Beállítások → Health Connect → Adatmegosztás.', 'Az import előtt mindig megjelenik az előnézet.'],
    },
    yazio: {
      title: 'YAZIO export importálása', action: 'Fájl kiválasztása',
      copy: 'Válaszd ki a YAZIO-ból exportált JSON-fájlt vagy a nutrition_log.csv fájlt. A következő Android fájlválasztó a rendszer része; a Grapes az import előtt ellenőrzi a fájlt.',
      details: ['JSON esetén előnézetet kapsz, és csak jóváhagyás után változik a napló.', 'Legfeljebb 40 MB-os export importálható.'],
    },
  }
  const config = configs[provider]
  if (FRESH_OWNER_MODULES && provider === 'yazio') {
    config.title = 'YAZIO export – saját Food-fiók'
    config.action = 'JSON vagy CSV fájl kiválasztása'
    config.copy = 'Válassz korábban exportált YAZIO JSON- vagy nutrition_log.csv-fájlt. Előnézet, kijelölés és fiókonkénti mentés követi.'
    config.details = [
      'A közvetlen YAZIO-beolvasás a külön Egyszeri fiókbeolvasás gombbal érhető el. Az automatikus import még nem elérhető.',
      'A mentés csak a saját Grapes TEST-fiókodban, külön jóváhagyással történik.',
      'Az utolsó import biztonságosan visszavonható; szerkesztett bejegyzéseket nem törlünk.',
    ]
  }
  if (FRESH_OWNER_MODULES && provider === 'health') {
    config.copy = 'Csak a saját Grapes-fiókba, külön jóváhagyás után importálhatók a Health Connect étkezései. A vízadatok, a régi naplók és a Drive továbbra sem kerülnek át.'
    config.details = ['Csak az engedélyezett Health Connect-adatokat olvassuk, amikor ezt a gombot megnyomod.',
      'Az étkezéseket itt jelölheted ki; a vízhez a külön Vízimport gombot használd.',
      'A Health Connect engedélyei az Androidban külön kezelhetők.']
  }
  title.textContent = config.title; copy.textContent = config.copy; confirm.textContent = config.action
  details.replaceChildren(...config.details.map(text => { const row = document.createElement('div'); row.className = 'sheet-result'; row.textContent = text; return row }))
  $('[data-sync-import-status]').textContent = ''
  undo.hidden = provider !== 'yazio'
  healthRange.hidden = !['health', 'samsung'].includes(provider)
  healthSettings.hidden = healthRange.hidden || !isGrapesAndroidApp()
  if (!healthRange.hidden) {
    const today = new Date(), from = new Date()
    from.setFullYear(from.getFullYear() - 1)
    const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    healthFrom.max = localDay(today); healthFrom.value = localDay(from)
  }
  openSheet($('[data-sync-import-sheet]'))
}

async function runSyncImport() {
  if (FRESH_OWNER_MODULES && !['health', 'yazio'].includes(activeSyncImport)) {
    showToast('Ez az import még nincs fiókhoz kötve.')
    return
  }
  const provider = activeSyncImport
  const status = $('[data-sync-import-status]')
  if (!provider) return
  if (provider === 'yazio') {
    closeSheet(); setSyncProviderStatus('Válaszd ki a YAZIO-exportot a fájlválasztóban.'); $('[data-yazio-input]').click(); return
  }
  status.textContent = 'Kapcsolat előkészítése…'
  try {
    const needsHealthDate = ['health', 'samsung'].includes(provider)
    const fromDate = needsHealthDate ? $('[data-sync-health-from]').value : ''
    if (needsHealthDate && !fromDate) throw new Error('Válassz kezdődátumot.')
    closeSheet()
    await mobileFood.load()
    const preview = provider === 'samsung'
      ? await mobileFood.openSamsungImport({ fromDate })
      : await mobileFood.openHealthImport({ fromDate })
    if (preview) setSyncProviderStatus(`${provider === 'samsung' ? 'Samsung Health / Health Connect' : 'Health Connect'}: ${preview.counts.ready} új, ${preview.counts.duplicate} korábbi, ${preview.counts.invalid} hibás rekord.`)
  } catch (error) {
    setSyncProviderStatus(error?.message || 'Az import most nem indítható el.', 'error')
  }
}

function openSheet(node) {
  if (!node) return
  closeSheet()
  node.inert = false
  node.setAttribute('aria-hidden', 'false')
  node.classList.add('is-open')
  sheetBackdrop.classList.add('is-open')
}

function openWaterHealthSheet(provider = 'health') {
  if (!FRESH_OWNER_MODULES || !waterHealthSheet) return
  activeWaterImportSource = provider === 'samsung' ? 'samsung' : 'health'
  openSheet(waterHealthSheet)
  const samsung = activeWaterImportSource === 'samsung'
  $('[data-water-health-sheet] h2').textContent = samsung
    ? 'Samsung Health · Vízexport' : 'Health Connect · Víznapló'
  $('[data-water-health-sheet] p').textContent = samsung
    ? 'Válaszd a Samsung Health személyesadat-exportjának com.samsung.health.water_intake…csv fájlját. Csak a saját Water-fiókodba, külön jóváhagyással mentünk. A közvetlen Samsung SDK ebben a TEST-csomagban nincs telepítve.'
    : 'Csak a saját Water-naplódba mentünk, külön jóváhagyás után. Az étkezési adatok nem kerülnek ide, az automatikus import kikapcsolva.'
  $('[data-water-health-from]').closest('.sheet-form').hidden = samsung
  $('[data-water-health-from]').closest('.sheet-form').style.display = samsung ? 'none' : ''
  $('[data-water-health-read]').textContent = samsung
    ? 'Samsung víz-CSV kiválasztása' : 'Vízadatok előnézete'
  const now = new Date()
  const from = new Date(now)
  from.setFullYear(from.getFullYear() - 1)
  const fmt = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')].join('-')
  $('[data-water-health-from]').max = fmt(now)
  $('[data-water-health-from]').value = fmt(from)
  $('[data-water-health-records]').replaceChildren()
  $('[data-water-health-summary]').textContent = ''
  $('[data-water-health-status]').textContent = ''
  $('[data-water-health-confirm]').hidden = true
}

async function readWaterHealthPreview(file = null) {
  if (!FRESH_OWNER_MODULES || !waterHealthSheet?.classList.contains('is-open')) return
  // A new user request invalidates the prior preview before opening Android.
  waterHealthPreview = null
  waterHealthSession = null
  const epoch = ++waterHealthEpoch
  const button = $('[data-water-health-read]')
  button.disabled = true
  $('[data-water-health-confirm]').hidden = true
  $('[data-water-health-records]').replaceChildren()
  $('[data-water-health-summary]').textContent = ''
  const status = $('[data-water-health-status]')
  status.textContent = 'A saját Water-fiók ellenőrzése…'
  try {
    const fromDate = $('[data-water-health-from]').value
    const samsung = activeWaterImportSource === 'samsung'
    if (samsung !== Boolean(file)) {
      throw new Error('A Samsung Health importjához víz-CSV kiválasztása szükséges.')
    }
    if (!samsung && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fromDate)) {
      throw new Error('Válassz kezdődátumot.')
    }
    if (file && file.size > 15 * 1024 * 1024) {
      throw new Error('A Samsung víz-CSV legfeljebb 15 MB lehet.')
    }
    const [{ openGrapesTestFreshWater }, { prepareFreshOwnerWaterHydration }] =
      await Promise.all([
        import('./water/grapes-test-fresh-water.js'),
        import('./water/grapes-test-fresh-water-health.js'),
      ])
    const session = await openGrapesTestFreshWater({ enabled: true })
    await session.assertOwner()
    status.textContent = samsung
      ? 'Samsung Health vízexport ellenőrzése…'
      : 'Health Connect engedélyek és vízadatok beolvasása…'
    const source = samsung
      ? (await import('./water/grapes-test-samsung-water-csv.js'))
          .parseSamsungWaterCsv(await file.text(), { filename: file.name })
      : await readAndroidHealthExport(fromDate)
    await session.assertOwner()
    const own = await session.read()
    const preview = prepareFreshOwnerWaterHydration(source, {
      ownerId: session.ownerId, existingDays: own.data,
    })
    await session.assertOwner()
    if (epoch !== waterHealthEpoch || !waterHealthSheet.classList.contains('is-open')) return
    waterHealthSession = session
    waterHealthPreview = preview
    const rows = $('[data-water-health-records]')
    for (const item of preview.records) {
      const label = document.createElement('label')
      label.className = 'sheet-result'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.dataset.waterHealthRecord = ''
      input.value = String(item.index)
      input.disabled = item.status !== 'ready'
      input.checked = item.status === 'ready'
      const description = document.createElement('span')
      const name = item.record?.type === 'nutrition' ? 'Étkezés · Food'
        : item.entry?.occurredAt
          ? new Date(item.entry.occurredAt).toLocaleString('hu-HU') +
            ' · ' + Number(item.entry.amount).toLocaleString('hu-HU') + ' ml'
          : 'Hibás Health vízadat'
      description.textContent = name + ' · ' +
        ({ ready: 'új', duplicate: 'korábban importálva',
          blocked: 'Food modulhoz tartozik', invalid: 'hibás' }[item.status] || '') +
        (item.error ? ' · ' + item.error : '')
      label.append(input, description)
      rows.append(label)
    }
    $('[data-water-health-summary]').textContent =
      `${preview.counts.ready} új vízbejegyzés · ${preview.counts.duplicate} már importálva · ${preview.counts.invalid} hibás · ${preview.counts.blocked} étkezés kihagyva`
    $('[data-water-health-confirm]').hidden = preview.counts.ready === 0
    status.textContent = 'Ellenőrizd a kijelölést. Mentés csak a jóváhagyás után.'
  } catch (error) {
    if (epoch === waterHealthEpoch) {
      status.textContent = 'A vízimport előnézete leállt: ' + (error?.message || 'ismeretlen hiba')
    }
  } finally {
    if (epoch === waterHealthEpoch) button.disabled = false
  }
}

async function confirmWaterHealthPreview() {
  if (!FRESH_OWNER_MODULES || !waterHealthPreview || !waterHealthSession ||
      !waterHealthSheet?.classList.contains('is-open')) return
  const epoch = waterHealthEpoch
  const session = waterHealthSession
  const preview = waterHealthPreview
  const button = $('[data-water-health-confirm]')
  button.disabled = true
  try {
    const { confirmFreshOwnerWaterHydration } =
      await import('./water/grapes-test-fresh-water-health.js')
    const selectedIndexes = [...$$('[data-water-health-records] [data-water-health-record]:checked')]
      .map(input => Number(input.value))
    const result = await confirmFreshOwnerWaterHydration({
      session, preview, selectedIndexes,
    })
    if (epoch !== waterHealthEpoch) return
    closeSheet()
    renderWater()
    showToast(result.imported
      ? `${result.imported} vízbejegyzés a saját Water-naplóba mentve.`
      : 'Nincs új kijelölt vízbejegyzés.')
  } catch (error) {
    if (epoch === waterHealthEpoch) {
      // On failed identity/CAS, never leave a preview active for a new login.
      waterHealthSession = null
      waterHealthPreview = null
      $('[data-water-health-records]').replaceChildren()
      button.hidden = true
      $('[data-water-health-status]').textContent =
        'A vízimport nem történt meg: ' + (error?.message || 'ismeretlen hiba')
    }
  } finally {
    button.disabled = false
  }
}

function openFreshYazioDirect() {
  if (!FRESH_OWNER_MODULES || !freshYazioDirectSheet) return
  openSheet(freshYazioDirectSheet)
  const form = $('[data-fresh-yazio-direct-form]')
  const now = new Date(), from = new Date(now)
  from.setDate(from.getDate() - 6)
  const date = day => [day.getFullYear(),
    String(day.getMonth() + 1).padStart(2,'0'),
    String(day.getDate()).padStart(2,'0')].join('-')
  form.elements.from.value = date(from)
  form.elements.to.value = date(now)
  form.elements.from.max = date(now)
  form.elements.to.max = date(now)
  form.elements.email.value = ''
  form.elements.password.value = ''
  $('[data-fresh-yazio-direct-status]').textContent = ''
}
async function submitFreshYazioDirect(event) {
  event.preventDefault()
  if (!FRESH_OWNER_MODULES || !freshYazioDirectSheet?.classList.contains('is-open')) return
  const epoch = ++yazioDirectEpoch
  const form = $('[data-fresh-yazio-direct-form]')
  const button = form.querySelector('[type="submit"]')
  const status = $('[data-fresh-yazio-direct-status]')
  const email = form.elements.email.value.trim()
  const password = form.elements.password.value
  const from = form.elements.from.value, to = form.elements.to.value
  form.elements.password.value = ''
  button.disabled = true
  try {
    const [{ openGrapesTestFreshFood }, { readFreshOwnerYazioDirect }] =
      await Promise.all([
        import('./food/grapes-test-fresh-food.js'),
        import('./food/grapes-test-fresh-yazio-direct.js'),
      ])
    const session = await openGrapesTestFreshFood({ enabled: true })
    await session.load()
    const result = await readFreshOwnerYazioDirect({
      session, email, password, from, to,
      checkCancelled: () => {
        if (epoch !== yazioDirectEpoch ||
            !freshYazioDirectSheet.classList.contains('is-open')) {
          throw new Error('A YAZIO-beolvasás megszakadt.')
        }
      },
      onProgress: message => {
        if (epoch === yazioDirectEpoch) status.textContent = message
      },
    })
    await session.assertOwner()
    if (epoch !== yazioDirectEpoch ||
        !freshYazioDirectSheet.classList.contains('is-open')) return
    status.textContent = `${result.bundle.nutrition_log.length} étkezés beolvasva. Előnézet készül…`
    // Session was logged out in readFreshOwnerYazioDirect finally.
    // A new explicit own Food preview is required before ANY CAS save.
    const file = new File([JSON.stringify(result.bundle)], 'yazio-direct.json',
      {type:'application/json'})
    closeSheet()
    await prepareFreshYazioFile(file)
  } catch (error) {
    if (epoch === yazioDirectEpoch) status.textContent =
      error?.message || 'A YAZIO-beolvasás megszakadt. Nem mentettünk étkezést.'
  } finally { button.disabled = false; form.elements.password.value = '' }
}

async function prepareFreshYazioFile(file) {
  if (!FRESH_OWNER_MODULES || !file) return
  if (file.size > 40 * 1024 * 1024) {
    showToast('A YAZIO-fájl legfeljebb 40 MB lehet.')
    return
  }
  if (!/[.](json|csv)$/i.test(file.name)) {
    showToast('Csak JSON vagy nutrition_log.csv fájl választható.')
    return
  }
  ++yazioPreviewEpoch
  freshYazioPreview = null
  freshYazioSession = null
  openSheet(freshYazioSheet)
  // Opening another sheet invalidates old previews, so remember the new epoch.
  const currentEpoch = yazioPreviewEpoch
  $('[data-fresh-yazio-summary]').textContent = 'YAZIO-export ellenőrzése…'
  $('[data-fresh-yazio-status]').textContent = ''
  $('[data-fresh-yazio-confirm]').hidden = true
  $('[data-fresh-yazio-warning]').textContent = ''
  $('[data-fresh-yazio-records]').replaceChildren()
  try {
    const { openGrapesTestFreshFood } =
      await import('./food/grapes-test-fresh-food.js')
    const { prepareFreshOwnerYazio } =
      await import('./food/grapes-test-fresh-yazio.js')
    const session = await openGrapesTestFreshFood({ enabled: true })
    const project = await session.load()
    await session.assertOwner()
    const data = await file.text()
    await session.assertOwner()
    const preview = prepareFreshOwnerYazio(data, {
      ownerId: session.ownerId, existingEntries: project.diaryEntries,
      filename: file.name,
    })
    await session.assertOwner()
    if (currentEpoch !== yazioPreviewEpoch ||
        !freshYazioSheet?.classList.contains('is-open')) return
    freshYazioSession = session
    freshYazioPreview = preview
    $('[data-fresh-yazio-summary]').textContent =
      `${preview.counts.ready} új · ${preview.counts.duplicate} duplikált · ${preview.counts.uncertain} bizonytalan · ${preview.counts.invalid} hibás · ${preview.format.toUpperCase()}`
    $('[data-fresh-yazio-warning]').textContent = preview.format === 'json'
      ? `Export időszak: ${preview.from} – ${preview.to}. ${preview.warnings?.length || 0} figyelmeztetés, ${preview.discrepancies?.length || 0} napi eltérés. A bizonytalan sorok alapból nincsenek kijelölve.`
      : 'A nutrition_log.csv rekordjai előnézetben, fiókonként külön menthetők.'
    const rows = $('[data-fresh-yazio-records]')
    const fragment = document.createDocumentFragment()
    // The full data may be large; show a bounded set, but let the user
    // explicitly choose whether to import all *ready* rows.
    const visible = preview.records.slice(0, 250)
    for (const item of visible) {
      const label = document.createElement('label')
      label.className = 'sheet-result'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.dataset.freshYazioRecord = ''
      input.value = String(item.index)
      input.disabled = !['ready', 'uncertain'].includes(item.status)
      input.checked = item.status === 'ready'
      const description = document.createElement('span')
      description.textContent = `#${item.index + 1} · ${item.entry?.snapshot?.name || 'Hibás sor'} · ${item.status}` +
        (item.error ? ' · ' + item.error : '')
      label.append(input, description)
      fragment.append(label)
    }
    rows.replaceChildren(fragment)
    if (preview.records.length > visible.length) {
      const label = document.createElement('label')
      label.className = 'sheet-result'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.dataset.freshYazioRemainder = ''
      input.checked = true
      const span = document.createElement('span')
      span.textContent = `A további ${preview.records.length - visible.length} sor közül az összes új, biztosan importálható étkezést is kijelölöm.`
      label.append(input, span)
      rows.append(label)
    }
    $('[data-fresh-yazio-confirm]').hidden =
      preview.counts.ready + preview.counts.uncertain === 0
    $('[data-fresh-yazio-status]').textContent =
      'A mentés kizárólag a kijelölt étkezések jóváhagyásakor indul.'
  } catch (error) {
    if (currentEpoch === yazioPreviewEpoch) {
      freshYazioPreview = null
      freshYazioSession = null
      $('[data-fresh-yazio-summary]').textContent = 'Az export nem olvasható.'
      $('[data-fresh-yazio-status]').textContent = error?.message || 'A YAZIO-beolvasás megszakadt.'
    }
  }
}

async function confirmFreshYazioPreview() {
  if (!FRESH_OWNER_MODULES || !freshYazioSession || !freshYazioPreview ||
      !freshYazioSheet?.classList.contains('is-open')) return
  const button = $('[data-fresh-yazio-confirm]')
  button.disabled = true
  const epoch = yazioPreviewEpoch
  const session = freshYazioSession
  const preview = freshYazioPreview
  try {
    const selected = $$('[data-fresh-yazio-record]:checked').map(input => Number(input.value))
    if ($('[data-fresh-yazio-remainder]')?.checked) {
      selected.push(...preview.records.slice(250)
        .filter(item => item.status === 'ready').map(item => item.index))
    }
    const { confirmFreshOwnerYazio } = await import('./food/grapes-test-fresh-yazio.js')
    const result = await confirmFreshOwnerYazio({ session, preview, selectedIndexes: selected })
    if (epoch !== yazioPreviewEpoch) return
    closeSheet()
    showToast(result.imported
      ? `${result.imported} YAZIO-étkezés saját Food-naplóba mentve.`
      : 'Nincs új kijelölt YAZIO-étkezés.')
    setSyncProviderStatus(`${result.imported} YAZIO-étkezés importálva a saját fiókba.`)
  } catch (error) {
    if (epoch === yazioPreviewEpoch) {
      // No unowned/old-account preview after stale session, save failure or conflict.
      closeSheet()
      setSyncProviderStatus('YAZIO-mentés leállt: ' +
        (error?.message || 'ismeretlen hiba'), 'error')
    }
  } finally { button.disabled = false }
}

async function undoFreshYazioLast() {
  if (!FRESH_OWNER_MODULES) return
  if (!window.confirm('Visszavonod az utolsó YAZIO-importot? A szerkesztett sorok megmaradnak.')) return
  try {
    const [{ openGrapesTestFreshFood }, { undoFreshOwnerYazio }] =
      await Promise.all([
        import('./food/grapes-test-fresh-food.js'),
        import('./food/grapes-test-fresh-yazio.js'),
      ])
    const session = await openGrapesTestFreshFood({ enabled: true })
    await session.load()
    const result = await undoFreshOwnerYazio({ session })
    closeSheet()
    setSyncProviderStatus(`${result.removed} sor visszavonva; ${result.modified.length} szerkesztett bejegyzés megmaradt.`)
  } catch (error) {
    setSyncProviderStatus(error?.message || 'YAZIO-visszavonás sikertelen.', 'error')
  }
}

function normalizeAppUpdate(value) {
  const versionCode = Number(value?.versionCode)
  if (!Number.isInteger(versionCode) || versionCode <= 0) return null
  return {
    versionCode,
    versionName: String(value?.versionName || `Grapes ${versionCode}`),
    notes: String(value?.notes || '').trim(),
  }
}

function renderUpdateInbox() {
  const badge = $('[data-notifications-badge]')
  const empty = $('[data-notifications-empty]')
  const card = $('[data-update-notification]')
  const update = availableAppUpdate
  const readVersion = Number(localStorage.getItem(UPDATE_READ_KEY) || 0)
  const food = FRESH_OWNER_MODULES ? { pending: 0, unread: 0 }
    : mobileFood?.inboxSummary() || { pending: 0, unread: 0 }
  const foodCard = $('[data-food-share-notification]')
  foodCard.hidden = food.pending === 0
  $('[data-food-share-notes]').textContent = `${food.pending} függőben lévő megosztás · ${food.unread} olvasatlan`
  badge.hidden = (!update || readVersion >= update.versionCode) && food.unread === 0
  empty.hidden = Boolean(update) || food.pending > 0
  card.hidden = !update
  if (!update) return
  $('[data-update-title]').textContent = `${update.versionName} elérhető`
  $('[data-update-notes]').textContent = update.notes || 'Új Grapes-verzió tölthető le.'
}

function setAvailableAppUpdate(value) {
  const previousVersion = availableAppUpdate?.versionCode
  availableAppUpdate = normalizeAppUpdate(value)
  if (previousVersion !== availableAppUpdate?.versionCode) {
    $('[data-update-install]').disabled = false
    $('[data-update-status]').textContent = ''
  }
  renderUpdateInbox()
}

async function refreshUpdateInbox() {
  if (isGrapesAndroidApp()) {
    try { setAvailableAppUpdate(await getAndroidAppUpdate()) }
    catch { renderUpdateInbox() }
  }
  if (mobileFood && !FRESH_OWNER_MODULES) {
    try { await mobileFood.refreshInbox() } catch { /* A postaláda hálózati hibája nem akadályozhatja a verziófrissítést. */ }
  }
  renderUpdateInbox()
}

async function openUpdateInbox() {
  await refreshUpdateInbox()
  if (availableAppUpdate) {
    localStorage.setItem(UPDATE_READ_KEY, String(availableAppUpdate.versionCode))
    renderUpdateInbox()
  }
  openSheet($('[data-notifications-sheet]'))
}

function resetFreshEbookUi() {
  freshEbookEpoch++
  freshEbookPromise = null
  mobileEbooks = []
  mobileReader = null
  mobileReaderBook = null
  clearTimeout(mobileReaderSaveTimer)
  mobileReaderSaveTimer = null
  for (const page of ['ebook', 'reader']) {
    const root = $('[data-page="' + page + '"]')
    if (root) { root.inert = true; root.style.visibility = 'hidden' }
  }
  $('[data-ebook-books]')?.replaceChildren()
  $('[data-ebook-featured]').hidden = true
  $('[data-reader-page]')?.replaceChildren()
  $('[data-reader-book]')?.replaceChildren()
  $('[data-reader-picker]').hidden = false
  $('[data-reader-shell]').hidden = true
}

async function freshEbook() {
  if (!freshEbookPromise) {
    freshEbookPromise = import('./ebook/grapes-test-fresh-ebook.js')
      .then(module => module.openGrapesTestFreshEbook({ enabled: true }))
  }
  const session = await freshEbookPromise
  await session.assertOwner()
  return session
}

function revealFreshEbook(page, epoch) {
  if (epoch !== freshEbookEpoch || activePage !== page) return false
  const root = $('[data-page="' + page + '"]')
  if (root) { root.inert = false; root.style.visibility = '' }
  return true
}

function showPage(page, { parent = '', entry = '', skipFoodLoad = false } = {}) {
  if (FRESH_OWNER_MODULES && page === 'food' && !skipFoodLoad) {
    // Hide the previous user's DOM before the asynchronous native Auth check.
    const foodPage = $('[data-page="food"]')
    if (foodPage) { foodPage.inert = true; foodPage.style.visibility = 'hidden' }
  }
  // With the opt-in fresh owner gate ON, legacy modules MUST NOT be opened:
  // their local/Drive data paths are not yet bound to native Grapes Auth.
  if (FRESH_OWNER_MODULES &&
      ['transfer'].includes(page)) {
    showToast('Ez a modul a fiókonkénti TEST-átállításig zárolva van.')
    return
  }
  if (FRESH_OWNER_MODULES && activePage === 'household' && page !== 'household') {
    // Leave no previous owner's inventory/shopping in a hidden DOM.
    household.clear()
  }
  if (FRESH_OWNER_MODULES && page === 'household') {
    // Explicitly hide and blank the old account before native Auth resolves.
    household.clear()
  }
  if (FRESH_OWNER_MODULES && ['ebook', 'reader'].includes(page)) {
    // Erase the previous account's book and reader DOM before native Auth.
    if (activePage === 'reader' && page !== 'reader') persistReaderProgress().catch(() => {})
    resetFreshEbookUi()
  }
  // Remember only the menu origin. Reader/transfer views inherit E-book's origin.
  if (!['reader', 'transfer'].includes(page) || parent) {
    menuReturnPage = parent
    menuEntry = entry
  }
  if (activePage === 'food' && page !== 'food') mobileFood?.flush().catch(() => {})
  if (mobileReader && !['reader'].includes(page)) persistReaderProgress().catch(() => {})
  if (page !== 'reader') setReaderFullscreen(false)
  activePage = page
  toast.classList.remove('is-visible')
  $$('[data-page]').forEach(node => { node.hidden = node.dataset.page !== page })
  $$('[data-nav]').forEach(node => node.classList.toggle('is-active', node.dataset.nav === page))
  ;[title.textContent, subtitle.textContent] = labels[page] || labels.home
  fab.hidden = page !== 'food' || !mobileFood?.isDetailOpen()
  closeSheet()
  if (page === 'projects') renderProjects()
  if (page === 'sync') renderSync()
  if (page === 'water') {
    if (FRESH_OWNER_MODULES) resetFreshWaterUi()
    renderWater()
  }
  if (page === 'household') {
    household.load()
    if (entry === 'shopping' || entry === 'inventory') household.openTab(entry)
  }
  if (page === 'food' && !skipFoodLoad) mobileFood?.load().then(async () => {
    // A delayed load must not open a sheet on a different screen.
    if (activePage !== 'food' || (entry && menuEntry !== entry)) return
    if (entry) mobileFood?.openNavigationView(entry)
    if (!FRESH_OWNER_MODULES) {
      await mobileFood?.autoImportHealth()
      await mobileFood?.autoImportYazio()
    }
  }).catch(() => {})
  if (page === 'ebook') renderMobileEbooks()
  if (page === 'reader') renderReaderPicker()
  if (page === 'transfer') renderTransferPicker()
  if (['ebook', 'reader', 'transfer'].includes(page)) {
    $$('[data-ebook-view]').forEach(button => button.classList.toggle('is-active', button.dataset.ebookView === page))
  }
}

async function openModule(module, project = null, view = '', itemId = '', action = '') {
  if (FRESH_OWNER_MODULES) {
    if (module !== 'finance' || project || view || itemId || action) {
      showToast('A modul fiókhoz kötése még folyamatban van; a TEST nem nyitja meg.')
      return
    }
    try {
      const { createGrapesTestFreshOwnerAccess } =
        await import('./storage/grapes-test-fresh-owner-access.js')
      await createGrapesTestFreshOwnerAccess({ enabled: true }).verifiedSubject()
    } catch (error) {
      showToast(error?.message || 'A Grapes-fiók nem ellenőrizhető.')
      return
    }
  } else {
    await mobileFood?.flush({ drive: false }).catch(() => {})
  }
  if (project) {
    try { sessionStorage.setItem('grapes-open-project', JSON.stringify({ module: project.folder, source: 'Drive', id: project.id })) } catch {}
  }
  const target = new URL('../index.html', window.location.href)
  if (module === 'food' && view) try { sessionStorage.setItem('grapes-food-mobile-request', JSON.stringify({ view, itemId, action })) } catch {}
  target.searchParams.set('module', module)
  target.searchParams.set('android-shell', '1')
  window.location.href = target.href
}

function openEbook(bookId = '', view = 'organizer') {
  if (FRESH_OWNER_MODULES) return startReader(bookId)
  try {
    sessionStorage.setItem('grapes-ebook-view', view)
    if (bookId) sessionStorage.setItem('grapes-ebook-open-book', bookId)
    else sessionStorage.removeItem('grapes-ebook-open-book')
  } catch {}
  openModule('ebook')
}

function ebookCover(title, index = 0) {
  const cover = document.createElement('span')
  cover.className = 'book-cover'
  cover.style.background = [
    'linear-gradient(145deg,#7357ff,#224a86 62%,#0c1824)',
    'linear-gradient(145deg,#ec6f66,#6c2746 65%,#1d1119)',
    'linear-gradient(145deg,#36bd91,#164b50 65%,#0b1a1b)',
    'linear-gradient(145deg,#31bde0,#31519c 65%,#111b35)',
  ][index % 4]
  const label = document.createElement('span')
  label.textContent = title
  cover.append(label)
  return cover
}

function renderEbookCards(books) {
  const grid = $('[data-ebook-books]')
  const featured = $('[data-ebook-featured]')
  grid.replaceChildren()
  if (!books.length) {
    grid.innerHTML = `<div class="ebook-empty">${FRESH_OWNER_MODULES
      ? 'A saját könyvtárad még üres. Adj hozzá egy helyi könyvet!'
      : isGrapesDriveConnected() ? 'A Grapes Drive-könyvtár még üres. Importálj egy könyvet!' : 'A könyvtárhoz csatlakoztasd a Google Drive-ot a Szinkron oldalon.'}</div>`
    featured.hidden = true
    return
  }
  const readable = books.filter(isMobileReadableEpub)
  const latest = [...readable].sort((left, right) => Date.parse(right.reading?.updatedAt || '') - Date.parse(left.reading?.updatedAt || ''))[0] || readable[0]
  if (!latest) { featured.hidden = true }
  else {
  featured.replaceChildren()
  featured.append(ebookCover(latest.title, 0))
  const copy = document.createElement('div'); copy.className = 'book-copy'
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = latest.reading ? 'FOLYTATÁS' : 'KÖVETKEZŐ OLVASMÁNY'
  const heading = document.createElement('h2'); heading.textContent = latest.title
  const author = document.createElement('span'); author.textContent = latest.author || latest.name
  const progress = document.createElement('div'); progress.className = 'progress book-progress'
  const progressBar = document.createElement('i'); progressBar.style.width = `${Math.round(latest.reading?.overallPercent || 0)}%`; progress.append(progressBar)
  const progressText = document.createElement('small'); progressText.textContent = latest.reading ? `${Math.round(latest.reading.overallPercent)}% elolvasva` : 'Még nem kezdted el'
  const action = document.createElement('button'); action.type = 'button'; action.className = 'continue-btn'; action.textContent = latest.reading ? 'Olvasás folytatása' : 'Olvasás megkezdése'
  action.addEventListener('click', () => startReader(latest.id))
  copy.append(eyebrow, heading, author, progress, progressText, document.createElement('br'), action)
  featured.append(copy); featured.hidden = false
  }
  books.forEach((book, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'book-tile'
    const title = document.createElement('strong'); title.textContent = book.title
    const meta = document.createElement('small'); meta.textContent = book.reading ? `${Math.round(book.reading.overallPercent)}% elolvasva` : (book.author || book.name.split('.').pop().toUpperCase())
    button.append(ebookCover(book.title, index), title, meta)
    button.addEventListener('click', () => openEbook(book.id))
    grid.append(button)
  })
}

async function renderMobileEbooks() {
  const epoch = freshEbookEpoch
  const status = $('[data-ebook-status]')
  status.textContent = FRESH_OWNER_MODULES ? 'Saját helyi könyvtár betöltése…'
    : isGrapesDriveConnected() ? 'Drive-könyvtár frissítése…' : ''
  try {
    const books = FRESH_OWNER_MODULES ? await (await freshEbook()).listBooks()
      : await listMobileEbooks()
    if (FRESH_OWNER_MODULES && (epoch !== freshEbookEpoch || activePage !== 'ebook')) return
    if (FRESH_OWNER_MODULES) await (await freshEbook()).assertOwner()
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    mobileEbooks = books
    renderEbookCards(books)
    status.textContent = ''
  } catch (error) {
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    mobileEbooks = []
    renderEbookCards([])
    status.textContent = `A könyvtár nem tölthető be. ${error?.message || ''}`
  } finally {
    if (FRESH_OWNER_MODULES) revealFreshEbook('ebook', epoch)
  }
}

async function importMobileEbook(file) {
  if (!file) return
  const epoch = freshEbookEpoch
  const status = $('[data-ebook-status]')
  status.textContent = `${file.name} ${FRESH_OWNER_MODULES ? 'helyi mentése' : 'feltöltése'}…`
  try {
    let books
    if (FRESH_OWNER_MODULES) {
      const session = await freshEbook()
      await session.importLocalFile(file)
      books = await session.listBooks()
      await session.assertOwner()
    } else books = await uploadMobileEbook(file)
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    mobileEbooks = books
    renderEbookCards(books)
    status.textContent = FRESH_OWNER_MODULES
      ? `${file.name} mentve a saját helyi könyvtárba.`
      : `${file.name} hozzáadva a Drive-könyvtárhoz.`
  } catch (error) {
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    status.textContent = `A mentés nem sikerült. ${error?.message || ''}`
  }
}

async function ensureMobileEbooks() {
  if (FRESH_OWNER_MODULES) return (await freshEbook()).listBooks()
  if (!isGrapesDriveConnected()) return []
  if (!mobileEbooks.length) mobileEbooks = await listMobileEbooks()
  return mobileEbooks
}

function fillBookSelect(select, books, { readableOnly = false } = {}) {
  const previous = select.value
  select.replaceChildren(new Option('Válassz könyvet…', ''))
  for (const book of books.filter(book => !readableOnly || isMobileReadableEpub(book))) {
    select.append(new Option(`${book.title}${book.author ? ` — ${book.author}` : ''}`, book.id))
  }
  if (books.some(book => book.id === previous && (!readableOnly || isMobileReadableEpub(book)))) select.value = previous
}

async function renderReaderPicker() {
  const epoch = freshEbookEpoch
  const status = $('[data-reader-status]')
  try {
    status.dataset.kind = ''
    status.textContent = FRESH_OWNER_MODULES ? 'Saját EPUB-könyvek betöltése…'
      : isGrapesDriveConnected() ? 'EPUB-könyvek betöltése…' : 'Az Olvasóhoz csatlakoztasd a Google Drive-ot a Szinkron oldalon.'
    const books = await ensureMobileEbooks()
    if (FRESH_OWNER_MODULES && (epoch !== freshEbookEpoch || activePage !== 'reader')) return
    if (FRESH_OWNER_MODULES) await (await freshEbook()).assertOwner()
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    const readable = books.filter(isMobileReadableEpub)
    fillBookSelect($('[data-reader-book]'), books, { readableOnly: true })
    if (!mobileReader) {
      $('[data-reader-picker]').hidden = false
      $('[data-reader-shell]').hidden = true
      const recent = [...readable].sort((left, right) => Date.parse(right.reading?.updatedAt || '') - Date.parse(left.reading?.updatedAt || ''))[0]
      if (recent) $('[data-reader-book]').value = recent.id
    }
    status.textContent = readable.length ? '' : (books.length ? 'A könyvtárban még nincs EPUB-formátumú könyv.' : status.textContent)
  } catch (error) {
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    status.textContent = `Az EPUB-lista nem tölthető be. ${error?.message || ''}`
    status.dataset.kind = 'error'
  } finally {
    if (FRESH_OWNER_MODULES) revealFreshEbook('reader', epoch)
  }
}

function readerProgressSnapshot() {
  const page = $('[data-reader-page]')
  const max = Math.max(0, page.scrollHeight - page.clientHeight)
  const chapterProgress = max ? Math.min(1, Math.max(0, page.scrollTop / max)) : 1
  return {
    chapterId: mobileReader?.chapters[mobileReaderChapterIndex]?.id || '',
    chapterIndex: mobileReaderChapterIndex,
    chapterProgress,
    overallPercent: normalizedReadingProgress({ chapterIndex: mobileReaderChapterIndex, chapterCount: mobileReader?.chapters.length, chapterProgress }),
  }
}

function updateReaderProgress() {
  if (!mobileReader) return
  const value = readerProgressSnapshot()
  $('[data-reader-progress]').style.width = `${value.overallPercent}%`
  $('[data-reader-progress-label]').textContent = `${Math.round(value.overallPercent)}%`
}

async function persistReaderProgress() {
  window.clearTimeout(mobileReaderSaveTimer)
  mobileReaderSaveTimer = null
  if (!mobileReader || !mobileReaderBook) return
  const value = readerProgressSnapshot()
  const epoch = freshEbookEpoch
  const book = mobileReaderBook
  const reading = FRESH_OWNER_MODULES
    ? await (await freshEbook()).saveReadingProgress(book.id, value)
    : await saveMobileReadingProgress(book, value)
  if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
  book.reading = reading
  updateReaderProgress()
}

function scheduleReaderProgressSave() {
  updateReaderProgress()
  window.clearTimeout(mobileReaderSaveTimer)
  mobileReaderSaveTimer = window.setTimeout(() => persistReaderProgress().catch(error => {
    const status = $('[data-reader-status]'); status.textContent = FRESH_OWNER_MODULES
      ? `A helyi olvasási pozíció mentése nem sikerült. ${error?.message || ''}`
      : `A haladás helyben megmaradt, de a Drive-szinkron nem sikerült. ${error?.message || ''}`; status.dataset.kind = 'error'
  }), 1200)
}

async function showReaderChapter(index, progress = 0) {
  if (!mobileReader) return
  mobileReaderChapterIndex = Math.min(mobileReader.chapters.length - 1, Math.max(0, Number(index) || 0))
  const chapter = mobileReader.chapters[mobileReaderChapterIndex]
  const page = $('[data-reader-page]')
  const status = $('[data-reader-status]')
  status.textContent = 'Fejezet megnyitása…'; status.dataset.kind = ''
  const content = await mobileReader.getChapter(chapter.id)
  page.innerHTML = content.html || '<p>Ez a fejezet nem tartalmaz megjeleníthető szöveget.</p>'
  $('[data-reader-chapter]').value = chapter.id
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  page.scrollTop = Math.max(0, page.scrollHeight - page.clientHeight) * Math.min(1, Math.max(0, Number(progress) || 0))
  updateReaderProgress()
  status.textContent = ''; status.dataset.kind = ''
}

async function startReader(bookId) {
  showPage('reader')
  const epoch = freshEbookEpoch
  const status = $('[data-reader-status]')
  try {
    const books = await ensureMobileEbooks()
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    const book = books.find(item => item.id === bookId)
    if (!book) throw new Error('A kiválasztott könyv már nem található a saját könyvtárban.')
    if (!isMobileReadableEpub(book)) throw new Error('Az alkalmazáson belüli Olvasó jelenleg csak EPUB-könyvet támogat.')
    status.textContent = `${book.title} ${FRESH_OWNER_MODULES ? 'megnyitása' : 'letöltése'} és ellenőrzése…`
    status.dataset.kind = ''
    let reader
    if (FRESH_OWNER_MODULES) {
      const session = await freshEbook()
      const blob = await session.readFile(book.id)
      const epub = await openEpubContent(blob)
      await session.assertOwner()
      reader = { book, title: epub.title || book.title || book.name,
        chapters: epub.chapters.map((chapter, index) => ({
          id: chapter.id, title: chapter.title, index,
        })), getChapter: id => epub.getReadingChapter(id) }
    } else reader = await openMobileEpub(book)
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    mobileReader = reader
    mobileReaderBook = book
    $('[data-reader-title]').textContent = book.title
    $('[data-reader-author]').textContent = book.author || 'EPUB'
    const chapterSelect = $('[data-reader-chapter]')
    chapterSelect.replaceChildren(...mobileReader.chapters.map(chapter => new Option(chapter.title, chapter.id)))
    $('[data-reader-picker]').hidden = true
    $('[data-reader-shell]').hidden = false
    const stored = book.reading || {}
    const changedSinceReading = Boolean(stored.bookModifiedTime && book.modifiedTime && stored.bookModifiedTime !== book.modifiedTime)
    const saved = changedSinceReading ? {} : stored
    const matching = mobileReader.chapters.findIndex(chapter => chapter.id === saved.chapterId)
    const index = matching >= 0 ? matching : Math.min(mobileReader.chapters.length - 1, Number(saved.chapterIndex) || 0)
    await showReaderChapter(index, saved.chapterProgress || 0)
    status.textContent = saved.updatedAt
      ? (FRESH_OWNER_MODULES ? 'Saját helyi olvasási pozíció visszaállítva.' : 'A Drive-on mentett olvasási pozíció visszaállítva.')
      : (changedSinceReading ? 'A könyv megváltozott, ezért az olvasás az elejéről indul.' : '')
    status.dataset.kind = saved.updatedAt ? 'success' : ''
  } catch (error) {
    if (FRESH_OWNER_MODULES && epoch !== freshEbookEpoch) return
    mobileReader = null; mobileReaderBook = null
    $('[data-reader-picker]').hidden = false; $('[data-reader-shell]').hidden = true
    status.textContent = error?.message || 'Az EPUB nem nyitható meg.'; status.dataset.kind = 'error'
  } finally {
    if (FRESH_OWNER_MODULES) revealFreshEbook('reader', epoch)
  }
}

async function moveReaderPage(direction) {
  if (!mobileReader) return
  const page = $('[data-reader-page]')
  const distance = Math.max(180, page.clientHeight - 32)
  const max = Math.max(0, page.scrollHeight - page.clientHeight)
  if (direction > 0 && page.scrollTop < max - 4) page.scrollTop = Math.min(max, page.scrollTop + distance)
  else if (direction < 0 && page.scrollTop > 4) page.scrollTop = Math.max(0, page.scrollTop - distance)
  else {
    const next = mobileReaderChapterIndex + direction
    if (next < 0 || next >= mobileReader.chapters.length) return showToast(direction > 0 ? 'A könyv végére értél.' : 'Ez a könyv eleje.')
    await persistReaderProgress().catch(() => {})
    await showReaderChapter(next, direction > 0 ? 0 : 1)
  }
  scheduleReaderProgressSave()
}

function setReaderFullscreen(active) {
  const shell = $('[data-reader-shell]')
  const button = $('[data-reader-fullscreen]')
  const next = Boolean(active && mobileReader && !shell.hidden)
  shell.classList.toggle('is-fullscreen', next)
  document.documentElement.classList.toggle('is-reader-fullscreen', next)
  button.setAttribute('aria-pressed', String(next))
  button.setAttribute('aria-label', next ? 'Teljes képernyő bezárása' : 'Teljes képernyős olvasás')
  button.textContent = next ? '×' : '⛶'
  if (next) {
    shell.requestFullscreen?.().catch(() => {})
    $('[data-reader-page]').focus({ preventScroll: true })
  } else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
}

async function renderTransferPicker() {
  const status = $('[data-transfer-status]')
  try {
    status.dataset.kind = ''
    status.textContent = isGrapesDriveConnected() ? 'Könyvek betöltése…' : 'Az átvitelhez csatlakoztasd a Google Drive-ot a Szinkron oldalon.'
    const books = await ensureMobileEbooks()
    fillBookSelect($('[data-transfer-book]'), books.filter(isMobileShareableBook))
    status.textContent = books.some(isMobileShareableBook) ? '' : (books.length ? 'Nincs e-olvasóra küldhető könyv.' : status.textContent)
  } catch (error) { status.textContent = `Az átviteli lista nem tölthető be. ${error?.message || ''}`; status.dataset.kind = 'error' }
}

async function prepareTransfer() {
  const status = $('[data-transfer-status]')
  const book = mobileEbooks.find(item => item.id === $('[data-transfer-book]').value)
  if (!book) { status.textContent = 'Válassz ki egy könyvet.'; status.dataset.kind = 'error'; return }
  status.textContent = 'Biztonságos letöltési kapcsolat előkészítése…'; status.dataset.kind = ''
  try {
    const result = await prepareMobileBookTransfer(book)
    activeTransferBookId = book.id
    $('[data-transfer-qr]').src = result.qrUrl
    $('[data-transfer-code]').dataset.url = result.codeUrl
    $('[data-transfer-frame]').hidden = true
    $('[data-transfer-result]').hidden = false
    status.textContent = 'A könyv küldésre kész. Olvasd be a QR-kódot, vagy kérj párosítási kódot.'; status.dataset.kind = 'success'
  } catch (error) { status.textContent = `Az átvitel nem készíthető elő. ${error?.message || ''}`; status.dataset.kind = 'error' }
}

async function pairMobileLibrary() {
  const status = $('[data-transfer-status]')
  const button = $('[data-reader-pair]')
  button.disabled = true
  try {
    const books = await ensureMobileEbooks()
    status.textContent = 'A könyvtár párosításának előkészítése…'; status.dataset.kind = ''
    const pairing = await prepareMobileLibraryPairing(books)
    activePairingNonce = pairing.nonce
    $('[data-reader-pair-value]').value = ''
    const frame = $('[data-reader-pair-frame]')
    frame.removeAttribute('src'); frame.srcdoc = pairing.srcdoc; frame.hidden = false
    status.textContent = `${pairing.count} könyv előkészítve.${pairing.omittedCount ? ` ${pairing.omittedCount} nem támogatott könyv kimaradt.` : ''}`
  } catch (error) { status.textContent = `A párosítás nem sikerült. ${error?.message || ''}`; status.dataset.kind = 'error' }
  finally { button.disabled = false }
}

function renderAccount() {
  if (FRESH_OWNER_MODULES) {
    $('[data-account-mode]').textContent = 'Grapes TEST – fiókonkénti mód'
    $('[data-sync-title]').textContent = 'Grapes TEST – helyi fióktárhely'
    $('[data-sync-detail]').textContent = 'A Water és Finance saját fióktárhelye aktív; Food, E-book és Drive még zárolva van.'
    $('[data-connect-drive]').textContent = 'Drive-kapcsolat ebben a tesztben nem használható'
    $('[data-account-action]').textContent = 'Drive külön zárolva'
    const badge = $('[data-sync-badge]')
    if (badge) { badge.textContent = 'Fiókhoz kötve'; badge.dataset.state = 'local' }
    return
  }
  const connected = isGrapesDriveConnected()
  const account = getGrapesAccount()
  $('[data-account-mode]').textContent = connected ? (account?.email || 'Drive csatlakoztatva') : 'Helyi mód'
  $('[data-sync-title]').textContent = connected ? 'Google Drive csatlakoztatva' : 'Jelenleg helyi mód'
  $('[data-sync-detail]').textContent = connected
    ? 'A projektjeid menthetők és megnyithatók a saját Google Drive-odból.'
    : 'Az app internet nélkül is használható. A Drive csatlakoztatása után választhatsz, mit töltesz fel.'
  $('[data-connect-drive]').textContent = connected ? 'Drive leválasztása' : 'Google Drive csatlakoztatása'
  $('[data-account-action]').textContent = connected ? 'Kijelentkezés a Google-fiókból' : 'Google-fiók csatlakoztatása'
  const badge = $('[data-sync-badge]')
  if (badge) {
    badge.textContent = connected ? 'Drive aktív' : 'Csak ezen az eszközön'
    badge.dataset.state = connected ? 'connected' : 'local'
  }
}

function showLogin(message = '') {
  // This screen is still needed if the user explicitly wants to connect
  // Google Drive. The startup-only QA concealment must not hide it forever.
  document.documentElement.removeAttribute('data-grapes-qa-native-app')
  app.hidden = true
  login.hidden = false
  const status = $('[data-login-status]')
  if (status) status.textContent = message
  closeSheet()
}

async function openAccountLogin() {
  if (FRESH_OWNER_MODULES) {
    showToast('A Drive-kapcsolat a fiókonkénti TEST alatt zárolva van.')
    return
  }
  if (!isGrapesDriveConnected()) {
    setLocalMode(false)
    showLogin()
    return
  }
  const button = $('[data-account-login]')
  button.disabled = true
  try {
    await disconnectGrapesDrive({ forgetAccount: true })
    setLocalMode(false)
    showLogin()
  } catch (error) {
    showToast(error?.message || 'A kijelentkezés nem sikerült.')
  } finally { button.disabled = false }
}

function formatStorage(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: index > 1 ? 1 : 0 }).format(bytes / 1024 ** index)} ${units[index]}`
}

function formatSyncTime(value) {
  if (!value) return 'Még nem ellenőrizve'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Még nem ellenőrizve'
  return date.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function driveProjectCount() {
  if (!isGrapesDriveConnected()) return 0
  const groups = await Promise.all(moduleFolders.map(([folder]) => listGrapesProjects(folder).catch(() => [])))
  return groups.reduce((sum, projects) => sum + projects.length, 0)
}

async function renderSync({ refreshed = false } = {}) {
  const status = $('[data-sync-status]')
  if (!status) return
  status.textContent = 'Állapot ellenőrzése…'
  status.dataset.state = 'working'
  try {
    const ownerAccess = FRESH_OWNER_MODULES
      ? (await import('./storage/grapes-test-fresh-owner-access.js'))
        .createGrapesTestFreshOwnerAccess({ enabled: true })
      : null
    const [projects, estimate, driveCount, scopedUsage] = await Promise.all([
      ownerAccess ? Promise.resolve([]) : listLocalProjects(1000).catch(() => []),
      ownerAccess ? Promise.resolve(null) : navigator.storage?.estimate
        ? navigator.storage.estimate().catch(() => null) : Promise.resolve(null),
      ownerAccess ? Promise.resolve(0) : driveProjectCount(),
      ownerAccess ? ownerAccess.ownedUsage() : Promise.resolve(null),
    ])
    const dirtyCount = ownerAccess ? scopedUsage.pending
      : projects.filter(project => project?.data?.syncState?.localDirty).length
    const localBytes = ownerAccess ? scopedUsage.bytes
      : estimate?.usage || new Blob(projects.map(project => JSON.stringify(project))).size
    const now = refreshed ? new Date().toISOString() : localStorage.getItem(SYNC_CHECK_KEY)
    if (refreshed) localStorage.setItem(SYNC_CHECK_KEY, now)
    $('[data-sync-local-count]').textContent = `${ownerAccess ? scopedUsage.projects : projects.length} projekt`
    $('[data-sync-local-size]').textContent = formatStorage(localBytes)
    $('[data-sync-drive-count]').textContent = ownerAccess
      ? 'Külön Drive-fiók; nem része ennek a próbakörnek'
      : isGrapesDriveConnected() ? `${driveCount} projekt` : 'Nincs csatlakoztatva'
    $('[data-sync-pending-count]').textContent = ownerAccess
      ? 'Csak a fiókhoz kötött TEST-nyilvántartás'
      : dirtyCount ? `${dirtyCount} mentés várakozik` : 'Minden helyi adat mentve'
    const lastCheck = $('[data-sync-last-check]')
    if (lastCheck) lastCheck.textContent = formatSyncTime(now)
    status.textContent = ownerAccess
      ? 'Fiókozott TEST-projektlista; Food és E-book még nem lett átállítva.'
      : isGrapesDriveConnected()
        ? (dirtyCount ? 'Van helyben módosított projekt.' : 'A Drive-kapcsolat elérhető.')
        : 'A helyi mentések internet nélkül is használhatók.'
    status.dataset.state = dirtyCount ? 'pending' : 'ready'
  } catch (error) {
    status.textContent = `Az állapot most nem ellenőrizhető. ${error?.message || ''}`
    status.dataset.state = 'error'
  }
}

function showApp() {
  login.hidden = true
  app.hidden = false
  updateHomeGreeting()
  renderAccount()
  showPage('home')
  renderProjects()
}

async function connectDrive() {
  if (FRESH_OWNER_MODULES) {
    showToast('A külön Drive-kapcsolat nem része a fiókozott TEST-nek.')
    return
  }
  const status = $('[data-login-status]')
  if (isGrapesDriveConnected()) {
    await disconnectGrapesDrive({ forgetAccount: false })
    setLocalMode(true)
    renderAccount()
    renderSync({ refreshed: true })
    showToast('A Drive leválasztva. A helyi adatok megmaradtak.')
    return
  }
  status.textContent = 'Google-fiók megnyitása…'
  try {
    await connectGrapesDrive()
    setLocalMode(false)
    status.textContent = ''
    showApp()
    showToast('Google Drive csatlakoztatva.')
    renderSync({ refreshed: true })
  } catch (error) {
    status.textContent = error?.message || 'A Google-bejelentkezés nem sikerült.'
    if (!login.hidden) return
    showToast(status.textContent)
  }
}

function projectRow(project) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'project-row project-row--button'
  button.dataset.projectName = `${project.name} ${project.folder}`.toLocaleLowerCase('hu-HU')
  const icon = document.createElement('span')
  icon.className = 'project-row__icon'
  icon.innerHTML = mobileIconSvg(project.icon || project.module)
  const copy = document.createElement('span')
  const strong = document.createElement('strong')
  strong.textContent = String(project.name || 'Névtelen projekt').replace(/\.grapes\.json$/i, '')
  const meta = document.createElement('span')
  const when = project.modifiedTime || project.updatedAt
    ? new Date(project.modifiedTime || project.updatedAt).toLocaleString('hu-HU',
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'helyi'
  meta.textContent = `${project.folder} · ${when}`
  copy.append(strong, meta)
  const arrow = document.createElement('span')
  arrow.textContent = '›'
  button.append(icon, copy, arrow)
  button.addEventListener('click', () => {
    if (project.water) return showPage('water')
    if (FRESH_OWNER_MODULES && project.module === 'finance') return openModule('finance')
    return project.module === 'ebook' && !project.id
      ? showPage('ebook') : openModule(project.module, project.id ? project : null)
  })
  return button
}

async function collectProjects() {
  const local = [
    { name: 'Mai étkezések', folder: 'Ételnapló', module: 'food', icon: 'food' },
    { name: 'Víznapló', folder: 'Egészség', module: 'food', icon: 'water', water: true },
    { name: 'E-book könyvtár', folder: 'E-book', module: 'ebook', icon: 'ebook' },
  ]
  if (FRESH_OWNER_MODULES) {
    // Do not expose global legacy or Drive projects under a TEST Auth login.
    // Only the verified native user's *own* new Finance metadata is listed;
    // Food/E-book remain unavailable until separate owner-path reviews.
    const { createGrapesTestFreshOwnerAccess } =
      await import('./storage/grapes-test-fresh-owner-access.js')
    const access = createGrapesTestFreshOwnerAccess({ enabled: true })
    return [...await access.listOwnedProjects(), ...local]
  }
  if (!isGrapesDriveConnected()) return local
  const groups = await Promise.all(moduleFolders.map(async ([folder, module, icon]) => {
    const projects = await listGrapesProjects(folder).catch(() => [])
    return projects.map(project => ({ ...project, folder, module, icon }))
  }))
  return [...groups.flat().sort((a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)), ...local]
}

async function renderProjects() {
  const list = $('[data-project-list]')
  if (!list) return
  list.innerHTML = '<div class="empty-state">Projektek betöltése…</div>'
  try {
    const projects = await collectProjects()
    list.replaceChildren(...projects.map(projectRow))
  } catch (error) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = `A projektlista most nem tölthető be. ${error?.message || ''}`
    list.replaceChildren(empty)
  }
}

function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function resetFreshWaterUi() {
  if (!FRESH_OWNER_MODULES) return
  ++waterProfileGeneration
  activeWaterProfileId = null
  freshWaterSession = null
  waterProfileLoading = null
  // The Water summary/cards are not owner-safe until native login resolves.
  $('[data-water-total]').textContent = '—'
  $('[data-water-log]').replaceChildren()
  $('[data-water-summary]').textContent = ''
  $('[data-water-week-bars]').replaceChildren()
  $('[data-water-week-average]').textContent = '—'
  $('[data-water-week-completed]').textContent = ''
  $('[data-water-remaining]').textContent = ''
  $('[data-water-ring]').style.setProperty('--water-progress', '0%')
  $$('[data-water-add], [data-action="water-goal"]').forEach(button => { button.disabled = true })
  const status = $('[data-water-storage-status]')
  status.textContent = 'A Water-fiók ellenőrzése…'
  status.hidden = false
}
function ensureWaterProfile() {
  if (!WATER_PROFILE_QA || activeWaterProfileId) return Promise.resolve()
  if (!waterProfileLoading) waterProfileLoading = (async () => {
    const generation = waterProfileGeneration
    if (FRESH_OWNER_MODULES) {
      const { openGrapesTestFreshWater } =
        await import('./water/grapes-test-fresh-water.js')
      const session = await openGrapesTestFreshWater({ enabled: true })
      await session.assertOwner()
      if (generation !== waterProfileGeneration) return
      freshWaterSession = session
      activeWaterProfileId = session.ownerId
      legacyWaterOwner = null
      return
    }
    const profileId = isGrapesAndroidApp()
      ? await getAndroidTestAuthSubject() : SYNTHETIC_WATER_PROFILE
    const ownerId = await getLocalWaterOwner()
    activeWaterProfileId = profileId
    legacyWaterOwner = ownerId
  })().then(() => { renderWater() }).catch(error => {
    if (FRESH_OWNER_MODULES) resetFreshWaterUi()
    const status = $('[data-water-storage-status]')
    status.textContent = `A TEST Water-profil nem ellenőrizhető: ${error?.message || 'ismeretlen hiba'}`
    status.hidden = false
  })
  return waterProfileLoading
}

function loadWaterStore() {
  return WATER_PROFILE_QA
    ? readProfileWater(localStorage, activeWaterProfileId)
    : readWaterStoreStrict(localStorage)
}

function currentWaterDay() {
  const raw = localStorage.getItem(waterStorageKey())
  const store = loadWaterStore()
  const key = dateKey()
  const saved = store[key]
  return { store, key, raw, day: { goal: Math.max(500, Number(saved?.goal) || 2000), entries: Array.isArray(saved?.entries) ? saved.entries : [] } }
}

function saveWaterDay(snapshot) {
  snapshot.store[snapshot.key] = snapshot.day
  saveWaterStore(snapshot.store, snapshot.raw)
}

function saveWaterStore(store, expectedRaw) {
  // Historical Health Connect imports and older Water diary entries are user
  // data. Do not silently prune them when a newer day is saved.
  writeWaterStoreVerified(localStorage, store, expectedRaw, waterStorageKey())
}

function importHydrationEntries(entries = []) {
  if (FRESH_OWNER_MODULES) {
    throw new Error('Automatikus Food/Health → Water adatátvitel letiltva a fiókelkülönítési teszt alatt.')
  }
  const original = localStorage.getItem(waterStorageKey())
  const store = loadWaterStore()
  const existingKeys = new Set(Object.values(store).flatMap(day => day?.entries || []).map(entry => entry.externalKey).filter(Boolean))
  let imported = 0
  for (const entry of entries) {
    if (!entry?.externalKey || existingKeys.has(entry.externalKey)) continue
    const at = new Date(entry.occurredAt)
    if (Number.isNaN(at.getTime())) continue
    const key = dateKey(at)
    const day = store[key] && typeof store[key] === 'object' ? store[key] : { goal: 2000, entries: [] }
    day.entries = Array.isArray(day.entries) ? day.entries : []
    day.entries.push({ id: crypto.randomUUID(), amount: Number(entry.amount), at: at.toISOString(), externalKey: entry.externalKey, source: entry.snapshot?.source?.attribution || 'Health Connect' })
    store[key] = day
    existingKeys.add(entry.externalKey)
    imported += 1
  }
  if (imported) { saveWaterStore(store, original); renderWater() }
  return imported
}

function hydrationExternalKeys() {
  if (FRESH_OWNER_MODULES) return []
  return Object.values(loadWaterStore())
    .flatMap(day => Array.isArray(day?.entries) ? day.entries : [])
    .map(entry => entry.externalKey)
    .filter(Boolean)
}

function formatWater(amount) {
  return `${new Intl.NumberFormat('hu-HU').format(amount)} ml`
}

function renderWater() {
  const status = $('[data-water-storage-status]')
  if (WATER_PROFILE_QA && !activeWaterProfileId) {
    $$('[data-water-add], [data-action="water-goal"]').forEach(button => { button.disabled = true })
    if (!waterProfileLoading) ensureWaterProfile()
    if (status.hidden) {
      status.textContent = 'A TEST Water-profil ellenőrzése…'
      status.hidden = false
    }
    return
  }
  let snapshot
  try { snapshot = currentWaterDay() } catch (error) {
    status.textContent = `A Víz napló nem olvasható: ${error?.message || 'ismeretlen hiba'} Az eredeti adat megmaradt.`
    status.hidden = false
    $$('[data-water-add], [data-action="water-goal"]').forEach(button => { button.disabled = true })
    $('[data-water-total]').textContent = '—'
    $('[data-water-log]').replaceChildren()
    return
  }
  status.textContent = ''; status.hidden = true
  $$('[data-water-add], [data-action="water-goal"]').forEach(button => { button.disabled = false })
  const claim = $('[data-water-legacy-claim]')
  if (claim) {
    claim.hidden = true
    if (WATER_PROFILE_QA && !FRESH_OWNER_MODULES) {
      const legacy = inspectLegacyWater(localStorage, legacyWaterOwner, activeWaterProfileId)
      const currentHasData = Object.keys(snapshot.store).length > 0
      if (legacy.status === 'available' || (legacy.status === 'claimed' && !currentHasData)) {
        claim.hidden = false
        $('[data-water-legacy-summary]').textContent =
          `Régi, még nem átvitt Víz napló: ${legacy.days} nap, ${legacy.entries} bejegyzés. Az eredeti helyi adat megmarad.`
        $('[data-water-legacy-claim-button]').disabled = currentHasData
      } else if (legacy.status === 'damaged') {
        claim.hidden = false
        $('[data-water-legacy-summary]').textContent =
          'A régi Víz napló sérült. Az eredeti adat megmaradt; az átvétel leállítva.'
        $('[data-water-legacy-claim-button]').disabled = true
      }
    }
  }
  const { day, store: waterStore } = snapshot
  const total = day.entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
  const percent = Math.min(100, total / day.goal * 100)
  $('[data-water-date]').textContent = `${new Date().toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })} · napi cél ${(day.goal / 1000).toLocaleString('hu-HU')} liter`
  $('[data-water-total]').textContent = formatWater(total)
  $('[data-water-goal-label]').textContent = `${formatWater(day.goal)} cél`
  $('[data-water-ring]').style.setProperty('--water-progress', `${percent}%`)
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const record = waterStore[dateKey(date)]
    const entries = Array.isArray(record?.entries) ? record.entries : []
    const amount = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
    return { date, amount, goal: Math.max(500, Number(record?.goal) || day.goal), hasEntries: entries.length > 0 }
  })
  const loggedDays = week.filter(item => item.hasEntries)
  const weeklyAverage = loggedDays.length ? loggedDays.reduce((sum, item) => sum + item.amount, 0) / loggedDays.length : 0
  const completedDays = week.filter(item => item.hasEntries && item.amount >= item.goal).length
  $('[data-water-week-average]').textContent = `Átlagosan ${(weeklyAverage / 1000).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} liter`
  $('[data-water-week-completed]').textContent = `${completedDays} nap teljesítve`
  const weekBars = $('[data-water-week-bars]')
  weekBars.replaceChildren()
  const chartMaximum = Math.max(day.goal, ...week.map(item => item.amount), 1)
  week.forEach((item, index) => {
    const column = document.createElement('div')
    column.className = `week-day${index === 6 ? ' is-today' : ''}`
    const bar = document.createElement('i')
    bar.style.height = `${Math.min(100, item.amount / chartMaximum * 100)}%`
    const label = document.createElement('span')
    label.textContent = index === 6 ? 'Ma' : item.date.toLocaleDateString('hu-HU', { weekday: 'short' }).replace('.', '')
    column.title = `${item.date.toLocaleDateString('hu-HU')}: ${formatWater(item.amount)}`
    column.append(bar, label)
    weekBars.append(column)
  })
  $('[data-water-summary]').textContent = `${Math.round(total / 250)} pohár · ${(total / 1000).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} l`
  const remaining = Math.max(0, day.goal - total)
  $('[data-water-message]').textContent = remaining ? (remaining <= 500 ? 'Már csak egy kicsi!' : 'Jó úton haladsz') : 'Megvan a napi cél!'
  $('[data-water-remaining]').textContent = remaining ? `Még ${formatWater(remaining)} hiányzik a napi célhoz.` : 'Szép munka — a mai cél teljesítve.'
  $('[data-action="water-goal"]').textContent = `Cél: ${(day.goal / 1000).toLocaleString('hu-HU')} l`
  const log = $('[data-water-log]')
  log.replaceChildren()
  if (!day.entries.length) {
    log.innerHTML = '<div class="empty-state">Ma még nincs bejegyzés. Adj hozzá egy pohár vizet!</div>'
    return
  }
  for (const entry of [...day.entries].reverse()) {
    const row = document.createElement('button')
    row.type = 'button'; row.className = 'water-log project-row--button'
    row.title = 'Koppints a bejegyzés törléséhez'
    row.innerHTML = `<span class="water-log__icon">${mobileIconSvg('water')}</span><span><strong>Víz</strong><span>${new Date(entry.at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })} · mentve</span></span><b>${formatWater(entry.amount)}</b>`
    row.addEventListener('click', async () => {
      try {
        if (FRESH_OWNER_MODULES && !freshWaterSession) throw new Error('A Water-fiók nem ellenőrizhető.')
        if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
        const next = currentWaterDay()
        next.day.entries = next.day.entries.filter(item => item.id !== entry.id)
        if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
        saveWaterDay(next); renderWater(); showToast('A vízbejegyzés törölve.')
      } catch (error) { renderWater(); showToast(error?.message || 'A Víz mentése nem sikerült.') }
    })
    log.append(row)
  }
}

async function addWater(amount) {
  try {
    if (FRESH_OWNER_MODULES) await freshWaterSession?.assertOwner()
    if (FRESH_OWNER_MODULES && !freshWaterSession) throw new Error('A fiók Water-tárhelye még nem nyílt meg.')
    const snapshot = currentWaterDay()
    snapshot.day.entries.push({ id: crypto.randomUUID(), amount, at: new Date().toISOString() })
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    saveWaterDay(snapshot)
    renderWater()
    showToast(`${formatWater(amount)} víz hozzáadva és mentve.`)
  } catch (error) { renderWater(); showToast(error?.message || 'A Víz mentése nem sikerült.') }
}

async function exportWaterBackup() {
  try {
    if (WATER_PROFILE_QA) await ensureWaterProfile()
    if (WATER_PROFILE_QA && !activeWaterProfileId) throw new Error('A TEST Water-profil nem ellenőrizhető.')
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    const json = WATER_PROFILE_QA
      ? profileWaterBackupToJson(localStorage, activeWaterProfileId)
      : waterBackupToJson(localStorage)
    const filename = `grapes-viznaplo-${dateKey()}.json`
    if (isGrapesAndroidApp()) {
      await saveAndroidJsonBackup(filename, json)
      showToast('A teljes Víz napló mentése elkészült.')
    } else {
      const blob = new Blob([json], {type:'application/json'})
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = filename
      document.body.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast('A Víz napló letöltését elindítottuk.')
    }
  } catch (error) { showToast(error?.message || 'A víznapló mentése nem sikerült.') }
}
async function inspectWaterBackup(event) {
  const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
  if (!file) return
  try {
    if (file.size > 80 * 1024 * 1024) throw new Error('A víznapló-mentés túl nagy.')
    if (WATER_PROFILE_QA) await ensureWaterProfile()
    if (WATER_PROFILE_QA && !activeWaterProfileId) throw new Error('A TEST Water-profil nem ellenőrizhető.')
    if (FRESH_OWNER_MODULES && !freshWaterSession) throw new Error('A Water-fiók nem ellenőrizhető.')
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    const incoming = WATER_PROFILE_QA
      ? profileWaterBackupFromJson(await file.text(), activeWaterProfileId,
        { allowLegacy: !FRESH_OWNER_MODULES })
      : { days: waterBackupFromJson(await file.text()), legacy: false }
    const restored = incoming.days
    const storageKey = waterStorageKey()
    const previousRaw = localStorage.getItem(storageKey)
    let old = {}, oldDamaged = false
    try { old = readWaterStoreStrict(localStorage, storageKey) }
    catch { oldDamaged = true /* Damaged bytes are checkpointed below. */ }
    const stats = waterBackupSummary(restored)
    const current = waterBackupSummary(old)
    const currentDescription = oldDamaged
      ? 'a telefonon sérült, nem olvasható Víz napló van; a bejegyzéseinek száma ismeretlen'
      : `a telefonon ${current.days} nap és ${current.entries} bejegyzés van`
    const legacyWarning = incoming.legacy
      ? ' Ez a régi mentés nem tartalmaz profilazonosítót; csak akkor rendeld ehhez a TEST-fiókhoz, ha bizonyosan a sajátod.' : ''
    if (!window.confirm(`Víz napló visszaállítása? A fájlban ${stats.days} nap és ${stats.entries} bejegyzés, ${currentDescription}. A jelenlegi vízadatok pontos bájtjai külön megmaradnak.${legacyWarning} Csak saját biztonsági mentésből folytasd.`)) return
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    if (localStorage.getItem(storageKey) !== previousRaw) throw new Error('A Víz napló időközben megváltozott.')
    restoreWaterBackupVerified(localStorage, restored, crypto.randomUUID(), storageKey)
    renderWater()
    showToast('A víznapló visszaállítva; a korábbi állapot külön megmaradt.')
  } catch (error) { showToast(error?.message || 'A Víz napló visszaállítása nem sikerült.') }
}

async function changeWaterGoal() {
  let snapshot
  try {
    if (FRESH_OWNER_MODULES && !freshWaterSession) throw new Error('A Water-fiók nem ellenőrizhető.')
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    snapshot = currentWaterDay()
  } catch (error) { renderWater(); showToast(error.message); return }
  const { day } = snapshot
  const entered = window.prompt('Napi vízcél milliliterben:', String(day.goal))
  if (entered === null) return
  const goal = Number(entered.replace(/\s/g, ''))
  if (!Number.isFinite(goal) || goal < 500 || goal > 10000) return showToast('A cél 500 és 10 000 ml között lehet.')
  day.goal = Math.round(goal / 50) * 50
  try {
    if (FRESH_OWNER_MODULES) await freshWaterSession.assertOwner()
    saveWaterDay(snapshot); renderWater(); showToast('A napi vízcél mentve.')
  }
  catch (error) { renderWater(); showToast(error?.message || 'A vízcél mentése nem sikerült.') }
}

$('[data-local]').addEventListener('click', () => { setLocalMode(true); showApp() })
$('[data-login]').addEventListener('click', connectDrive)
$('[data-connect-drive]').addEventListener('click', connectDrive)
$('[data-account-login]').addEventListener('click', openAccountLogin)
// This is a different account from the Google Drive/E-book connection above.
// Only the QA native host reveals the setting after confirming TEST Auth is ON.
const grapesTestLogout = $('[data-grapes-test-logout]')
const migrationPreviewButton = $('[data-grapes-test-migration-scan]')
const migrationBackupButton = $('[data-grapes-test-migration-backup]')
const migrationDriveScanButton = $('[data-grapes-test-migration-drive-scan]')
const migrationPreviewFlag =
  import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_MIGRATION_PREVIEW_ENABLED === 'true'
const foodSyntheticQaPanel = $('[data-grapes-test-food-qa]')
const foodSyntheticQaFlag =
  import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_DATA_ENABLED === 'true' &&
  import.meta.env?.VITE_GRAPES_TEST_FOOD_SYNTHETIC_ENABLED === 'true'
if (grapesTestLogout) {
  grapesTestLogout.addEventListener('click', () => {
    grapesTestLogout.disabled = true
    try {
      requestAndroidTestAccountSignOut()
    } catch {
      grapesTestLogout.disabled = false
      showToast('A Grapes TEST-kijelentkezés nem indítható.')
    }
  })
  if (isGrapesAndroidApp()) {
    getAndroidTestAuthEnabled().then(enabled => {
      if (enabled) {
        // Only hydrate the QA-only SVG when the native host verified TEST Auth.
        // In PROD and web preview the hidden row must not affect icon-count
        // checks or render an unused "exit" graphic.
        const icon = grapesTestLogout.querySelector('[data-test-exit-icon]')
        if (icon) icon.innerHTML = mobileIconSvg('exit')
      }
      grapesTestLogout.hidden = !enabled
      if (migrationPreviewButton) migrationPreviewButton.hidden = !(enabled && migrationPreviewFlag)
      if (foodSyntheticQaPanel) foodSyntheticQaPanel.hidden = !(enabled && foodSyntheticQaFlag)
    }).catch(() => {
      grapesTestLogout.hidden = true
      if (migrationPreviewButton) migrationPreviewButton.hidden = true
      if (foodSyntheticQaPanel) foodSyntheticQaPanel.hidden = true
    })
  }
} 

if (foodSyntheticQaPanel) {
  const qaActions = [
    ['prepare', '[data-grapes-test-food-prepare]'],
    ['save', '[data-grapes-test-food-save]'],
    ['readBack', '[data-grapes-test-food-read]'],
    ['isolation', '[data-grapes-test-food-isolation]'],
  ]
  const qaStatus = $('[data-grapes-test-food-status]')
  for (const [method, selector] of qaActions) {
    const button = $(selector)
    if (!button) continue
    button.addEventListener('click', async () => {
      if (!foodSyntheticQaFlag || !isGrapesAndroidApp()) return
      for (const [, key] of qaActions) { const b = $(key); if (b) b.disabled = true }
      qaStatus.dataset.state = 'pending'
      qaStatus.textContent = 'Szintetikus TEST-próba ellenőrzése…'
      try {
        if (!(await getAndroidTestAuthEnabled())) throw new Error('A natív Grapes TEST kapu nem aktív.')
        let result
        if (method === 'isolation') {
          const { createGrapesTestOnePhoneIsolationProbe } =
            await import('./sync/grapes-test-one-phone-isolation.js')
          result = await createGrapesTestOnePhoneIsolationProbe({ enabled: true }).verify()
        } else {
          const { createGrapesTestSyntheticFoodTrial } =
            await import('./sync/grapes-test-synthetic-food-trial.js')
          result = await createGrapesTestSyntheticFoodTrial({ enabled: true })[method]()
        }
        qaStatus.dataset.state = method === 'readBack' || method === 'isolation' ? 'success' : 'pending'
        qaStatus.textContent = method === 'prepare'
          ? 'A próba tartós offline sorba került (' + result.status + '). A mentés még nincs igazolva.'
          : method === 'save'
            ? 'A mentési kísérlet szerveroldali előzménye igazolt (rev. ' + result.revision + '). Visszaolvasás még szükséges.'
            : method === 'isolation'
              ? 'PASS: a másik TEST-fiók szintetikus szerveradatai nem olvashatók. A helyi Food-adatok elkülönítése NEM igazolt.'
              : 'PASS: a külön szerveroldali Food-visszaolvasás egyezik (rev. ' + result.revision + ').'
      } catch (error) {
        qaStatus.dataset.state = 'error'
        qaStatus.textContent = 'NEM IGAZOLT: ' + (error?.message || 'A TEST-próba megszakadt.')
      } finally {
        for (const [, key] of qaActions) { const b = $(key); if (b) b.disabled = false }
      }
    })
  }
}
// QA-only native subject-bound LOCAL test, separate from Supabase Food and Drive.
// Default OFF: old local Food/Finance/Water/Book paths are not changed.
const localOwnerQaFlag =
  import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true' &&
  import.meta.env?.VITE_GRAPES_TEST_LOCAL_OWNER_QA_ENABLED === 'true'
if (localOwnerQaFlag && isGrapesAndroidApp() && grapesTestLogout) {
  const panel = document.createElement('section')
  panel.className = 'sync-status'
  panel.hidden = true
  panel.setAttribute('aria-label', 'Helyi felhasználói tároló szintetikus TEST')
  const title = document.createElement('strong')
  title.textContent = 'Helyi fióktárhely TEST · csak mesterséges adatok'
  const warning = document.createElement('p')
  warning.textContent = 'Nem a normál Food/Finance-adatok tesztje. Nem olvassa, nem írja és nem költözteti át a régi adatokat. A normál modulok elkülönítése továbbra is NEM IGAZOLT.'
  const actions = [
    ['prepare', '1. Saját helyi próbarekordok előkészítése'],
    ['readBack', '2. Saját helyi próbarekordok visszaolvasása'],
  ]
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'Még nem indult helyi fiókpróba.'
  const buttons = actions.map(([method, caption]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'grapes-test-food-action'
    button.textContent = caption
    button.addEventListener('click', async () => {
      if (!localOwnerQaFlag || !isGrapesAndroidApp()) return
      buttons.forEach(item => { item.disabled = true })
      status.dataset.state = 'pending'
      status.textContent = 'Natív fiókazonosító és helyi próbarekordok ellenőrzése…'
      try {
        const { createGrapesTestNativeOwnerTrial } =
          await import('./storage/grapes-test-native-owner-qa.js')
        const result = await createGrapesTestNativeOwnerTrial({ enabled: true })[method]()
        status.dataset.state = method === 'readBack' ? 'success' : 'pending'
        status.textContent = method === 'readBack'
          ? 'PASS: a belépett TEST-fiók mindkét saját, mesterséges helyi rekordja elkülönítve és változatlanul visszaolvasható. A normál modulok még NEM igazoltak.'
          : 'A saját fiók ' + result.created + ' mesterséges helyi rekordja elkészült vagy korábban megvolt. Kérlek, indítsd a 2. ellenőrzést.'
      } catch (error) {
        status.dataset.state = 'error'
        status.textContent = 'NEM IGAZOLT: ' + (error?.message || 'A helyi próba megszakadt.')
      } finally {
        buttons.forEach(item => { item.disabled = false })
      }
    })
    return button
  })
  panel.append(title, warning, ...buttons, status)
  grapesTestLogout.before(panel)
  getAndroidTestAuthEnabled().then(enabled => {
    panel.hidden = !enabled
  }).catch(() => { panel.hidden = true })
}

// TEST v28: explicit user-initiated, SYNTHETIC-ONLY Android SAF rehearsal.
// This panel must never inspect legacy projects or initiate real migration.
const syntheticSafQaFlag =
  import.meta.env?.VITE_GRAPES_TEST_CHANNEL === '1' &&
  import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true' &&
  import.meta.env?.VITE_GRAPES_TEST_SAF_SYNTHETIC_QA_ENABLED === 'true'
if (syntheticSafQaFlag && isGrapesAndroidApp() && grapesTestLogout) {
  const panel = document.createElement('section')
  panel.className = 'sync-status'
  panel.hidden = true
  panel.setAttribute('aria-label', 'Mesterséges Android fájlmentési próba')
  const title = document.createElement('strong')
  title.textContent = 'Fájlmentés TEST · csak mesterséges adatok'
  const warning = document.createElement('p')
  warning.textContent = 'Nem készít mentést a valódi Food, Water, Finance vagy E-book adataidról. A fájlválasztóban új grapes-helyi-teszt-... JSON-fájlt ments, ne írj felül korábbi mentést.'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'grapes-test-food-action'
  button.textContent = '1. Mesterséges mentés fájlba és külön visszaolvasás'
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'A próba még nem indult el.'
  button.addEventListener('click', async () => {
    if (!syntheticSafQaFlag || !isGrapesAndroidApp()) return
    button.disabled = true
    status.dataset.state = 'pending'
    status.textContent = 'Válassz mentési helyet az Androidon. A mentett fájlt a Grapes külön visszaolvassa…'
    try {
      const { createGrapesTestSyntheticSafTrial } =
        await import('./sync/grapes-test-synthetic-saf-trial.js')
      const result = await createGrapesTestSyntheticSafTrial({ enabled: true }).run()
      status.dataset.state = 'success'
      status.textContent = 'PASS: ' + result.sources +
        ' mesterséges forrás Android-fájlmentése és SHA-256 visszaolvasása egyezik (' +
        result.bytes + ' bájt). Ez NEM valódi adatmentés.'
    } catch (error) {
      status.dataset.state = 'error'
      status.textContent = 'NEM IGAZOLT: ' + (error?.message || 'A mentés megszakadt.')
    } finally {
      button.disabled = false
    }
  })
  panel.append(title, warning, button, status)
  grapesTestLogout.before(panel)
  getAndroidTestAuthEnabled().then(enabled => {
    panel.hidden = !enabled
  }).catch(() => { panel.hidden = true })
}

if (migrationPreviewButton) migrationPreviewButton.addEventListener('click', async () => {
  if (!migrationPreviewFlag || !isGrapesAndroidApp()) return
  const panel = $('[data-grapes-test-migration-results]')
  const status = $('[data-grapes-test-migration-status]')
  const list = $('[data-grapes-test-migration-list]')
  migrationPreviewButton.disabled = true
  panel.hidden = false
  status.textContent = 'Helyi adatok ellenőrzése…'
  list.replaceChildren()
  if (migrationBackupButton) migrationBackupButton.hidden = true
  if (migrationDriveScanButton) migrationDriveScanButton.hidden = true
  $('[data-grapes-test-migration-drive-status]').textContent = ''
  try {
    if (!(await getAndroidTestAuthEnabled())) throw new Error('TEST Auth is unavailable')
    const [{ captureV24LocalHealthSources }, { summarizeV24HealthInventory }] = await Promise.all([
      import('./sync/grapes-health-v24-local-reader.js'),
      import('./sync/grapes-health-v24-preview-summary.js')
    ])
    const summary = summarizeV24HealthInventory(await captureV24LocalHealthSources())
    if (migrationBackupButton) migrationBackupButton.hidden = summary.sources === 0
    if (migrationDriveScanButton) migrationDriveScanButton.hidden = !isGrapesDriveConnected()
    status.textContent = summary.sources
      ? 'Csak előnézet. Az adatok a készüléken maradtak; fiókhoz rendelés szükséges.'
      : 'Nem található helyi Food vagy Víz forrás. Adatátvitel nem történt.'
    const lines = [
      `${summary.sources} helyi forrás · ${summary.records} rekord`,
      ...summary.counts.map(item => `${item.label}: ${item.count}`),
      ...summary.blockers.map(item => `Még nem vihető át – ${item.label}: ${item.count}`)
    ]
    list.replaceChildren(...lines.map(line => {
      const row = document.createElement('li')
      row.textContent = line
      return row
    }))
  } catch {
    status.textContent = 'Az előnézet nem készíthető el. Az eredeti adatok változatlanok.'
    list.replaceChildren()
  } finally {
    migrationPreviewButton.disabled = false
  }
})
if (migrationBackupButton) migrationBackupButton.addEventListener('click', async () => {
  if (!migrationPreviewFlag || !isGrapesAndroidApp()) return
  const status = $('[data-grapes-test-migration-status]')
  migrationBackupButton.disabled = true
  try {
    if (!(await getAndroidTestAuthEnabled())) throw new Error('TEST Auth is unavailable')
    if (!window.confirm('A mentés személyes Health-adatokat tartalmaz. Válassz biztonságos helyet a készüléken. Folytatod?')) {
      status.textContent = 'Nem készült mentés; az eredeti adatok változatlanok.'
      return
    }
    status.textContent = 'Mentés készítése és visszaellenőrzése…'
    const [{ captureV24LocalHealthSources }, {
      prepareV24HealthBackup, assertVerifiedV24HealthBackup
    }] = await Promise.all([
      import('./sync/grapes-health-v24-local-reader.js'),
      import('./sync/grapes-health-v24-verified-backup.js')
    ])
    const prepared = await prepareV24HealthBackup(await captureV24LocalHealthSources())
    const receipt = await saveAndroidVerifiedHealthBackup(prepared)
    const verified = assertVerifiedV24HealthBackup(prepared, receipt,
      await captureV24LocalHealthSources())
    status.textContent = `A helyi mentés visszaolvasva és ellenőrizve (${verified.sources} forrás). Az adatokat nem rendeltük fiókhoz és nem töltöttük fel.`
  } catch {
    status.textContent = 'A mentés nem igazolható. Az eredeti adatok változatlanok; ne kezdd el az adatátvitelt.'
  } finally {
    migrationBackupButton.disabled = false
  }
})
if (migrationDriveScanButton) migrationDriveScanButton.addEventListener('click', async () => {
  if (!migrationPreviewFlag || !isGrapesAndroidApp()) return
  const status = $('[data-grapes-test-migration-drive-status]')
  migrationDriveScanButton.disabled = true
  status.textContent = 'Drive Health-fájlok metaadatainak ellenőrzése…'
  try {
    if (!(await getAndroidTestAuthEnabled()) || !isGrapesDriveConnected()) {
      throw new Error('TEST Auth or Drive session is unavailable')
    }
    const { discoverConnectedTestDriveFoodFiles } = await import(
      './sync/grapes-health-v24-drive-client.js')
    const result = await discoverConnectedTestDriveFoodFiles()
    status.textContent = `Drive: ${result.files.length} látható Health-fájl. Csak metaadat; a tartalom és a fiókhoz tartozás nincs ellenőrizve.`
  } catch {
    status.textContent = 'A Drive-áttekintés nem készíthető el. Drive- vagy helyi adat nem változott.'
  } finally {
    migrationDriveScanButton.disabled = false
  }
})
$('[data-notifications]').addEventListener('click', openUpdateInbox)
$('[data-food-share-open]').addEventListener('click', async () => {
  if (FRESH_OWNER_MODULES) return showToast('A Food-megosztások még nincsenek fiókhoz kötve.')
  closeSheet()
  showPage('food')
  await mobileFood?.load()
  await mobileFood?.refreshInbox({ open: true })
  renderUpdateInbox()
})
$('[data-update-install]').addEventListener('click', async event => {
  if (!availableAppUpdate) return
  const status = $('[data-update-status]')
  event.currentTarget.disabled = true
  status.textContent = 'A frissítés letöltése elindul…'
  try {
    await installAndroidAppUpdate(availableAppUpdate.versionCode)
    status.textContent = 'A letöltés elindult. A telepítő hamarosan megnyílik.'
  } catch (error) {
    status.textContent = error?.message || 'A frissítés most nem indítható el.'
    event.currentTarget.disabled = false
  }
})
$('[data-sync-refresh]').addEventListener('click', () => renderSync({ refreshed: true }))
$('[data-sync-projects]').addEventListener('click', () => showPage('projects'))
$$('[data-nav]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.nav)))
$$('[data-menu-group]').forEach(button => button.addEventListener('click', () => {
  const group = button.dataset.menuGroup
  if (['home', 'health', 'utility', 'finance'].includes(group)) showPage('hub-' + group)
}))
$$('[data-menu-back]').forEach(button => button.addEventListener('click', () => showPage('home')))
// Keep the Health menu visible until Statistics is loaded; prevent a Food flash.
let statsOpenGeneration = 0
async function openHealthStats(button) {
  if (FRESH_OWNER_MODULES) {
    // Statistics uses the Food controller's already scoped local records.
    // No Health read, import, or Drive call is made in this branch.
    try {
      await mobileFood.load()
      if (activePage !== 'hub-health') return
      showPage('food', { parent: 'hub-health', entry: 'stats', skipFoodLoad: true })
      mobileFood.openNavigationView('stats')
    } catch (error) { showToast(error?.message || 'A Food nem ellenőrizhető.') }
    return
  }
  const generation = ++statsOpenGeneration
  button.disabled = true
  button.setAttribute('aria-busy', 'true')
  try {
    await mobileFood.load()
    if (generation !== statsOpenGeneration || activePage !== 'hub-health') return
    const statsSheet = $('[data-food-stats-sheet]')
    const oldTransition = statsSheet.style.transition
    statsSheet.style.transition = 'none'
    try {
      showPage('food', { parent: 'hub-health', entry: 'stats', skipFoodLoad: true })
      mobileFood.openNavigationView('stats')
      if (!statsSheet.classList.contains('is-open')) throw new Error('A Statisztika nem nyílt meg.')
    } finally {
      requestAnimationFrame(() => requestAnimationFrame(() => { statsSheet.style.transition = oldTransition }))
    }
    mobileFood.autoImportHealth().catch(() => {})
    mobileFood.autoImportYazio().catch(() => {})
  } catch (error) {
    if (activePage === 'food') showPage('hub-health')
    showToast(error?.message || 'A Statisztika jelenleg nem érhető el.')
  } finally {
    button.disabled = false
    button.removeAttribute('aria-busy')
  }
}
$$('[data-menu-destination]').forEach(button => button.addEventListener('click', () => {
  const destination = button.dataset.menuDestination
  const parent = button.closest('[data-page]')?.dataset.page
  if (!['hub-home', 'hub-health', 'hub-utility', 'hub-finance'].includes(parent)) return
  if (parent === 'hub-home' && ['inventory', 'shopping'].includes(destination)) {
    showPage('household', { parent, entry: destination })
  } else if (parent === 'hub-health' && destination === 'stats') {
    openHealthStats(button)
  } else if (parent === 'hub-health' && ['food', 'recipes'].includes(destination)) {
    showPage('food', { parent, entry: destination === 'food' ? 'overview' : destination })
  } else if (parent === 'hub-utility' && destination === 'ebook') {
    showPage('ebook', { parent, entry: destination })
  } else if ((parent === 'hub-utility' && destination === 'qr') || (parent === 'hub-finance' && destination === 'finance')) {
    openModule(destination)
  }
}))
// Food still owns its detail/editor navigation. Only the root shortcut Back
// goes to Health instead of exposing an extra Food overview screen.
$('[data-food-recipes-back]').addEventListener('click', event => {
  if (activePage !== 'food' || menuReturnPage !== 'hub-health' || menuEntry !== 'recipes') return
  event.stopImmediatePropagation()
  showPage('hub-health')
}, true)
$('[data-food-stats-back]').addEventListener('click', event => {
  if (activePage !== 'food' || menuReturnPage !== 'hub-health' || menuEntry !== 'stats') return
  event.stopImmediatePropagation()
  showPage('hub-health')
}, true)
$$('[data-module]').forEach(button => button.addEventListener('click', () => {
  const module = button.dataset.module
  if (module === 'food' || module === 'ebook' || module === 'household') showPage(module)
  else openModule(module)
}))
$$('[data-open-module]').forEach(button => button.addEventListener('click', () => openModule(button.dataset.openModule)))
$$('[data-ebook-view]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.ebookView)))
$('[data-ebook-import]').addEventListener('click', () => $('[data-ebook-file]').click())
$('[data-ebook-file]').addEventListener('change', event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; importMobileEbook(file) })
$('[data-reader-open]').addEventListener('click', () => startReader($('[data-reader-book]').value))
$('[data-reader-chapter]').addEventListener('change', async event => {
  await persistReaderProgress().catch(() => {})
  const index = mobileReader?.chapters.findIndex(chapter => chapter.id === event.currentTarget.value) ?? -1
  if (index >= 0) { await showReaderChapter(index, 0); scheduleReaderProgressSave() }
})
$('[data-reader-page]').addEventListener('scroll', scheduleReaderProgressSave, { passive: true })
$('[data-reader-prev]').addEventListener('click', () => moveReaderPage(-1))
$('[data-reader-next]').addEventListener('click', () => moveReaderPage(1))
$('[data-reader-fullscreen]').addEventListener('click', () => setReaderFullscreen(!$('[data-reader-shell]').classList.contains('is-fullscreen')))
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && $('[data-reader-shell]').classList.contains('is-fullscreen')) setReaderFullscreen(false)
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('[data-reader-shell]').classList.contains('is-fullscreen')) setReaderFullscreen(false)
})
$$('[data-reader-font]').forEach(button => button.addEventListener('click', () => {
  const page = $('[data-reader-page]')
  const current = Number(page.dataset.fontSize) || 16
  const next = Math.min(24, Math.max(13, current + Number(button.dataset.readerFont)))
  page.dataset.fontSize = String(next)
  page.style.setProperty('--reader-font-size', `${next}px`)
  scheduleReaderProgressSave()
}))
$('[data-transfer-prepare]').addEventListener('click', prepareTransfer)
$('[data-transfer-code]').addEventListener('click', event => {
  const frame = $('[data-transfer-frame]')
  frame.src = event.currentTarget.dataset.url || ''
  frame.hidden = !frame.src
})
$('[data-transfer-revoke]').addEventListener('click', async () => {
  if (!activeTransferBookId || !window.confirm('A korábbi QR-kód és letöltési link többé nem fog működni. Visszavonod?')) return
  const status = $('[data-transfer-status]')
  try {
    const count = await revokeMobileBookTransfer(activeTransferBookId)
    $('[data-transfer-result]').hidden = true; activeTransferBookId = ''
    status.textContent = count ? 'A könyv nyilvános hozzáférése visszavonva.' : 'A könyvhöz már nem tartozott nyilvános hozzáférés.'; status.dataset.kind = 'success'
  } catch (error) { status.textContent = `A visszavonás nem sikerült. ${error?.message || ''}`; status.dataset.kind = 'error' }
})
$('[data-reader-pair]').addEventListener('click', pairMobileLibrary)
window.addEventListener('message', event => {
  if (!activePairingNonce || !isTrustedPairingMessage(event, activePairingNonce)) return
  const status = $('[data-transfer-status]')
  if (event.data?.type === 'grapes-reader-pairing-error') {
    status.textContent = String(event.data?.message || 'A párosítási kód nem készült el.'); status.dataset.kind = 'error'
  } else if (event.data?.type === 'grapes-reader-pairing-code' && /^[A-Z0-9]{6}$/.test(String(event.data?.code || ''))) {
    $('[data-reader-pair-value]').value = String(event.data.code).toUpperCase()
    status.textContent = 'A párosítási kód elkészült.'; status.dataset.kind = 'success'
  } else return
  activePairingNonce = ''
  $('[data-reader-pair-frame]').hidden = true
})
$('[data-water-open]').addEventListener('click', event => { if (!event.target.closest('[data-water-add]')) showPage('water') })
$('[data-water-open]').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') showPage('water') })
$$('[data-water-add]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); addWater(Number(button.dataset.waterAdd)) }))
$('[data-action="water-goal"]').addEventListener('click', changeWaterGoal)
$('[data-water-export]')?.addEventListener('click', exportWaterBackup)
$('[data-water-restore]')?.addEventListener('click', () => $('[data-water-backup-input]')?.click())
$('[data-water-backup-input]')?.addEventListener('change', inspectWaterBackup)
$('[data-water-legacy-claim-button]')?.addEventListener('click', async event => {
  if (!WATER_PROFILE_QA || !activeWaterProfileId || FRESH_OWNER_MODULES) return
  const button = event.currentTarget
  button.disabled = true
  try {
    const legacy = inspectLegacyWater(localStorage, await getLocalWaterOwner(), activeWaterProfileId)
    if (!['available', 'claimed'].includes(legacy.status)) throw new Error('A régi Víz napló nem vehető át.')
    if (!window.confirm(`A régi, profil nélküli Víz napló ${legacy.days} napját és ${legacy.entries} bejegyzését ehhez a TEST-fiókhoz rendeled? Az eredeti adat megmarad; másik fiókhoz később nem rendelhető.`)) return
    await claimLegacyWater(localStorage, activeWaterProfileId, claimLocalWaterOwner)
    legacyWaterOwner = activeWaterProfileId
    renderWater()
    showToast('A régi Víz napló ehhez a TEST-fiókhoz másolva; az eredeti megmaradt.')
  } catch (error) { showToast(error?.message || 'A régi Víz napló átvétele nem sikerült.') }
  finally { button.disabled = false }
})

$('[data-health-sync]').addEventListener('click', () => openSyncImport('health'))
$('[data-water-health-open]')?.addEventListener('click', () => openWaterHealthSheet())
$('[data-water-health-read]')?.addEventListener('click', () => {
  if (FRESH_OWNER_MODULES && activeWaterImportSource === 'samsung') {
    samsungWaterFileInput?.click()
    return
  }
  readWaterHealthPreview().catch(() => {})
})
$('[data-samsung-water-csv-input]')?.addEventListener('change', event => {
  const file = event.currentTarget.files?.[0]
  event.currentTarget.value = ''
  if (file && activeWaterImportSource === 'samsung') {
    readWaterHealthPreview(file).catch(() => {})
  }
})
$('[data-water-health-confirm]')?.addEventListener('click', () => confirmWaterHealthPreview().catch(() => {}))
$$('[data-samsung-sync-action]').forEach(button => button.addEventListener('click', () =>
  FRESH_OWNER_MODULES ? openWaterHealthSheet('samsung') : openSyncImport('samsung')))
const yazioApiPanel = createYazioApiPanel({ openSheet, closeSheet,
  importBundle: source => mobileFood.importYazio(source), openFileImport: () => openSyncImport('yazio'),
  getProfileKey: () => { const account = getGrapesAccount(); return account?.id || account?.email || 'local-food-profile' } })
$('[data-yazio-import]').addEventListener('click', () => {
  if (FRESH_OWNER_MODULES) return openSyncImport('yazio')
  yazioApiPanel.open()
})
$('[data-fresh-yazio-confirm]')?.addEventListener('click',
  () => confirmFreshYazioPreview().catch(() => {}))
$('[data-fresh-yazio-direct-open]')?.addEventListener('click', openFreshYazioDirect)
$('[data-fresh-yazio-direct-form]')?.addEventListener('submit',
  event => submitFreshYazioDirect(event).catch(() => {}))
$('[data-sync-import-confirm]').addEventListener('click', () => runSyncImport())
$('[data-sync-health-settings]').addEventListener('click', async () => {
  try { await openAndroidHealthConnectSettings(); $('[data-sync-import-status]').textContent = 'A Health Connect beállításai megnyíltak.' }
  catch (error) { $('[data-sync-import-status]').textContent = error?.message || 'A Health Connect beállításai nem nyithatók meg.' }
})
$('[data-yazio-undo]').addEventListener('click', async () => {
  if (FRESH_OWNER_MODULES) return undoFreshYazioLast()
  try {
    await mobileFood.undoYazio()
    closeSheet()
    setSyncProviderStatus('Az utolsó YAZIO-import visszavonva.')
  } catch (error) { showToast(error.message) }
})
$('[data-yazio-input]').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
  if (FRESH_OWNER_MODULES) return prepareFreshYazioFile(file)
  if (!file) return
  if (file.size > 40 * 1024 * 1024) { $('[data-yazio-status]').textContent = 'A YAZIO-export legfeljebb 40 MB lehet.'; return }
  const status = $('[data-yazio-status]'); status.textContent = 'Yazio-adatok ellenőrzése…'
  try {
    const result = await mobileFood.importYazio(await file.text())
    if (result.pending) { status.textContent = 'JSON-import előnézete megnyitva. Még nem került be új rekord.'; return }
    status.textContent = result.cancelled
      ? 'Az import megszakítva.'
      : result.imported
        ? `${result.imported} étkezés importálva.${result.duplicate ? ` ${result.duplicate} korábbi sor kihagyva.` : ''}`
        : `Nincs új étkezés. ${result.duplicate} korábbi sor kihagyva, ${result.invalid} hibás sor.`
  } catch (error) { status.textContent = error?.message || 'A Yazio-import nem sikerült.' }
})
$('[data-project-search]').addEventListener('input', event => {
  const query = event.currentTarget.value.trim().toLocaleLowerCase('hu-HU')
  $$('[data-project-name]').forEach(row => { row.hidden = query && !row.dataset.projectName.includes(query) })
})
$$('[data-action]').forEach(button => {
  if (button.dataset.action === 'water-goal' || button.matches('[data-sync-refresh], [data-sync-projects]')) return
  button.addEventListener('click', () => showToast('Ez a művelet a következő mobilos körben kap saját nézetet.'))
})
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheet() })
sheetBackdrop.addEventListener('click', closeSheet)
window.addEventListener('grapes:android-update', event => setAvailableAppUpdate(event.detail))
window.addEventListener('grapes:food-inbox-changed', renderUpdateInbox)
onGrapesDriveChange(() => {
  mobileEbooks = []
  if (!isGrapesDriveConnected()) { mobileReader = null; mobileReaderBook = null }
  else if (!FRESH_OWNER_MODULES) registerFoodSharing().catch(() => {})
  if (!FRESH_OWNER_MODULES) mobileFood?.load({ force: true }).catch(() => {})
  renderAccount(); renderProjects(); renderSync()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (FRESH_OWNER_MODULES && freshYazioDirectSheet?.classList.contains('is-open')) closeSheet()
    if (FRESH_OWNER_MODULES && freshYazioSheet?.classList.contains('is-open')) {
      closeSheet() // old native Auth may have changed while Android file chooser was open
    }
    if (FRESH_OWNER_MODULES) {
      resetFreshWaterUi()
      if (activePage === 'water') renderWater()
    }
    if (FRESH_OWNER_MODULES && waterHealthSheet?.classList.contains('is-open')) {
      closeSheet() // An Android permission dialog may have changed Grapes Auth.
    }
    updateHomeGreeting()
    refreshUpdateInbox().catch(() => {})
    if (FRESH_OWNER_MODULES && activePage === 'household') {
      household.clear()
      household.load().catch(() => {})
    }
    if (FRESH_OWNER_MODULES && ['ebook', 'reader'].includes(activePage)) {
      const page = activePage
      resetFreshEbookUi()
      if (page === 'ebook') renderMobileEbooks().catch(() => {})
      else renderReaderPicker().catch(() => {})
    }
    if (FRESH_OWNER_MODULES && activePage === 'food') {
      // Native login may have changed while this WebView was backgrounded:
      // hide old UI first, then revalidate Grapes Auth and reload only own Food.
      const foodPage = $('[data-page="food"]')
      if (foodPage) { foodPage.inert = true; foodPage.style.visibility = 'hidden' }
      mobileFood?.load({ force: true }).catch(() => {})
    }
  }
  if (document.visibilityState === 'hidden') {
    if (FRESH_OWNER_MODULES && freshYazioDirectSheet?.classList.contains('is-open')) closeSheet()
    if (FRESH_OWNER_MODULES && freshYazioSheet?.classList.contains('is-open')) closeSheet()
    if (FRESH_OWNER_MODULES) resetFreshWaterUi()
    if (FRESH_OWNER_MODULES && waterHealthSheet?.classList.contains('is-open')) closeSheet()
    if (FRESH_OWNER_MODULES) household.clear()
    persistReaderProgress().catch(() => {})
    mobileFood?.flush().catch(() => {})
  }
})

mobileFood = createMobileFoodController({
  fab,
  addSheet: sheet,
  backdrop: sheetBackdrop,
  showToast,
  openLegacy: (module, view, itemId, action) => openModule(module, null, view, itemId, action),
  sendMeal: sendMealShare,
  sendRecipe: sendRecipeShare,
  onHydrationImport: importHydrationEntries,
  getHydrationExternalKeys: hydrationExternalKeys,
  freshOwnerMode: FRESH_OWNER_MODULES,
})
hydrateMobileIcons()
installSheetGestures()
refreshUpdateInbox()
window.grapesHandleAndroidBack = () => {
  if ($('[data-notifications-sheet].is-open')) { closeSheet(); return true }
  if (activePage === 'household' && household.handleBack()) return true
  if (activePage === 'food' && menuReturnPage === 'hub-health') {
    if (menuEntry === 'stats' && $('[data-food-stats-sheet].is-open')) { showPage('hub-health'); return true }
    if (menuEntry === 'recipes' && !$('[data-food-recipes-view]').hidden && !$('.bottom-sheet.is-open')) { showPage('hub-health'); return true }
  }
  if (activePage === 'food' && mobileFood?.handleBack()) return true
  if ($('.bottom-sheet.is-open')) { closeSheet(); return true }
  if ($('[data-reader-shell]').classList.contains('is-fullscreen')) { setReaderFullscreen(false); return true }
  if (activePage !== 'home') {
    if (['reader', 'transfer'].includes(activePage)) showPage('ebook', { parent: menuReturnPage, entry: 'ebook' })
    else showPage(menuReturnPage || 'home')
    return true
  }
  return false
}
renderWater()
if (!FRESH_OWNER_MODULES) {
  if (isGrapesDriveConnected()) registerFoodSharing().catch(() => {})
}
// A verified Grapes TEST account is the main-app entry gate. Do not route
// such users through the old, unrelated Google Drive welcome screen first.
// This is QA-only and does NOT change the Drive account or localMode flag.
const qaNativeAuthenticated =
  import.meta.env?.VITE_GRAPES_TEST_AUTH_ENABLED === 'true' &&
  globalThis.location?.href === 'https://appassets.androidplatform.net/assets/design/android-mobile-preview.html' &&
  isGrapesAndroidApp()
if (isGrapesDriveConnected() || localMode() || qaNativeAuthenticated) showApp()
