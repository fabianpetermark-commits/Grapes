import {
  connectGrapesDrive,
  disconnectGrapesDrive,
  getGrapesAccount,
  isGrapesDriveConnected,
  listGrapesProjects,
  onGrapesDriveChange,
} from './storage/grapes-drive.js'
import { listLocalProjects } from './storage/local-project-store.js'
import { listMobileEbooks, saveMobileReadingProgress, uploadMobileEbook } from './ebook-mobile-library.js'
import { isMobileReadableEpub, normalizedReadingProgress, openMobileEpub } from './ebook-mobile-reader.js'
import { createMobileFoodController } from './food/food-mobile.js'
import { createYazioApiPanel } from './food/yazio-api-panel.js'
import { registerFoodSharing, sendMealShare, sendRecipeShare } from './food/food-sharing-client.js'
import { hydrateMobileIcons, mobileIconSvg } from './android-mobile-icons.js'
import { createHomeMobile } from './home/home-mobile.js'
import { getAndroidAppUpdate, installAndroidAppUpdate, isGrapesAndroidApp, openAndroidHealthConnectSettings, saveAndroidJsonBackup } from './android-bridge.js'
import { waterBackupToJson, waterBackupFromJson, readWaterStoreStrict, waterBackupSummary } from './water/water-backup.js'
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
let mobileReader = null
let mobileReaderBook = null
let mobileReaderChapterIndex = 0
let mobileReaderSaveTimer = null
let activeTransferBookId = ''
let activePairingNonce = ''
let mobileFood = null
const household = createHomeMobile($('[data-household-root]'))
let activePage = 'home'
let menuReturnPage = ''
let menuEntry = ''
let availableAppUpdate = null
let activeSyncImport = ''
document.addEventListener('grapes:food-subtitle', event => {
  if (activePage === 'food') subtitle.textContent = event.detail?.subtitle || 'Mai áttekintés'
})

const labels = {
  home: ['Grapes', 'Mobil munkaterület'], projects: ['Projektek', 'Helyi és Drive'],
  sync: ['Szinkron', 'Adatok és fiók'], more: ['Továbbiak', 'Beállítások'],
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
    closeSheet(); await mobileFood.load()
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
  const food = mobileFood?.inboxSummary() || { pending: 0, unread: 0 }
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
  if (mobileFood) {
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

function showPage(page, { parent = '', entry = '' } = {}) {
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
  $('[data-page]').forEach(node => { node.hidden = node.dataset.page !== page })
  $('[data-nav]').forEach(node => node.classList.toggle('is-active', node.dataset.nav === page))
  ;[title.textContent, subtitle.textContent] = labels[page] || labels.home
  fab.hidden = page !== 'food' || !mobileFood?.isDetailOpen()
  closeSheet()
  if (page === 'projects') renderProjects()
  if (page === 'sync') renderSync()
  if (page === 'water') renderWater()
  if (page === 'household') {
    household.load()
    if (entry === 'shopping' || entry === 'inventory') household.openTab(entry)
  }
  if (page === 'food') mobileFood?.load().then(async () => {
    // A delayed load must not open a sheet on a different screen.
    if (activePage !== 'food' || (entry && menuEntry !== entry)) return
    if (entry) mobileFood?.openNavigationView(entry)
    await mobileFood?.autoImportHealth()
    await mobileFood?.autoImportYazio()
  }).catch(() => {})
  if (page === 'ebook') renderMobileEbooks()
  if (page === 'reader') renderReaderPicker()
  if (page === 'transfer') renderTransferPicker()
  if (['ebook', 'reader', 'transfer'].includes(page)) {
    $('[data-ebook-view]').forEach(button => button.classList.toggle('is-active', button.dataset.ebookView === page))
  }
}

async function openModule(module, project = null, view = '', itemId = '', action = '') {
  await mobileFood?.flush({ drive: false }).catch(() => {})
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
    grid.innerHTML = `<div class="ebook-empty">${isGrapesDriveConnected() ? 'A Grapes Drive-könyvtár még üres. Importálj egy könyvet!' : 'A könyvtárhoz csatlakoztasd a Google Drive-ot a Szinkron oldalon.'}</div>`
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
  const status = $('[data-ebook-status]')
  status.textContent = isGrapesDriveConnected() ? 'Drive-könyvtár frissítése…' : ''
  try {
    const books = await listMobileEbooks()
    mobileEbooks = books
    renderEbookCards(books)
    status.textContent = ''
  } catch (error) {
    renderEbookCards([])
    status.textContent = `A könyvtár nem tölthető be. ${error?.message || ''}`
  }
}

async function importMobileEbook(file) {
  if (!file) return
  const status = $('[data-ebook-status]')
  status.textContent = `${file.name} feltöltése…`
  try {
    const books = await uploadMobileEbook(file)
    mobileEbooks = books
    renderEbookCards(books)
    status.textContent = `${file.name} hozzáadva a Drive-könyvtárhoz.`
  } catch (error) { status.textContent = `A feltöltés nem sikerült. ${error?.message || ''}` }
}

async function ensureMobileEbooks() {
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
  const status = $('[data-reader-status]')
  try {
    status.dataset.kind = ''
    status.textContent = isGrapesDriveConnected() ? 'EPUB-könyvek betöltése…' : 'Az Olvasóhoz csatlakoztasd a Google Drive-ot a Szinkron oldalon.'
    const books = await ensureMobileEbooks()
    const readable = books.filter(isMobileReadableEpub)
    fillBookSelect($('[data-reader-book]'), books, { readableOnly: true })
    if (!mobileReader) {
      $('[data-reader-picker]').hidden = false
      $('[data-reader-shell]').hidden = true
      const recent = [...readable].sort((left, right) => Date.parse(right.reading?.updatedAt || '') - Date.parse(left.reading?.updatedAt || ''))[0]
      if (recent) $('[data-reader-book]').value = recent.id
    }
    status.textContent = readable.length ? '' : (books.length ? 'A könyvtárban még nincs EPUB-formátumú könyv.' : status.textContent)
  } catch (error) { status.textContent = `Az EPUB-lista nem tölthető be. ${error?.message || ''}`; status.dataset.kind = 'error' }
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
  mobileReaderBook.reading = await saveMobileReadingProgress(mobileReaderBook, value)
  updateReaderProgress()
}

function scheduleReaderProgressSave() {
  updateReaderProgress()
  window.clearTimeout(mobileReaderSaveTimer)
  mobileReaderSaveTimer = window.setTimeout(() => persistReaderProgress().catch(error => {
    const status = $('[data-reader-status]'); status.textContent = `A haladás helyben megmaradt, de a Drive-szinkron nem sikerült. ${error?.message || ''}`; status.dataset.kind = 'error'
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
  const status = $('[data-reader-status]')
  try {
    const books = await ensureMobileEbooks()
    const book = books.find(item => item.id === bookId)
    if (!book) throw new Error('A kiválasztott könyv már nem található a Drive-könyvtárban.')
    if (!isMobileReadableEpub(book)) throw new Error('Az alkalmazáson belüli Olvasó jelenleg csak EPUB-könyvet támogat.')
    status.textContent = `${book.title} letöltése és ellenőrzése…`; status.dataset.kind = ''
    mobileReader = await openMobileEpub(book)
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
    status.textContent = saved.updatedAt ? 'A Drive-on mentett olvasási pozíció visszaállítva.' : (changedSinceReading ? 'A könyv megváltozott, ezért az olvasás az elejéről indul.' : '')
    status.dataset.kind = saved.updatedAt ? 'success' : ''
  } catch (error) {
    mobileReader = null; mobileReaderBook = null
    $('[data-reader-picker]').hidden = false; $('[data-reader-shell]').hidden = true
    status.textContent = error?.message || 'Az EPUB nem nyitható meg.'; status.dataset.kind = 'error'
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
  app.hidden = true
  login.hidden = false
  const status = $('[data-login-status]')
  if (status) status.textContent = message
  closeSheet()
}

async function openAccountLogin() {
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
    const [projects, estimate, driveCount] = await Promise.all([
      listLocalProjects(1000).catch(() => []),
      navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : Promise.resolve(null),
      driveProjectCount(),
    ])
    const dirtyCount = projects.filter(project => project?.data?.syncState?.localDirty).length
    const localBytes = estimate?.usage || new Blob(projects.map(project => JSON.stringify(project))).size
    const now = refreshed ? new Date().toISOString() : localStorage.getItem(SYNC_CHECK_KEY)
    if (refreshed) localStorage.setItem(SYNC_CHECK_KEY, now)
    $('[data-sync-local-count]').textContent = `${projects.length} projekt`
    $('[data-sync-local-size]').textContent = formatStorage(localBytes)
    $('[data-sync-drive-count]').textContent = isGrapesDriveConnected() ? `${driveCount} projekt` : 'Nincs csatlakoztatva'
    $('[data-sync-pending-count]').textContent = dirtyCount ? `${dirtyCount} mentés várakozik` : 'Minden helyi adat mentve'
    const lastCheck = $('[data-sync-last-check]')
    if (lastCheck) lastCheck.textContent = formatSyncTime(now)
    status.textContent = isGrapesDriveConnected()
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
  const when = project.modifiedTime ? new Date(project.modifiedTime).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'helyi'
  meta.textContent = `${project.folder} · ${when}`
  copy.append(strong, meta)
  const arrow = document.createElement('span')
  arrow.textContent = '›'
  button.append(icon, copy, arrow)
  button.addEventListener('click', () => project.module === 'ebook' && !project.id ? showPage('ebook') : openModule(project.module, project.id ? project : null))
  return button
}

async function collectProjects() {
  const local = [
    { name: 'Mai étkezések', folder: 'Ételnapló', module: 'food', icon: 'food' },
    { name: 'Víznapló', folder: 'Egészség', module: 'food', icon: 'water', water: true },
    { name: 'E-book könyvtár', folder: 'E-book', module: 'ebook', icon: 'ebook' },
  ]
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

function loadWaterStore() {
  try {
    const value = JSON.parse(localStorage.getItem(WATER_STORE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}

function currentWaterDay() {
  const store = loadWaterStore()
  const key = dateKey()
  const saved = store[key]
  return { store, key, day: { goal: Math.max(500, Number(saved?.goal) || 2000), entries: Array.isArray(saved?.entries) ? saved.entries : [] } }
}

function saveWaterDay(day) {
  const { store, key } = currentWaterDay()
  store[key] = day
  saveWaterStore(store)
}

function saveWaterStore(store) {
  // Historical Health Connect imports and older Water diary entries are user
  // data. Do not silently prune them when a newer day is saved.
  localStorage.setItem(WATER_STORE_KEY, JSON.stringify(store))
}

function importHydrationEntries(entries = []) {
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
  if (imported) { saveWaterStore(store); renderWater() }
  return imported
}

function hydrationExternalKeys() {
  return Object.values(loadWaterStore())
    .flatMap(day => Array.isArray(day?.entries) ? day.entries : [])
    .map(entry => entry.externalKey)
    .filter(Boolean)
}

function formatWater(amount) {
  return `${new Intl.NumberFormat('hu-HU').format(amount)} ml`
}

function renderWater() {
  const { day } = currentWaterDay()
  const total = day.entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
  const percent = Math.min(100, total / day.goal * 100)
  $('[data-water-date]').textContent = `${new Date().toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })} · napi cél ${(day.goal / 1000).toLocaleString('hu-HU')} liter`
  $('[data-water-total]').textContent = formatWater(total)
  $('[data-water-goal-label]').textContent = `${formatWater(day.goal)} cél`
  $('[data-water-ring]').style.setProperty('--water-progress', `${percent}%`)
  const waterStore = loadWaterStore()
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
    row.addEventListener('click', () => {
      const next = currentWaterDay().day
      next.entries = next.entries.filter(item => item.id !== entry.id)
      saveWaterDay(next); renderWater(); showToast('A vízbejegyzés törölve.')
    })
    log.append(row)
  }
}

function addWater(amount) {
  const { day } = currentWaterDay()
  day.entries.push({ id: crypto.randomUUID(), amount, at: new Date().toISOString() })
  saveWaterDay(day)
  renderWater()
  showToast(`${formatWater(amount)} víz hozzáadva és mentve.`)
}

async function exportWaterBackup() {
  try {
    const json = waterBackupToJson(localStorage)
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
    const restored = waterBackupFromJson(await file.text())
    const old = readWaterStoreStrict(localStorage)
    const stats = waterBackupSummary(restored)
    const current = waterBackupSummary(old)
    if (!window.confirm(`Víz napló visszaállítása? A fájlban ${stats.days} nap és ${stats.entries} bejegyzés, a telefonon ${current.days} nap és ${current.entries} bejegyzés van. A jelenlegi vízadatok lecserélődnek. Csak saját biztonsági mentésből folytasd.`)) return
    // Keep a persistent recovery checkpoint and verify it before any writes.
    const recovered = JSON.stringify(old)
    localStorage.setItem('grapes-water-recovery-v1', recovered)
    if (localStorage.getItem('grapes-water-recovery-v1') !== recovered) throw new Error('A régi víznapló biztonsági másolata nem ellenőrizhető.')
    try {
      localStorage.setItem(WATER_STORE_KEY, JSON.stringify(restored))
      const actual = readWaterStoreStrict(localStorage)
      if (JSON.stringify(actual) !== JSON.stringify(restored)) {
        throw new Error('A víznapló visszaállítása nem igazolható.')
      }
    } catch (error) {
      // Restore the original without losing its Health Connect import keys.
      localStorage.setItem(WATER_STORE_KEY, recovered)
      throw error
    }
    renderWater()
    showToast('A víznapló visszaállítva; a korábbi állapot külön megmaradt.')
  } catch (error) { showToast(error?.message || 'A Víz napló visszaállítása nem sikerült.') }
}

function changeWaterGoal() {
  const { day } = currentWaterDay()
  const entered = window.prompt('Napi vízcél milliliterben:', String(day.goal))
  if (entered === null) return
  const goal = Number(entered.replace(/\s/g, ''))
  if (!Number.isFinite(goal) || goal < 500 || goal > 10000) return showToast('A cél 500 és 10 000 ml között lehet.')
  day.goal = Math.round(goal / 50) * 50
  saveWaterDay(day); renderWater(); showToast('A napi vízcél mentve.')
}

$('[data-local]').addEventListener('click', () => { setLocalMode(true); showApp() })
$('[data-login]').addEventListener('click', connectDrive)
$('[data-connect-drive]').addEventListener('click', connectDrive)
$('[data-account-login]').addEventListener('click', openAccountLogin)
$('[data-notifications]').addEventListener('click', openUpdateInbox)
$('[data-food-share-open]').addEventListener('click', async () => {
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
$('[data-nav]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.nav)))
$('[data-menu-group]').forEach(button => button.addEventListener('click', () => {
  const group = button.dataset.menuGroup
  if (['home', 'health', 'utility', 'finance'].includes(group)) showPage('hub-' + group)
}))
$('[data-menu-back]').forEach(button => button.addEventListener('click', () => showPage('home')))
$('[data-menu-destination]').forEach(button => button.addEventListener('click', () => {
  const destination = button.dataset.menuDestination
  const parent = button.closest('[data-page]')?.dataset.page
  if (!['hub-home', 'hub-health', 'hub-utility', 'hub-finance'].includes(parent)) return
  if (parent === 'hub-home' && ['inventory', 'shopping'].includes(destination)) {
    showPage('household', { parent, entry: destination })
  } else if (parent === 'hub-health' && ['food', 'recipes', 'stats'].includes(destination)) {
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
$('[data-module]').forEach(button => button.addEventListener('click', () => {
  const module = button.dataset.module
  if (module === 'food' || module === 'ebook' || module === 'household') showPage(module)
  else openModule(module)
}))
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

$('[data-health-sync]').addEventListener('click', () => openSyncImport('health'))
$$('[data-samsung-sync-action]').forEach(button => button.addEventListener('click', () => openSyncImport('samsung')))
const yazioApiPanel = createYazioApiPanel({ openSheet, closeSheet,
  importBundle: source => mobileFood.importYazio(source), openFileImport: () => openSyncImport('yazio'),
  getProfileKey: () => { const account = getGrapesAccount(); return account?.id || account?.email || 'local-food-profile' } })
$('[data-yazio-import]').addEventListener('click', () => yazioApiPanel.open())
$('[data-sync-import-confirm]').addEventListener('click', () => runSyncImport())
$('[data-sync-health-settings]').addEventListener('click', async () => {
  try { await openAndroidHealthConnectSettings(); $('[data-sync-import-status]').textContent = 'A Health Connect beállításai megnyíltak.' }
  catch (error) { $('[data-sync-import-status]').textContent = error?.message || 'A Health Connect beállításai nem nyithatók meg.' }
})
$('[data-yazio-undo]').addEventListener('click', async () => {
  try {
    await mobileFood.undoYazio()
    closeSheet()
    setSyncProviderStatus('Az utolsó YAZIO-import visszavonva.')
  } catch (error) { showToast(error.message) }
})
$('[data-yazio-input]').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
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
  else registerFoodSharing().catch(() => {})
  mobileFood?.load({ force: true }).catch(() => {})
  renderAccount(); renderProjects(); renderSync()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateHomeGreeting()
    refreshUpdateInbox().catch(() => {})
  }
  if (document.visibilityState === 'hidden') {
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
if (isGrapesDriveConnected()) registerFoodSharing().catch(() => {})
if (isGrapesDriveConnected() || localMode()) showApp()
