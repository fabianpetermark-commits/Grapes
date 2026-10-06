import QRCode from 'qrcode'
import './styles/screens/ebook-library.css'
import { connectGrapesDrive, disconnectGrapesDrive, getConnectedGrapesAccount, getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest, isGrapesDriveConnected, onGrapesDriveChange } from './storage/grapes-drive.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || ''
const PICKER_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || CLIENT_ID.split('-')[0]
const BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || ''
const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const ISBNDB_ENABLED = import.meta.env.VITE_EBOOK_ISBNDB_ENABLED === 'true'
const EPUB_WRITE_ENABLED = import.meta.env.VITE_EBOOK_EPUB_WRITE_ENABLED === 'true'
const FOLDER_NAME = 'Grapes E-book Library'
// The Apps Script broker accepts only the canonical reader and return URLs.
// A pilot build must not turn its own subdirectory into a separate pairing target.
const APP_RETURN_URL = 'https://fabianpetermark-commits.github.io/Grapes/'
const READER_PAGE_URL = new URL('ebook-reader.html', APP_RETURN_URL).toString()
const READER_SHARING_KEY = 'grapes-reader-library-enabled'
const LIBRARY_CACHE_KEY = 'grapes-ebook-library-cache-v2:'
const LEGACY_LIBRARY_CACHE_KEY = 'grapes-ebook-library-cache-v1'
const FULL_SCAN_CACHE_MS = 5 * 60 * 1000
const INTERNAL_PAIRING_FILE = /^\.grapes-reader-pairing(?:-\d+)?\.json$/i
const INTERNAL_METADATA_FILE = /^\.grapes-ebook-metadata\.json$/i
const METADATA_FIELDS = ['title', 'author', 'isbn', 'language', 'publisher', 'publishedDate', 'series', 'seriesIndex', 'subjects', 'description']
const METADATA_LABELS = { title: 'Cím', author: 'Szerző', isbn: 'ISBN', language: 'Nyelv', publisher: 'Kiadó', publishedDate: 'Megjelenés', series: 'Sorozat', seriesIndex: 'Sorozatszám', subjects: 'Műfajok', description: 'Leírás', coverUrl: 'Borító' }
const MAX_COVER_SIZE = 10 * 1024 * 1024
const SHAREABLE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'txt', 'cbz', 'cbr'])
const DRIVE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'azw4', 'kfx', 'prc', 'fb2', 'djvu', 'djv', 'cbz', 'cbr', 'cb7', 'cbt', 'txt', 'rtf', 'doc', 'docx', 'odt', 'html', 'htm', 'xhtml', 'chm', 'lit', 'lrf', 'lrx', 'pdb', 'pml', 'pmlz', 'rb', 'snb', 'tcr', 'tr2', 'tr3', 'xps', 'oxps'])

let initialized = false
let currentBooks = []
let ebookMetadata = {}
let ebookMetadataFileId = null
let pendingMetadataSuggestion = null
let metadataLookupSerial = 0
let metadataSearchMatches = []
let metadataProposalControls = new Map()
let metadataDirty = false
let activeMetadataBookId = ''
let metadataLoadedSnapshot = ''
let pendingCoverBlob = null
let pendingCoverUrl = ''
let pendingCoverRemoved = false
let coverObjectUrl = ''
let coverChangeSerial = 0
let partialMetadataSave = null
let pendingCoverAsset = null
let cachedBooks = []
let cachedAt = 0
let cachedAccount = ''
let readerPairMessageTimer = null
let readerPairExpiryTimer = null
let readerPairNonce = ''
let pickerLoadPromise = null
let pickerPending = false
const $ = (selector) => document.querySelector(selector)
const ext = (name = '') => name.includes('.') ? name.split('.').pop().toLowerCase() : 'FILE'
const isShareableBook = (name = '') => SHAREABLE_BOOK_EXTENSIONS.has(ext(name))
const isBookFile = (file) => Boolean(file?.name)
  && !file.name.startsWith('.')
  && !INTERNAL_PAIRING_FILE.test(file.name)
  && !INTERNAL_METADATA_FILE.test(file.name)
  && file.mimeType !== 'application/vnd.google-apps.folder'
  && !String(file.mimeType || '').startsWith('application/vnd.google-apps.')
const isDriveBook = (file) => isBookFile(file) && (DRIVE_BOOK_EXTENSIONS.has(ext(file.name)) || /\.fb2\.zip$/i.test(file.name))
const formatSize = (bytes) => !Number.isFinite(bytes) ? '—' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function setStatus(message, kind = '') { const node = $('#ebook-status'); if (node) { node.textContent = message; node.dataset.kind = kind } }
function setUploadState(message, kind = '') { const node = $('#ebook-upload-state'); if (node) { node.textContent = message; node.dataset.kind = kind } }
function activeLibraryAccount() { return getConnectedGrapesAccount()?.email?.trim().toLocaleLowerCase('en-US') || '' }
function libraryCacheKey(account) { return `${LIBRARY_CACHE_KEY}${encodeURIComponent(account)}` }
function resetLibraryCacheMemory() { cachedBooks = []; cachedAt = 0; cachedAccount = '' }
function saveLibraryCache(books) {
  const account = activeLibraryAccount()
  cachedBooks = books
  cachedAt = Date.now()
  cachedAccount = account
  if (!account) return
  try {
    window.localStorage?.setItem(libraryCacheKey(account), JSON.stringify({
      savedAt: cachedAt, books,
      metadata: Object.fromEntries(books.filter((book) => ebookMetadata[book.id]).map((book) => [book.id, ebookMetadata[book.id]])),
    }))
  } catch {
    // Ha a részletes metaadat nem fér el, a megjelenített címeket még megőrizzük.
    try {
      const labels = Object.fromEntries(books.filter((book) => ebookMetadata[book.id]).map((book) => [book.id, { title: ebookMetadata[book.id].title, author: ebookMetadata[book.id].author }]))
      window.localStorage?.setItem(libraryCacheKey(account), JSON.stringify({ savedAt: cachedAt, books, metadata: labels }))
    } catch {}
  }
}
function renderLibraryCache() {
  try {
    window.localStorage?.removeItem(LEGACY_LIBRARY_CACHE_KEY)
    const account = activeLibraryAccount()
    if (!account) return false
    const cached = JSON.parse(window.localStorage?.getItem(libraryCacheKey(account)) || 'null')
    if (!Array.isArray(cached?.books) || !cached.books.length) return false
    cachedBooks = cached.books
    cachedAt = Number(cached.savedAt) || 0
    cachedAccount = account
    ebookMetadata = normalizeEbookMetadata(cached.metadata)
    renderBooks(cachedBooks)
    setStatus(`${cachedBooks.length} könyv betöltve a gyorsítótárból. Frissítés a háttérben…`)
    return true
  } catch { return false }
}
function readerLibraryEnabled() {
  try { return window.localStorage && window.localStorage.getItem(READER_SHARING_KEY) === '1' } catch { return false }
}
function setReaderLibraryEnabled(value) {
  try {
    if (!window.localStorage) return
    if (value) window.localStorage.setItem(READER_SHARING_KEY, '1')
    else window.localStorage.removeItem(READER_SHARING_KEY)
  } catch {}
}
function createReaderNonce() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}
function buildTransferUrl(code) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('ebook-pair', code)
  return url.toString()
}
function buildBrokerUrl(params = {}) {
  if (!TRANSFER_BROKER_URL) return ''
  const url = new URL(TRANSFER_BROKER_URL)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}
function closeTransfer() {
  const panel = $('#ebook-transfer-panel'); if (panel) panel.hidden = true
  const frame = $('#ebook-transfer-code'); if (frame) { frame.hidden = true; frame.removeAttribute('src') }
}
function showPairingFrame(selector, url) {
  const frame = $(selector)
  const embeddedUrl = new URL(url)
  embeddedUrl.searchParams.set('embed', '1')
  frame.src = embeddedUrl.toString()
  frame.hidden = false
}
function setReaderPairStatus(message, kind = '') {
  const node = $('#ebook-reader-pair-status')
  if (node) { node.textContent = message; node.dataset.kind = kind }
}
function clearReaderPairCode(message = '') {
  window.clearTimeout?.(readerPairMessageTimer)
  window.clearTimeout?.(readerPairExpiryTimer)
  readerPairMessageTimer = null
  readerPairExpiryTimer = null
  readerPairNonce = ''
  const input = $('#ebook-reader-pair-value')
  if (input) input.value = ''
  setReaderPairStatus(message)
}
function handleReaderPairingMessage(event) {
  const frame = $('#ebook-reader-pair-code')
  let trustedOrigin = false
  try {
    const origin = new URL(event.origin)
    trustedOrigin = origin.protocol === 'https:' && (origin.hostname === 'script.google.com' || origin.hostname === 'script.googleusercontent.com' || origin.hostname.endsWith('.googleusercontent.com'))
  } catch {}
  if (!frame?.src || !trustedOrigin || !readerPairNonce) return
  const code = String(event.data?.code || '').trim().toUpperCase()
  const nonce = String(event.data?.nonce || '').trim().toLowerCase()
  if (event.data?.type !== 'grapes-reader-pairing-code' || !/^[A-Z0-9]{6}$/.test(code) || nonce !== readerPairNonce) return
  const input = $('#ebook-reader-pair-value')
  if (input) input.value = code
  window.clearTimeout?.(readerPairMessageTimer)
  readerPairMessageTimer = null
  readerPairNonce = ''
  const expiresInSeconds = Math.min(3600, Math.max(60, Number(event.data?.expiresInSeconds) || 1200))
  setReaderPairStatus(`A kód ${Math.round(expiresInSeconds / 60)} percig érvényes.`, 'success')
  readerPairExpiryTimer = window.setTimeout?.(() => {
    if (input) input.value = ''
    setReaderPairStatus('A párosítási kód lejárt. Kérj új kódot.', 'error')
  }, expiresInSeconds * 1000)
  frame.hidden = true
  frame.removeAttribute('src')
}
function renderDriveConnection() {
  const connected = isGrapesDriveConnected()
  if ((!connected && currentBooks.length) || (cachedAccount && cachedAccount !== activeLibraryAccount())) {
    resetLibraryCacheMemory()
    ebookMetadata = {}
    renderBooks([])
  }
  const button = $('#ebook-drive-connect')
  if (button) { button.disabled = connected; button.textContent = connected ? 'Google Drive csatlakoztatva' : 'Google Drive csatlakoztatása' }
  const disconnect = $('#ebook-drive-disconnect')
  if (disconnect) disconnect.disabled = !connected
  setUploadState(connected ? '● Drive csatlakoztatva · feltöltésre kész' : '○ A Drive nincs csatlakoztatva', connected ? 'success' : '')
}
function handleTransferLink() {
  const params = new URLSearchParams(window.location.search)
  const code = (params.get('ebook-pair') || '').trim().toUpperCase()
  if (!params.has('ebook-reader') && !/^[A-Z0-9]{6}$/.test(code)) return
  const panel = $('#ebook-receiver-panel'); if (!panel) return
  const validCode = /^[A-Z0-9]{6}$/.test(code)
  $('#ebook-receiver-code').textContent = validCode ? code : ''
  $('#ebook-receiver-input').value = validCode ? code : ''
  const downloadUrl = validCode ? buildBrokerUrl({ action: 'download', code }) : ''
  $('#ebook-receiver-download').href = downloadUrl || '#'
  $('#ebook-receiver-download').hidden = !downloadUrl
  panel.hidden = false
  if (downloadUrl) setStatus('A párosítási kód ellenőrzése a letöltés megnyitásakor történik.')
  else if (!TRANSFER_BROKER_URL) $('#ebook-receiver-status').textContent = 'Az átvétel még nincs konfigurálva.'
}
function renderBooks(books = []) {
  const list = $('#ebook-list'); const empty = $('#ebook-empty'); if (!list || !empty) return
  list.replaceChildren(); empty.hidden = books.length > 0
  currentBooks = books
  for (const book of books) {
    const row = document.createElement('article'); row.className = 'ebook-library__book'
    const sendAction = book.isAppAuthorized === false ? '' : `<button class="btn btn--primary btn--sm" type="button" data-send="${book.id}">Küldés</button>`
    const accessLabel = book.isAppAuthorized === false ? ' · Drive, csak olvasás' : ''
    const metadata = ebookMetadata[book.id] || {}
    const displayName = metadata.title || book.name
    row.innerHTML = `<div class="ebook-library__book-icon" aria-hidden="true">E</div><div class="ebook-library__book-main" data-book-name="${escapeHtml(book.name)}"><strong>${escapeHtml(displayName)} <span class="ebook-library__location-badge" data-location-badge="Drive">Drive</span></strong><span>${escapeHtml(metadata.author || ext(book.name).toUpperCase())} · ${formatSize(Number(book.size))}${accessLabel}</span></div><div class="ebook-library__book-actions"><button class="btn btn--ghost btn--sm" type="button" data-edit-book="${book.id}">Szerkesztés</button><button class="btn btn--ghost btn--sm" type="button" data-download="${book.id}">Letöltés</button>${sendAction}</div>`
    list.append(row)
  }
  list.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', () => downloadBook(b.dataset.download)))
  list.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => sendBook(b.dataset.send)))
  list.querySelectorAll('[data-edit-book]').forEach((b) => b.addEventListener('click', () => openMetadataEditor(b.dataset.editBook)))
  renderMetadataEditor()
}

function metadataFileName() { return '.grapes-ebook-metadata.json' }
function normalizeMetadataEntry(value) {
  const entry = { title: String(value.title || '').trim(), author: String(value.author || '').trim() }
  for (const key of METADATA_FIELDS.filter((field) => !['title', 'author', 'subjects'].includes(field))) {
    if (value[key] != null && String(value[key]).trim()) entry[key] = String(value[key]).trim()
  }
  if (Array.isArray(value.subjects)) entry.subjects = value.subjects.map((subject) => String(subject).trim()).filter(Boolean)
  if (typeof value.coverFileId === 'string' && value.coverFileId) entry.coverFileId = value.coverFileId
  if (typeof value.coverMimeType === 'string' && value.coverMimeType) entry.coverMimeType = value.coverMimeType
  if (typeof value.updatedAt === 'string' && value.updatedAt) entry.updatedAt = value.updatedAt
  return entry
}
function normalizeEbookMetadata(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const normalized = payload.books && typeof payload.books === 'object'
    ? normalizeEbookMetadata(payload.books)
    : {}
  for (const [id, value] of Object.entries(payload)) {
    if (id === 'books' || id === 'version' || id === 'updatedAt') continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    if (!METADATA_FIELDS.some((field) => Object.hasOwn(value, field))) continue
    normalized[id] = normalizeMetadataEntry(value)
  }
  return normalized
}
async function loadEbookMetadata(folderId) {
  ebookMetadata = {}; ebookMetadataFileId = null
  const query = `'${folderId}' in parents and name = '${metadataFileName()}' and trashed = false`
  const found = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`)).json()
  const file = found.files?.[0]
  if (!file) return
  ebookMetadataFileId = file.id
  const payload = JSON.parse(await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`)).text())
  ebookMetadata = normalizeEbookMetadata(payload)
}
async function saveEbookMetadata(folderId) {
  const payload = JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), books: ebookMetadata })
  if (ebookMetadataFileId) {
    await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(ebookMetadataFileId)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload })
    return
  }
  const boundary = `grapes-ebook-metadata-${crypto.randomUUID()}`
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({ name: metadataFileName(), parents: [folderId], mimeType: 'application/json' }), `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`, payload, `\r\n--${boundary}--\r\n`])
  ebookMetadataFileId = (await (await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json()).id
}
function renderMetadataEditor() {
  const select = $('#ebook-metadata-book'); if (!select) return
  const previous = activeMetadataBookId || select.value
  renderMetadataOptions()
  if (currentBooks.some((book) => book.id === previous)) select.value = previous
  if (metadataDirty && select.value === activeMetadataBookId) { updateMetadataPreview(); return }
  updateMetadataForm()
}
function renderMetadataOptions() {
  const select = $('#ebook-metadata-book'); if (!select) return
  const selected = select.value || activeMetadataBookId
  const query = normalizedWords($('#ebook-metadata-filter')?.value || '').join(' ')
  const visible = currentBooks.filter((book) => {
    if (!query) return true
    const metadata = ebookMetadata[book.id] || {}
    return normalizedWords(`${metadata.title || ''} ${metadata.author || ''} ${book.name}`).join(' ').includes(query)
  })
  select.innerHTML = '<option value="">Válassz könyvet…</option>' + visible.map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(ebookMetadata[book.id]?.title || book.name)}</option>`).join('')
  if (visible.some((book) => book.id === selected)) select.value = selected
}
function setMetadataDirty(value) {
  metadataDirty = Boolean(value)
  const indicator = $('#ebook-metadata-dirty')
  if (indicator) {
    indicator.dataset.dirty = String(metadataDirty)
    indicator.textContent = metadataDirty ? 'Mentetlen módosítások' : activeMetadataBookId ? 'Minden módosítás mentve' : 'Nincs mentetlen módosítás'
  }
  const save = $('#ebook-metadata-save')
  if (save) save.disabled = !metadataDirty || !activeMetadataBookId
}
function setMetadataAccessStatus(message, kind = '') {
  const status = $('#ebook-metadata-access-status')
  if (status) { status.textContent = message; status.dataset.kind = kind }
}
function renderMetadataAccess(book) {
  const wrap = $('#ebook-metadata-access')
  const button = $('#ebook-metadata-grant')
  const eligible = EPUB_WRITE_ENABLED && ext(book?.name || '') === 'epub' && book?.isAppAuthorized !== true
  if (wrap) wrap.hidden = !eligible
  if (button) button.disabled = !eligible || !PICKER_API_KEY || !PICKER_APP_ID || pickerPending
  const save = $('#ebook-metadata-save')
  if (save) save.textContent = canWriteEpub(book) ? 'Adatlap és EPUB mentése' : 'Könyvtári adatlap mentése'
  if (!eligible || pickerPending) return
  setMetadataAccessStatus(PICKER_API_KEY && PICKER_APP_ID
    ? 'A könyvfájl módosításához ezt az egy EPUB-ot válaszd ki a Google fájlválasztójában. A teljes Drive-írási jog nem szükséges.'
    : 'A fájlonkénti hozzáférés még nincs beállítva: a Google Picker API-kulcs hiányzik. Az adatlap ettől még menthető.')
}
function loadGooglePicker() {
  if (window.google?.picker?.PickerBuilder) return Promise.resolve()
  if (pickerLoadPromise) return pickerLoadPromise
  pickerLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = () => {
      if (!window.gapi?.load) return reject(new Error('A Google fájlválasztó nem érhető el.'))
      window.gapi.load('picker', {
        callback: () => window.google?.picker?.PickerBuilder ? resolve() : reject(new Error('A Google fájlválasztó nem töltődött be.')),
        onerror: () => reject(new Error('A Google fájlválasztó betöltése nem sikerült.')),
        timeout: 15000,
        ontimeout: () => reject(new Error('A Google fájlválasztó betöltése túllépte az időkorlátot.')),
      })
    }
    script.onerror = () => reject(new Error('A Google fájlválasztó szkriptje nem tölthető be.'))
    document.head.append(script)
  }).catch((error) => { pickerLoadPromise = null; throw error })
  return pickerLoadPromise
}
function pickExistingBook(book, token) {
  return new Promise((resolve, reject) => {
    const picker = window.google.picker
    const view = new picker.DocsView(picker.ViewId.DOCS).setFileIds([book.id])
    const dialog = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(PICKER_API_KEY)
      .setAppId(PICKER_APP_ID)
      .setCallback((data) => {
        if (data?.action === picker.Action.CANCEL) return resolve(false)
        if (data?.action === picker.Action.ERROR || data?.error) return reject(new Error('A Google fájlválasztó hibát jelzett. Ellenőrizd az API-kulcs és a megengedett webhelyek beállítását.'))
        if (data?.action !== picker.Action.PICKED) return
        const selected = data.docs || []
        if (selected.length !== 1 || selected[0]?.id !== book.id) return reject(new Error('A kiválasztott fájl nem egyezik a szerkesztett könyvvel.'))
        resolve(true)
      })
      .build()
    dialog.setVisible(true)
  })
}
async function grantSelectedEpubAccess() {
  const id = $('#ebook-metadata-book')?.value
  const book = currentBooks.find((item) => item.id === id)
  if (!book || canWriteEpub(book) || pickerPending) return
  if (!PICKER_API_KEY || !PICKER_APP_ID) return setMetadataAccessStatus('A Google Picker API-kulcs még nincs beállítva. Addig csak a könyvtári adatlap menthető.', 'error')
  pickerPending = true
  renderMetadataAccess(book)
  setMetadataAccessStatus('A Google fájlválasztó megnyitása…')
  try {
    const token = getGrapesDriveAccessToken() || await connectGrapesDrive()
    await loadGooglePicker()
    const picked = await pickExistingBook(book, token)
    if (!picked) return setMetadataAccessStatus('A fájlválasztás megszakítva; a szerkesztett adatok megmaradtak.')
    const current = await getBookDriveVersion(id)
    if (current.isAppAuthorized !== true) throw new Error('A Google még nem jelezte vissza a fájlonkénti hozzáférést. Próbáld újra a kiválasztást.')
    if (current.capabilities?.canEdit === false) throw new Error('Ehhez a könyvhöz nincs szerkesztési jogod a Drive-on.')
    book.isAppAuthorized = true
    if (activeMetadataBookId === id) {
      renderMetadataAccess(book)
      setMetadataAccessStatus('A könyv most már szerkeszthető EPUB-ként. A mezőkben lévő módosítások megmaradtak.', 'success')
    }
    setStatus('A kiválasztott EPUB fájlonkénti hozzáférése engedélyezve.', 'success')
  } catch (error) {
    setMetadataAccessStatus(`A fájlonkénti hozzáférés nem sikerült. ${error.message}`, 'error')
  } finally {
    pickerPending = false
    const button = $('#ebook-metadata-grant')
    if (button) button.disabled = !PICKER_API_KEY || !PICKER_APP_ID || !currentBooks.some((item) => item.id === $('#ebook-metadata-book')?.value && item.isAppAuthorized !== true)
  }
}
function updateMetadataPreview() {
  const book = currentBooks.find((item) => item.id === activeMetadataBookId)
  const preview = $('#ebook-metadata-preview')
  if (!preview) return
  preview.dataset.empty = String(!book)
  $('#ebook-metadata-preview-title').textContent = book ? ($('#ebook-metadata-title')?.value.trim() || ebookMetadata[book.id]?.title || book.name) : 'Nincs kiválasztott könyv'
  $('#ebook-metadata-preview-meta').textContent = book
    ? `${$('#ebook-metadata-author')?.value.trim() || ebookMetadata[book.id]?.author || 'Ismeretlen szerző'} · ${ext(book.name).toUpperCase()} · ${formatSize(Number(book.size))} · Drive`
    : 'Válassz egy könyvet a bal oldali listából.'
}
function updateMetadataForm() {
  metadataLookupSerial++
  const id = $('#ebook-metadata-book')?.value
  activeMetadataBookId = id || ''
  const data = ebookMetadata[id] || {}
  const selectedBook = currentBooks.find((book) => book.id === id)
  renderMetadataAccess(selectedBook)
  metadataLoadedSnapshot = JSON.stringify(data)
  for (const key of METADATA_FIELDS) {
    const input = $(`#ebook-metadata-${key}`)
    if (input) input.value = key === 'subjects' ? (data.subjects || []).join(', ') : data[key] || ''
  }
  pendingCoverBlob = null; pendingCoverUrl = ''; pendingCoverRemoved = false
  renderCoverPreview('')
  if (data.coverFileId) loadSavedCoverPreview(id, data.coverFileId)
  pendingMetadataSuggestion = id ? parseFilenameMetadata(currentBooks.find((book) => book.id === id)?.name || '') : null
  metadataSearchMatches = []
  const sourceWrap = $('#ebook-metadata-source-wrap')
  if (sourceWrap) sourceWrap.hidden = true
  if ($('#ebook-metadata-field-suggestions')) $('#ebook-metadata-field-suggestions').hidden = true
  if ($('#ebook-metadata-evidence')) $('#ebook-metadata-evidence').replaceChildren()
  if ($('#ebook-metadata-evidence')) $('#ebook-metadata-evidence').hidden = true
  if ($('#ebook-metadata-save-catalog')) $('#ebook-metadata-save-catalog').hidden = true
  setMetadataMessage(id && EPUB_WRITE_ENABLED && ext(selectedBook?.name || '') === 'epub' && selectedBook?.isAppAuthorized !== true
    ? 'Ez az EPUB nem kapott fájlonkénti Grapes-hozzáférést. Egyelőre csak a könyvtári adatlap menthető; a könyvfájlhoz külön hozzáférés szükséges.'
    : canWriteEpub(selectedBook) ? `Az EPUB-fájl belső metaadatai is frissülnek; fontos könyvből tarts külön eredetit. Fájlnév alapján: ${suggestMetadata(selectedBook.name)}`
    : id ? `Fájlnév alapján: ${suggestMetadata(selectedBook?.name || '')}` : '')
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = !pendingMetadataSuggestion
  updateMetadataPreview()
  setMetadataDirty(false)
}
function renderCoverPreview(url) {
  if (coverObjectUrl) { URL.revokeObjectURL(coverObjectUrl); coverObjectUrl = '' }
  const preview = $('#ebook-metadata-cover-preview')
  if (!preview) return
  preview.hidden = !url
  preview.src = url || ''
}
function showCoverBlob(blob) {
  renderCoverPreview('')
  coverObjectUrl = URL.createObjectURL(blob)
  const preview = $('#ebook-metadata-cover-preview')
  if (preview) { preview.src = coverObjectUrl; preview.hidden = false }
}
async function loadSavedCoverPreview(bookId, fileId) {
  try {
    const blob = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)).blob()
    if (bookId !== activeMetadataBookId || pendingCoverBlob || pendingCoverUrl || pendingCoverRemoved) return
    coverObjectUrl = URL.createObjectURL(blob)
    const preview = $('#ebook-metadata-cover-preview')
    if (preview) { preview.src = coverObjectUrl; preview.hidden = false }
  } catch { /* A hiányzó borító nem akadályozza a könyv szerkesztését. */ }
}
function selectMetadataBook() {
  const select = $('#ebook-metadata-book')
  const next = select?.value || ''
  if (metadataDirty && next !== activeMetadataBookId && !window.confirm('A mentetlen módosítások elvesznek. Másik könyvet választasz?')) {
    select.value = activeMetadataBookId
    return
  }
  updateMetadataForm()
}
function setMetadataMessage(message, kind = '') {
  const node = $('#ebook-metadata-suggestion')
  if (node) { node.textContent = message; node.dataset.kind = kind }
}
async function lookupBookMetadata() {
  const id = $('#ebook-metadata-book')?.value
  if (!id) { setMetadataMessage('Válassz ki egy könyvet a webes kereséshez.', 'error'); return }
  const book = currentBooks.find((item) => item.id === id)
  const typedTitle = ($('#ebook-metadata-title')?.value || '').trim()
  const typedAuthor = ($('#ebook-metadata-author')?.value || '').trim()
  const parsed = parseFilenameMetadata(book?.name || '')
  const title = typedTitle || parsed?.title || ''
  const author = typedAuthor || parsed?.author || ''
  const enteredIsbn = normalizeIsbn($('#ebook-metadata-isbn')?.value || '')
  if (enteredIsbn && !isbnIsValid(enteredIsbn)) {
    metadataLookupSerial++
    metadataSearchMatches = []
    pendingMetadataSuggestion = null
    metadataProposalControls = new Map()
    if ($('#ebook-metadata-source-wrap')) $('#ebook-metadata-source-wrap').hidden = true
    if ($('#ebook-metadata-field-suggestions')) $('#ebook-metadata-field-suggestions').hidden = true
    if ($('#ebook-metadata-evidence')) { $('#ebook-metadata-evidence').replaceChildren(); $('#ebook-metadata-evidence').hidden = true }
    if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = true
    setMetadataMessage(isbnLookupProblem(enteredIsbn), 'error')
    return
  }
  const isbn = enteredIsbn || extractIsbn(book?.name || '')
  if (!title && !author && !isbn) { setMetadataMessage('Adj meg címet vagy szerzőt a kereséshez.', 'error'); return }
  const serial = ++metadataLookupSerial
  const button = $('#ebook-metadata-lookup'); if (button) button.disabled = true
  const sourceWrap = $('#ebook-metadata-source-wrap')
  if (sourceWrap) sourceWrap.hidden = true
  pendingMetadataSuggestion = null
  metadataSearchMatches = []
  metadataProposalControls = new Map()
  if ($('#ebook-metadata-evidence')) $('#ebook-metadata-evidence').replaceChildren()
  if ($('#ebook-metadata-evidence')) $('#ebook-metadata-evidence').hidden = true
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = true
  setMetadataMessage(`Keresés az Open Library, a Google Books${ISBNDB_ENABLED ? ' és az ISBNdb' : ''} katalógusában…`)
  try {
    const sources = [
      ['Open Library', findBookMetadata({ title, author, isbn })],
      ['Google Books', findGoogleBooksMetadata({ title, author, isbn })],
    ]
    if (ISBNDB_ENABLED) sources.push(['ISBNdb', findIsbndbMetadata({ title, author, isbn })])
    const results = await Promise.allSettled(sources.map(([, task]) => task))
    if (serial !== metadataLookupSerial || id !== $('#ebook-metadata-book')?.value) return
    const matches = results.map((result, index) => result.status === 'fulfilled' && result.value ? { ...result.value, source: sources[index][0] } : null).filter(Boolean)
    matches.sort((a, b) => Number(Boolean(b.evidence?.isbn)) - Number(Boolean(a.evidence?.isbn)))
    const unavailable = results.map((result, index) => result.status === 'rejected'
      ? (sources[index][0] === 'ISBNdb' ? `ISBNdb (${String(result.reason?.message || 'ismeretlen hiba')})` : sources[index][0]) : null).filter(Boolean)
    if (!matches.length) {
      const reason = unavailable.length ? ` Nem elérhető: ${unavailable.join(', ')}.` : ''
      throw new Error(`${isbn ? `A(z) ${isbn} ISBN-hez` : 'A megadott adatokhoz'} egyik katalógusban sem találtam megerősíthető találatot.${reason} Ellenőrizd a számot, vagy keress cím és szerző alapján; a kézi adatok ettől függetlenül menthetők.`)
    }
    const select = $('#ebook-metadata-source')
    if (select) {
      select.replaceChildren()
      matches.forEach((match, index) => {
        const option = document.createElement('option')
        option.value = String(index)
        option.textContent = `${match.source} · ${match.evidence?.isbn ? 'pontos ISBN-egyezés' : 'cím/szerző alapján'}: ${match.suggestion.title}${match.suggestion.author ? ` — ${match.suggestion.author}` : ''}${match.year ? ` · ${match.year}` : ''}`
        select.append(option)
      })
      select.value = '0'
    }
    if (sourceWrap) sourceWrap.hidden = matches.length < 2
    metadataSearchMatches = matches
    pendingMetadataSuggestion = matches[0].suggestion
    renderMetadataEvidence(matches, { title, author, isbn })
    renderMetadataProposals(matches)
    const first = matches[0]
    const detail = first.kind === 'author'
      ? 'A szerzőt megtaláltam; a megadott magyar címet megtartottam.'
      : `Találat: ${first.suggestion.title}${first.suggestion.author ? ` — ${first.suggestion.author}` : ''}${first.year ? ` · ${first.year}` : ''}`
    const agreement = matches.length > 1
      ? (metadataSimilarity(matches[0].suggestion.title, matches[1].suggestion.title) >= 0.8 && metadataSimilarity(matches[0].suggestion.author, matches[1].suggestion.author) >= 0.7
          ? ' A cím és a szerző több forrásban egyezik; a kiadási év eltérhet.' : ' A források eltérnek; válaszd ki a megfelelő találatot.')
      : ` Csak a(z) ${first.source} adott biztos találatot.`
    const evidence = matches.map((match) => `${match.source}: ${match.evidence?.isbn ? 'pontos ISBN egyezés' : `cím ${Math.round((match.evidence?.titleScore || 0) * 100)}%, szerző ${Math.round((match.evidence?.authorScore || 0) * 100)}%`}`).join('; ')
    const isbnWarning = isbn && !matches.some((match) => match.evidence?.isbn)
      ? ` A(z) ${isbn} ISBN-t egyik elérhető katalógus sem erősítette meg; ez csak cím/szerző alapú találat.` : ''
    setMetadataMessage(`${detail}${agreement}${isbnWarning} ${evidence}.${unavailable.length ? ` Nem elérhető: ${unavailable.join(', ')}.` : ''}`, 'success')
    $('#ebook-metadata-apply').disabled = false
  } catch (error) {
    if (serial !== metadataLookupSerial) return
    const message = error?.name === 'AbortError' ? 'A keresés túllépte az időkorlátot.' : error.message
    setMetadataMessage(`A webes keresés nem sikerült. ${message}`, 'error')
  } finally { if (button && serial === metadataLookupSerial) button.disabled = false }
}

async function findGoogleBooksMetadata({ title = '', author = '', isbn = '' } = {}) {
  const token = getGrapesDriveAccessToken()
  if (!BOOKS_API_KEY && !token) return null
  const searches = isbn ? [`isbn:${isbn}`] : []
  if (title || author) searches.push([title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(' '))
  for (const query of searches) {
    const params = new URLSearchParams({ q: query, printType: 'books', maxResults: '20' })
    if (BOOKS_API_KEY) params.set('key', BOOKS_API_KEY)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    let items
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, { headers: BOOKS_API_KEY ? {} : { Authorization: `Bearer ${token}` }, signal: controller.signal })
      if (!response.ok) throw new Error(`Google Books keresési hiba (${response.status})`)
      const data = await response.json()
      items = Array.isArray(data.items) ? data.items : []
    } finally { window.clearTimeout(timeout) }
    const docs = items.map((item) => ({
      title: item.volumeInfo?.title || '', author_name: item.volumeInfo?.authors || [],
      first_publish_year: item.volumeInfo?.publishedDate?.slice(0, 4) || '',
      publishedDate: item.volumeInfo?.publishedDate || '', publisher: item.volumeInfo?.publisher || '',
      description: plainBookDescription(item.volumeInfo?.description || ''),
      language: item.volumeInfo?.language || '', subjects: item.volumeInfo?.categories || [],
      coverUrl: safeCoverUrl(item.volumeInfo?.imageLinks?.extraLarge || item.volumeInfo?.imageLinks?.large || item.volumeInfo?.imageLinks?.medium || item.volumeInfo?.imageLinks?.thumbnail || ''),
      isbn: item.volumeInfo?.industryIdentifiers?.map((identifier) => identifier.identifier) || [],
    }))
    const exactIsbn = isbn && docs.find((doc) => doc.isbn.some((value) => normalizeIsbn(value) === isbn))
    if (exactIsbn) return metadataMatch(exactIsbn, 'isbn', { isbn: true, titleScore: metadataSimilarity(title, exactIsbn.title), authorScore: metadataSimilarity(author, exactIsbn.author_name?.[0] || '') }, isbn)
    const best = bestMetadataDocument(docs, { title, author })
    if (best && (title && author ? best.titleScore >= 0.72 && best.authorScore >= 0.5 : title ? best.titleScore >= 0.72 : best.authorScore >= 0.72)) return metadataMatch(best.doc, 'title', best, '', true)
  }
  return null
}

// A cross-origin form targets our Apps Script iframe: the ISBNdb key never enters
// the static Pages bundle, and the Drive token is sent in a POST body, not a URL.
function requestIsbndb({ title = '', author = '', isbn = '' } = {}) {
  const token = getGrapesDriveAccessToken()
  if (!TRANSFER_BROKER_URL || !token) return Promise.resolve(null)
  const nonce = createReaderNonce()
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    const form = document.createElement('form')
    frame.name = `grapes-isbndb-${nonce}`
    frame.hidden = true
    frame.setAttribute('aria-hidden', 'true')
    form.hidden = true
    form.method = 'POST'
    form.action = TRANSFER_BROKER_URL
    form.target = frame.name
    const fields = { action: 'lookup-isbndb', accessToken: token, title, author, isbn, nonce }
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'; input.name = name; input.value = value
      form.append(input)
    }
    let timer
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      form.remove(); frame.remove()
    }
    const onMessage = (event) => {
      let trusted = false
      try {
        const origin = new URL(event.origin)
        trusted = origin.protocol === 'https:' && (origin.hostname === 'script.google.com' || origin.hostname === 'script.googleusercontent.com' || origin.hostname.endsWith('.googleusercontent.com'))
      } catch {}
      // HtmlService renders inside a second, Google-owned iframe. Its message
      // source is therefore not the outer frame's contentWindow; the fresh
      // 192-bit nonce plus Google's HTTPS origin authenticates this response.
      if (!trusted || event.data?.type !== 'grapes-isbndb-result' || event.data?.nonce !== nonce) return
      cleanup()
      if (event.data?.status === 'ok') resolve(event.data.books || [])
      else reject(new Error(String(event.data?.message || 'Az ISBNdb nem elérhető.')))
    }
    window.addEventListener('message', onMessage)
    timer = window.setTimeout(() => { cleanup(); reject(new Error('Az ISBNdb időtúllépés miatt nem válaszolt.')) }, 18000)
    try { document.body.append(frame, form); form.submit() }
    catch (error) { cleanup(); reject(error) }
  })
}

async function findIsbndbMetadata({ title = '', author = '', isbn = '' } = {}) {
  const books = await requestIsbndb({ title, author, isbn })
  if (!Array.isArray(books)) return null
  const docs = books.map((book) => ({
    title: book.title || '', author_name: book.authors || [],
    isbn: [book.isbn13, book.isbn10].filter(Boolean),
    publisher: book.publisher || '', publishedDate: book.date_published || '',
    language: book.language || '', description: book.synopsis || '',
    subjects: book.subjects || [], coverUrl: book.image || '',
  }))
  const exact = isbn && docs.find((doc) => doc.isbn.some((value) => normalizeIsbn(value) === isbn))
  if (exact) return metadataMatch(exact, 'isbn', { isbn: true, titleScore: metadataSimilarity(title, exact.title), authorScore: metadataSimilarity(author, exact.author_name?.[0] || '') }, isbn)
  const best = bestMetadataDocument(docs, { title, author })
  if (best && (title && author ? best.titleScore >= 0.72 && best.authorScore >= 0.5 : title ? best.titleScore >= 0.72 : best.authorScore >= 0.72)) return metadataMatch(best.doc, 'title', best, '', true)
  return null
}

async function queryOpenLibrary(parameters, signal) {
  const search = new URLSearchParams({ fields: 'title,author_name,first_publish_year,cover_i,key,isbn,language,publisher,subject', limit: '20' })
  Object.entries(parameters).forEach(([key, value]) => { if (value) search.set(key, value) })
  const response = await fetch(`https://openlibrary.org/search.json?${search}`, { signal })
  if (!response.ok) throw new Error(`Webes keresési hiba (${response.status})`)
  const result = await response.json()
  return Array.isArray(result.docs) ? result.docs : []
}

function normalizedWords(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('hu-HU').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function metadataSimilarity(left = '', right = '') {
  const a = new Set(normalizedWords(left)); const b = new Set(normalizedWords(right))
  if (!a.size || !b.size) return 0
  const common = [...a].filter((word) => b.has(word)).length
  return (2 * common) / (a.size + b.size)
}
function normalizeIsbn(value = '') { return String(value).replace(/[^\dX]/gi, '').toUpperCase() }
function safeCatalogDate(value = '') {
  const text = String(value).trim()
  if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text)) return text
  const year = text.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/)
  return year?.[0] || ''
}
async function findOpenLibraryEdition(isbn, signal) {
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Open Library ISBN-keresési hiba (${response.status})`)
  const edition = await response.json()
  const identifiers = [...(edition.isbn_10 || []), ...(edition.isbn_13 || [])]
  if (!identifiers.some((value) => normalizeIsbn(value) === isbn)) return null
  const authorRef = edition.authors?.[0]?.key
  let author = ''
  if (/^\/authors\/OL\d+A$/.test(authorRef || '')) {
    try {
      const authorResponse = await fetch(`https://openlibrary.org${authorRef}.json`, { signal })
      if (authorResponse.ok) author = (await authorResponse.json()).name || ''
    } catch { /* A szerző kiegészítése opcionális. */ }
  }
  const workKey = edition.works?.[0]?.key
  const doc = {
    title: edition.title || '', author_name: author ? [author] : [],
    isbn: identifiers, publisher: edition.publishers || [],
    publishedDate: safeCatalogDate(edition.publish_date),
    language: edition.languages?.[0]?.key?.split('/').pop() || '',
    cover_i: edition.covers?.[0], key: workKey,
  }
  return doc
}

function bestMetadataDocument(docs, { title = '', author = '' } = {}) {
  let best = null
  docs.forEach((doc) => {
    if (!doc?.title) return
    const titleScore = title ? metadataSimilarity(title, doc.title) : 0
    const authorScore = author ? Math.max(0, ...(doc.author_name || []).map((name) => metadataSimilarity(author, name))) : 0
    const score = title && author ? titleScore * 0.65 + authorScore * 0.35 : title ? titleScore : authorScore
    if (!best || score > best.score) best = { doc, score, titleScore, authorScore }
  })
  return best
}

async function findBookMetadata({ title = '', author = '', isbn = '' } = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
  if (isbn) {
    const edition = await findOpenLibraryEdition(isbn, controller.signal)
    if (edition) return enrichOpenLibraryMatch(metadataMatch(edition, 'isbn', { isbn: true, titleScore: metadataSimilarity(title, edition.title), authorScore: metadataSimilarity(author, edition.author_name?.[0] || '') }, isbn), edition, controller.signal)
  }
  if (title && author) {
    const exact = bestMetadataDocument(await queryOpenLibrary({ title, author }, controller.signal), { title, author })
    if (exact?.score >= 0.62) return enrichOpenLibraryMatch(metadataMatch(exact.doc, 'title', exact, '', true), exact.doc, controller.signal)
  }
  if (title) {
    const byTitle = bestMetadataDocument(await queryOpenLibrary({ title }, controller.signal), { title, author })
    if (byTitle?.titleScore >= 0.72 && (!author || byTitle.authorScore >= 0.5)) return enrichOpenLibraryMatch(metadataMatch(byTitle.doc, 'title', byTitle, '', true), byTitle.doc, controller.signal)
  }
  if (author) {
    const byAuthor = bestMetadataDocument(await queryOpenLibrary({ author }, controller.signal), { author })
    if (byAuthor?.authorScore >= 0.72) {
      return {
        kind: 'author', year: '', evidence: { titleScore: 0, authorScore: byAuthor.authorScore },
        suggestion: { title, author: byAuthor.doc.author_name?.[0] || author },
      }
    }
  }
  return null
  } finally { window.clearTimeout(timeout) }
}

function plainBookDescription(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|nbsp);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ' }[entity])).replace(/\s+/g, ' ').trim()
}
function safeCoverUrl(value) {
  try { const url = new URL(String(value || '').replace(/^http:/, 'https:')); return url.protocol === 'https:' ? url.toString() : '' }
  catch { return '' }
}
async function enrichOpenLibraryMatch(match, doc, signal) {
  if (!/^\/works\/OL\d+W$/.test(doc.key || '')) return match
  try {
    const response = await fetch(`https://openlibrary.org${doc.key}.json`, { signal })
    if (response.ok) {
      const work = await response.json()
      match.suggestion.description = typeof work.description === 'string' ? work.description : work.description?.value || ''
    }
  } catch { /* A leírás opcionális; a találat ettől még érvényes. */ }
  return match
}
function metadataMatch(doc, kind, evidence = {}, requestedIsbn = '', unverifiedEdition = false) {
  const isbn = requestedIsbn || doc.isbn?.find((value) => normalizeIsbn(value).length === 13) || doc.isbn?.[0] || ''
  const language = Array.isArray(doc.language) ? doc.language[0] || '' : doc.language || ''
  const publisher = Array.isArray(doc.publisher) ? doc.publisher[0] || '' : doc.publisher || ''
  const languageMap = { eng: 'en', hun: 'hu', deu: 'de', ger: 'de', fra: 'fr', fre: 'fr', spa: 'es', ita: 'it' }
  return {
    kind, year: unverifiedEdition ? '' : (doc.publishedDate || doc.first_publish_year || ''), evidence,
    suggestion: {
      title: doc.title || '', author: doc.author_name?.[0] || '', isbn: unverifiedEdition ? '' : normalizeIsbn(isbn),
      language: unverifiedEdition ? '' : (languageMap[language] || language), publisher: unverifiedEdition ? '' : publisher,
      publishedDate: unverifiedEdition ? '' : safeCatalogDate(doc.publishedDate || doc.first_publish_year),
      description: doc.description || '', subjects: doc.subjects || doc.subject?.slice(0, 8) || [],
      coverUrl: unverifiedEdition ? '' : safeCoverUrl(doc.coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false` : '')),
    },
  }
}
function proposalText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}
function renderMetadataEvidence(matches, query) {
  const container = $('#ebook-metadata-evidence')
  if (!container) return
  container.replaceChildren()
  for (const match of matches) {
    const item = document.createElement('div')
    item.className = 'ebook-library__metadata-evidence-item'
    const parts = [match.source]
    if (match.evidence?.isbn) parts.push(`Pontos ISBN: ${query.isbn}`)
    else parts.push('Nem azonosított kiadás; ISBN, kiadó, dátum és borító nincs javasolva')
    if (query.title && match.suggestion.title) parts.push(`cím ${Math.round((match.evidence?.titleScore || 0) * 100)}%`)
    if (query.author && match.suggestion.author) parts.push(`szerző ${Math.round((match.evidence?.authorScore || 0) * 100)}%`)
    if (match.evidence?.isbn && query.title && match.evidence.titleScore < 0.5) parts.push('Figyelem: eltérő cím')
    if (match.evidence?.isbn && query.author && match.evidence.authorScore < 0.5) parts.push('Figyelem: eltérő szerző')
    item.textContent = parts.join(' · ')
    container.append(item)
  }
  if (matches.length > 1) {
    const fields = ['title', 'author', 'publisher', 'publishedDate', 'language']
    const differing = fields.filter((field) => {
      const values = matches.map((match) => proposalText(match.suggestion[field]).trim().toLocaleLowerCase('hu-HU')).filter(Boolean)
      return values.length > 1 && new Set(values).size > 1
    })
    if (differing.length) {
      const item = document.createElement('div')
      item.className = 'ebook-library__metadata-evidence-item'
      item.textContent = `A források eltérnek ezekben: ${differing.map((field) => METADATA_LABELS[field]).join(', ')}. Válaszd ki mezőnként a megfelelő értéket.`
      container.append(item)
    }
  }
  container.hidden = !matches.length
}
function renderMetadataProposals(matches) {
  const container = $('#ebook-metadata-field-suggestions')
  metadataProposalControls = new Map()
  if (!container) return
  container.replaceChildren()
  for (const field of [...METADATA_FIELDS, 'coverUrl']) {
    const available = matches.map((match, index) => ({ index, match, value: proposalText(match.suggestion[field]) })).filter((item) => item.value)
    if (!available.length) continue
    const row = document.createElement('label')
    row.className = 'ebook-library__metadata-proposal'
    const name = document.createElement('span')
    name.textContent = METADATA_LABELS[field]
    const select = document.createElement('select')
    select.className = 'input'
    select.setAttribute?.('aria-label', `${METADATA_LABELS[field]} javaslatának forrása`)
    const keep = document.createElement('option')
    keep.value = ''
    keep.textContent = 'Meglévő / kézi érték megtartása'
    select.append(keep)
    for (const item of available) {
      const option = document.createElement('option')
      option.value = String(item.index)
      option.textContent = `${item.match.source}: ${item.value.length > 90 ? `${item.value.slice(0, 87)}…` : item.value}`
      select.append(option)
    }
    select.value = field !== 'coverUrl' && !($(`#ebook-metadata-${field}`)?.value || '').trim() ? String(available[0].index) : ''
    metadataProposalControls.set(field, select)
    row.append(name, select)
    container.append(row)
  }
  container.hidden = metadataProposalControls.size === 0
}
function applyMetadataSuggestion() {
  if (!metadataSearchMatches.length) { setMetadataMessage('Nincs alkalmazható javaslat.', 'error'); return }
  let count = 0
  for (const [field, control] of metadataProposalControls) {
    if (control.value === '') continue
    const value = metadataSearchMatches[Number(control.value)]?.suggestion[field]
    if (!value) continue
    if (field === 'coverUrl') {
      pendingCoverBlob = null; pendingCoverUrl = value; pendingCoverRemoved = false; coverChangeSerial++
      renderCoverPreview(value)
    } else {
      const input = $(`#ebook-metadata-${field}`)
      if (input) input.value = proposalText(value)
    }
    control.value = ''
    count++
  }
  if (!count) { setMetadataMessage('Válassz ki legalább egy javasolt mezőt.', 'error'); return }
  $('#ebook-metadata-apply').disabled = true
  setMetadataDirty(true)
  updateMetadataPreview()
  setMetadataMessage(`${count} javasolt mező alkalmazva. A véglegesítéshez kattints a Metaadatok mentése gombra.`, 'success')
}
function selectMetadataSource() {
  const match = metadataSearchMatches[Number($('#ebook-metadata-source')?.value)]
  pendingMetadataSuggestion = match?.suggestion || null
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = !pendingMetadataSuggestion
  const index = metadataSearchMatches.indexOf(match)
  for (const [field, control] of metadataProposalControls) if (control.value !== '' && match?.suggestion[field]) control.value = String(index)
  if (match) setMetadataMessage(`Kiválasztva: ${match.source} — ${match.suggestion.title}${match.suggestion.author ? ` — ${match.suggestion.author}` : ''}. A mentés csak a Javaslat alkalmazása után történik.`, 'success')
}
function parseFilenameMetadata(name = '') {
  const clean = name.replace(/(?:\.(?:fb2\.zip|epub|mobi|azw3?|pdf|prc|fb2|djvu|txt))+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  const doubleParts = clean.split(/\s+[-–—]{2,}\s+/).map((part) => part.trim()).filter(Boolean)
  if (doubleParts.length >= 2) return cleanMetadataParts(doubleParts[0], doubleParts[1])
  const match = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (!match) return null
  const left = match[1].trim(); const right = match[2].trim()
  if (/,/.test(right) || (looksLikeAuthor(right) && !looksLikeAuthor(left))) return cleanMetadataParts(left, right)
  return cleanMetadataParts(right, left)
}
function cleanMetadataParts(title, author) {
  const cleanTitle = title.replace(/\s+[-–—]\s+\d+$/, '').trim()
  const cleanAuthor = author.split(/\s*;\s*/)[0].replace(/\s+[-–—]\s+\d+$/, '').replace(/\s+\((?:auth\.?|author|szerző)\)$/i, '').replace(/(?<=\p{L})\d+$/u, '').trim()
  return cleanTitle && cleanAuthor ? { title: cleanTitle, author: cleanAuthor } : null
}
function isbnIsValid(isbn) {
  if (!isbn) return true
  if (/^\d{13}$/.test(isbn)) return [...isbn].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0
  if (/^\d{9}[\dX]$/.test(isbn)) return [...isbn].reduce((sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0
  return false
}
function isbnLookupProblem(isbn) {
  if (isbn.length === 12 && /^\d{12}$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
    return `Az ISBN-13 utolsó számjegye hiányzik. Ha az első 12 számjegy helyes, a teljes szám ${isbn}${(10 - sum % 10) % 10} lehet. Ellenőrizd a könyvön, majd írd be a teljes ISBN-t.`
  }
  if (isbn.length !== 10 && isbn.length !== 13) return `Az ISBN ${isbn.length} karakteres; ISBN-10 esetén 10, ISBN-13 esetén 13 karakter kell. A keresés nem indult el.`
  return 'Az ISBN ellenőrzőszáma hibás. Ellenőrizd a számot a könyvön; a keresés nem indult el.'
}
function metadataFromForm() {
  const result = {}
  for (const key of METADATA_FIELDS) {
    const value = ($(`#ebook-metadata-${key}`)?.value || '').trim()
    result[key] = key === 'subjects' ? [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))].slice(0, 20) : value
  }
  result.isbn = result.isbn.replace(/[^\dX]/gi, '').toUpperCase()
  return result
}
function validateMetadataForm(values, needsEpub) {
  if (needsEpub && !values.title) throw new Error('Az EPUB címét add meg a mentéshez.')
  if (!isbnIsValid(values.isbn)) throw new Error('Az ISBN ellenőrzőszáma hibás.')
  if (values.language && !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(values.language)) throw new Error('A nyelv kódja legyen például hu vagy en.')
  if (values.publishedDate && !/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(values.publishedDate)) throw new Error('A megjelenés formátuma ÉÉÉÉ, ÉÉÉÉ-HH vagy ÉÉÉÉ-HH-NN lehet.')
  if (/^\d{4}-\d{2}-\d{2}$/.test(values.publishedDate)) {
    const date = new Date(`${values.publishedDate}T00:00:00Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.publishedDate) throw new Error('Nem létező megjelenési dátum.')
  }
  if (values.seriesIndex && !/^\d+(?:\.\d+)?$/.test(values.seriesIndex)) throw new Error('A sorozatszám legyen pozitív szám.')
  if (values.description.length > 10000) throw new Error('A leírás legfeljebb 10 000 karakter lehet.')
}
async function selectedCover() {
  if (pendingCoverRemoved || (!pendingCoverBlob && !pendingCoverUrl)) return null
  let blob = pendingCoverBlob
  if (!blob) {
    const url = new URL(pendingCoverUrl)
    if (url.protocol !== 'https:') throw new Error('A borító forrásának biztonságos HTTPS-címnek kell lennie.')
    let response
    try { response = await fetch(url.toString()) }
    catch { throw new Error('A katalógus borítója nem érhető el a böngészőből. Tölts fel saját JPG/PNG képet.') }
    if (!response.ok) throw new Error('A katalógus borítója nem tölthető le. Tölts fel saját JPG/PNG képet.')
    blob = await response.blob()
  }
  if (blob.size > MAX_COVER_SIZE) throw new Error('A borító legfeljebb 10 MiB lehet.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])
  if (!jpeg && !png) throw new Error('Csak érvényes JPG vagy PNG borító használható.')
  return { bytes, mimeType: png ? 'image/png' : 'image/jpeg' }
}
async function uploadCoverAsset(folderId, bookId, cover) {
  const extension = cover.mimeType === 'image/png' ? 'png' : 'jpg'
  const boundary = `grapes-cover-${crypto.randomUUID()}`
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({ name: `.grapes-cover-${bookId}-${Date.now()}.${extension}`, parents: [folderId], mimeType: cover.mimeType }), `\r\n--${boundary}\r\nContent-Type: ${cover.mimeType}\r\n\r\n`, cover.bytes, `\r\n--${boundary}--\r\n`])
  const response = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
  return (await response.json()).id
}
function sameDriveVersion(left, right) {
  if (left?.headRevisionId && right?.headRevisionId) return left.headRevisionId === right.headRevisionId
  if (left?.md5Checksum && right?.md5Checksum) return left.md5Checksum === right.md5Checksum
  return left?.modifiedTime === right?.modifiedTime && String(left?.size || '') === String(right?.size || '')
}
async function getBookDriveVersion(id) {
  const response = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,size,modifiedTime,md5Checksum,headRevisionId,mimeType,capabilities(canEdit),isAppAuthorized`)
  return response.json()
}
function looksLikeAuthor(value = '') {
  const clean = value.replace(/\([^)]*\)/g, '').replace(/\bdr\.?\s*/gi, '').trim()
  if (/\b(?:19|20)\d{2}\b|\b(?:kiadó|publisher|press|isbn|budapest)\b/i.test(clean)) return false
  const words = clean.split(/[\s,]+/).filter(Boolean)
  return words.length >= 2 && words.length <= 5 && !/\d/.test(clean)
}
function extractIsbn(name = '') {
  const matches = name.match(/(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dX]/gi) || []
  return matches.map((value) => value.replace(/[^\dX]/gi, '')).find((value) => value.length === 10 || value.length === 13) || ''
}
function suggestMetadata(name = '') {
  const parsed = parseFilenameMetadata(name)
  return parsed ? `Szerző: ${parsed.author} · Cím: ${parsed.title}` : 'nem azonosítható biztosan a szerző és a cím.'
}
function openMetadataEditor(id) { const select = $('#ebook-metadata-book'); if (select) { select.value = id; updateMetadataForm(); $('#ebook-metadata-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } }
function canWriteEpub(book) {
  return EPUB_WRITE_ENABLED && ext(book?.name || '') === 'epub' && book?.isAppAuthorized === true
}
async function saveMetadataFromForm() {
  const book = currentBooks.find((item) => item.id === $('#ebook-metadata-book')?.value)
  return saveMetadata({ catalogOnly: !canWriteEpub(book) })
}
async function saveMetadata({ catalogOnly = false } = {}) {
  const id = $('#ebook-metadata-book')?.value
  if (!id) return setStatus('Válassz ki egy könyvet a szerkesztéshez.', 'error')
  const book = currentBooks.find((item) => item.id === id)
  const epub = ext(book?.name || '') === 'epub'
  const edited = metadataFromForm()
  const fingerprint = JSON.stringify(edited) + pendingCoverUrl + (pendingCoverBlob?.size || '') + String(pendingCoverRemoved) + coverChangeSerial
  try {
    if (epub && !catalogOnly && !partialMetadataSave && window.confirm && !window.confirm('Az EPUB-fájl módosul a Drive-on. Csak akkor folytasd, ha külön megvan az eredeti példány. Folytatod?')) return
    if (partialMetadataSave && (partialMetadataSave.id !== id || partialMetadataSave.fingerprint !== fingerprint)) throw new Error('Egy korábbi EPUB-mentés adatlaprésze még hiányzik. Előbb próbáld újra ugyanannál a könyvnél, változatlan mezőkkel.')
    validateMetadataForm(edited, epub && !catalogOnly)
    const save = $('#ebook-metadata-save'); if (save) save.disabled = true
    const indicator = $('#ebook-metadata-dirty'); if (indicator) indicator.textContent = 'Mentés a Drive-ra…'
    const { folderId } = await getReaderLibraryBooks()
    // Mindig a Drive legfrissebb állapotához fűzzük a módosítást. Így egy
    // másik eszközön mentett könyv nem tűnik el a következő mentéskor.
    await loadEbookMetadata(folderId)
    if (JSON.stringify(ebookMetadata[id] || {}) !== metadataLoadedSnapshot) throw new Error('A könyv adatai közben megváltoztak egy másik eszközön. Frissítsd a könyvtárat, majd egyeztesd az eltéréseket.')
    let cover = partialMetadataSave?.id === id && partialMetadataSave.fingerprint === fingerprint ? partialMetadataSave.cover : await selectedCover()
    if (epub && !catalogOnly) {
      if (!EPUB_WRITE_ENABLED) throw new Error('Az EPUB-fájl mentése még nincs élesítve. A könyvtári adatlap külön menthető.')
      if (partialMetadataSave?.id === id && partialMetadataSave.fingerprint === fingerprint && !sameDriveVersion(partialMetadataSave.version, await getBookDriveVersion(id))) throw new Error('Az EPUB az előző mentési kísérlet óta újra módosult a Drive-on. Frissítsd a könyvtárat.')
      if (!partialMetadataSave || partialMetadataSave.id !== id || partialMetadataSave.fingerprint !== fingerprint) {
        const before = await getBookDriveVersion(id)
        if (book?.modifiedTime && !sameDriveVersion(book, before)) throw new Error('Az EPUB-fájl közben módosult a Drive-on. Frissítsd a könyvtárat a mentés előtt.')
        if (before.capabilities?.canEdit === false) throw new Error('Ehhez az EPUB-hoz nincs szerkesztési jogod a Drive-on.')
        if (before.isAppAuthorized !== true) throw new Error('Ehhez az EPUB-hoz nincs fájlonkénti Grapes-hozzáférés. A teljes Drive-jogot nem kérjük; egyelőre csak a könyvtári adatlap menthető.')
        setStatus('Az EPUB letöltése és ellenőrzése…')
        const original = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`)).blob()
        setStatus('Az EPUB metaadatainak és borítójának frissítése…')
        const clearFields = METADATA_FIELDS.filter((field) => Boolean(ebookMetadata[id]?.[field]?.length) && !edited[field]?.length)
        const updated = await (await loadEpubWriter())(original, edited, pendingCoverRemoved ? { remove: true } : cover, { clearFields })
        if (!sameDriveVersion(before, await getBookDriveVersion(id))) throw new Error('Az EPUB-fájl a feldolgozás közben módosult. Nem írtam felül.')
        setStatus('A módosított EPUB feltöltése a Drive-ra…')
        const response = await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,size,modifiedTime,md5Checksum,headRevisionId`, { method: 'PATCH', headers: { 'Content-Type': 'application/epub+zip' }, body: updated })
        const uploaded = await response.json()
        Object.assign(book, uploaded)
        partialMetadataSave = { id, fingerprint, cover, version: uploaded }
      }
    }
    let coverFileId = ebookMetadata[id]?.coverFileId || ''
    let coverMimeType = ebookMetadata[id]?.coverMimeType || ''
    if (pendingCoverRemoved) { coverFileId = ''; coverMimeType = '' }
    if (cover) {
      coverFileId = pendingCoverAsset?.id === id && pendingCoverAsset.fingerprint === fingerprint
        ? pendingCoverAsset.fileId : await uploadCoverAsset(folderId, id, cover)
      coverMimeType = cover.mimeType
      pendingCoverAsset = { id, fingerprint, fileId: coverFileId }
      if (partialMetadataSave) partialMetadataSave.coverFileId = coverFileId
    }
    const priorEntry = ebookMetadata[id]
    ebookMetadata[id] = normalizeMetadataEntry({ ...edited, coverFileId, coverMimeType, updatedAt: new Date().toISOString() })
    try { await saveEbookMetadata(folderId) }
    catch (error) { if (priorEntry) ebookMetadata[id] = priorEntry; else delete ebookMetadata[id]; throw error }
    partialMetadataSave = null
    pendingCoverAsset = null
    renderBooks(currentBooks)
    saveLibraryCache(currentBooks)
    openMetadataEditor(id)
    setMetadataDirty(false)
    setStatus(epub && !catalogOnly ? 'A könyvtári adatlap és az EPUB metaadatai mentve a Drive-ba.' : 'A könyvtári adatlap mentve a Drive-ba; a könyvfájl változatlan maradt.', 'success')
  } catch (error) {
    setMetadataDirty(true)
    const fallback = $('#ebook-metadata-save-catalog')
    if (fallback && epub && !partialMetadataSave) fallback.hidden = false
    setStatus(`${partialMetadataSave ? 'Az EPUB már mentve van, de a könyvtári adatlap még nem. Ugyanezzel a gombbal újrapróbálhatod.' : 'A mentés nem sikerült.'} ${error.message}`, 'error')
  }
}
async function connectDrive() {
  try {
    await connectGrapesDrive()
    const connect = $('#ebook-drive-connect')
    if (connect) { connect.textContent = 'Google Drive csatlakoztatva'; connect.disabled = true }
    setStatus('A közös Grapes Drive kapcsolat aktív.', 'success')
    await refreshLibrary({ forceFullScan: true })
  } catch (error) {
    setStatus(`Google bejelentkezési hiba: ${error.message}`, 'error')
  }
}
async function disconnectDrive() {
  await disconnectGrapesDrive()
  setStatus('A Google Drive kapcsolat leválasztva. A Drive-on lévő fájlok nem változtak.', 'success')
}
const driveRequest = grapesDriveRequest
async function loadEpubWriter() { return (await import('./ebook/epub-metadata.js')).rewriteEpubMetadata }
function accessTokenAvailable() { return isGrapesDriveConnected() }
async function findLibraryFolderIds() {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const folderIds = []
  let pageToken = ''
  do {
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name)&pageSize=100&pageToken=${encodeURIComponent(pageToken)}`)
    const data = await response.json()
    for (const folder of data.files || []) if (folder.id) folderIds.push(folder.id)
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return [...new Set(folderIds)]
}
async function ensureLibraryFolder() {
  const folderIds = await findLibraryFolderIds()
  if (folderIds[0]) return folderIds[0]
  const created=await driveRequest('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})})
  return (await created.json()).id
}
async function listFolderChildren(folderId) {
  const children = []
  const query = `'${folderId}' in parents and trashed = false`
  let pageToken = ''
  do {
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,modifiedTime,mimeType,parents,isAppAuthorized)&orderBy=modifiedTime desc&pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`)
    const data = await response.json()
    children.push(...(data.files || []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return children
}
async function listLibraryTree(rootFolderId) {
  const books = [], visited = new Set()
  let pending = [rootFolderId]
  while (pending.length) {
    const level = pending.filter((folderId) => folderId && !visited.has(folderId))
    pending = []
    level.forEach((folderId) => visited.add(folderId))
    for (let index = 0; index < level.length; index += 6) {
      const groups = await Promise.all(level.slice(index, index + 6).map(listFolderChildren))
      for (const files of groups) for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') pending.push(file.id)
        else if (isBookFile(file)) books.push(file)
      }
    }
  }
  return books
}
async function listAllDriveBooks() {
  const books = []
  const query = "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
  let pageToken = ''
  do {
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,modifiedTime,mimeType,parents,isAppAuthorized)&pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`)
    const data = await response.json()
    for (const file of data.files || []) if (isDriveBook(file)) books.push(file)
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return books
}
async function getReaderLibraryBooks() {
  const folderIds = await findLibraryFolderIds()
  const folderId = folderIds[0] || await ensureLibraryFolder()
  if (!folderIds.length) folderIds.push(folderId)
  const books = (await Promise.all(folderIds.map(listLibraryTree))).flat()
  return { folderId, books: [...new Map(books.map((file) => [file.id, file])).values()].filter((file) => isShareableBook(file.name)) }
}
async function ensurePublicRead(fileId) {
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
    })
  } catch (error) {
    if (!String(error.message || '').toLowerCase().includes('already')) throw error
  }
}
async function createReaderMarker(folderId) {
  const nonce = createReaderNonce()
  const payload = JSON.stringify({
    kind: 'grapes-reader-pairing',
    nonce,
    createdAt: Date.now(),
    folderId,
  })
  const boundary = `grapes-reader-${crypto.randomUUID()}`
  const staleQuery = `'${folderId}' in parents and name contains '.grapes-reader-pairing' and trashed = false`
  const stale = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(staleQuery)}&fields=files(id,name)&pageSize=100`)).json()
  for (const file of stale.files || []) {
    if (!INTERNAL_PAIRING_FILE.test(file.name)) continue
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?fields=id,trashed`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    })
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({
      name: '.grapes-reader-pairing.json',
      parents: [folderId],
      mimeType: 'application/json',
    }),
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    payload,
    `\r\n--${boundary}--\r\n`,
  ])
  const response = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return { markerId: (await response.json()).id, nonce }
}
async function createReaderPairing() {
  if (!accessTokenAvailable()) return setStatus('Előbb csatlakoztasd a Google Drive-ot.', 'error')
  if (!TRANSFER_BROKER_URL) return setStatus('Az E-book Transfer broker nincs konfigurálva.', 'error')

  const button = $('#ebook-reader-pair-btn')
  if (button.disabled) return
  button.disabled = true
  clearReaderPairCode('A párosítási kód előkészítése…')
  $('#ebook-reader-pair-code').hidden = true
  try {
    setStatus('Az e-olvasó könyvtár előkészítése…')
    const { folderId, books } = await getReaderLibraryBooks()
    const shareableBooks = books.filter((book) => book.isAppAuthorized !== false)
    for (let index = 0; index < shareableBooks.length; index += 6) {
      const batch = shareableBooks.slice(index, index + 6)
      setStatus(`E-olvasó megosztás: ${Math.min(index + batch.length, shareableBooks.length)}/${shareableBooks.length} könyv…`)
      await Promise.all(batch.map((book) => ensurePublicRead(book.id)))
    }
    setReaderLibraryEnabled(true)

    const marker = await createReaderMarker(folderId)
    readerPairNonce = marker.nonce
    const brokerUrl = buildBrokerUrl({
      action: 'create-reader-pairing',
      markerId: marker.markerId,
      nonce: marker.nonce,
      returnUrl: READER_PAGE_URL,
    })

    showPairingFrame('#ebook-reader-pair-code', brokerUrl)
    setReaderPairStatus(`${books.length} könyv előkészítve. A párosítási kód érkezésére várunk…`)
    readerPairMessageTimer = window.setTimeout?.(() => {
      const input = $('#ebook-reader-pair-value')
      if (!input?.value) setReaderPairStatus('A párosítási kód nem érkezett meg. Próbáld újra.', 'error')
    }, 45000)
  } catch (error) {
    setReaderPairStatus(`Az e-olvasó párosítása nem sikerült. ${error.message}`, 'error')
  } finally { button.disabled = false }
}
async function refreshLibrary({ forceFullScan = false } = {}) {
  if(!accessTokenAvailable()) return
  try {
    const account = activeLibraryAccount()
    if (cachedAccount && cachedAccount !== account) {
      resetLibraryCacheMemory()
      ebookMetadata = {}
      renderBooks([])
    }
    setStatus('A Grapes könyvtármappa frissítése…')
    const folderIds = await findLibraryFolderIds()
    if (!folderIds.length) folderIds.push(await ensureLibraryFolder())
    const foundBooks = (await Promise.all(folderIds.map(listLibraryTree))).flat()
    const libraryFolder = folderIds[0]
    if (libraryFolder) await loadEbookMetadata(libraryFolder)
    let books = [...new Map(foundBooks.map((file) => [file.id, file])).values()]
    if (grapesDriveHasFullReadAccess() && cachedBooks.length) books = [...new Map([...books, ...cachedBooks].map((file) => [file.id, file])).values()]
    renderBooks(books)
    setUploadState(`● ${foundBooks.length} könyv a Grapes mappában`, 'success')
    if (grapesDriveHasFullReadAccess()) {
      const cacheFresh = cachedAt > Date.now() - FULL_SCAN_CACHE_MS
      if (!forceFullScan && cacheFresh) {
        saveLibraryCache(books)
        setStatus(`${books.length} könyv betöltve. A teljes Drive legutóbbi eredménye gyorsítótárból érkezett.`, 'success')
        return true
      }
      setStatus(`${books.length} könyv már látható. A teljes Drive ellenőrzése a háttérben…`)
      const allDriveBooks = await listAllDriveBooks()
      books = [...new Map([...foundBooks, ...allDriveBooks].map((file) => [file.id, file])).values()]
      renderBooks(books)
      saveLibraryCache(books)
      setStatus(`${books.length} könyv a teljes Google Drive-ban.`, 'success')
    } else {
      saveLibraryCache(books)
      setStatus(`${books.length} könyv látható. A teljes Drive keresése külön engedélyezhető.`, 'success')
    }
    return true
  } catch (error) { setStatus(`A könyvtár betöltése nem sikerült. ${error.message}`,'error'); return false }
}
async function uploadBook(file) {
  if(!accessTokenAvailable()) return setStatus('Előbb csatlakoztasd a Google Drive-ot.','error')
  if(!isBookFile(file)) return setStatus('Ez a fájl nem vehető fel a könyvtárba.','error')
  try {
    const folderId=await ensureLibraryFolder(); const boundary=`grapes-ebook-${crypto.randomUUID()}`
    const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify({name:file.name,parents:[folderId]}),`\r\n--${boundary}\r\nContent-Type: ${file.type||'application/octet-stream'}\r\n\r\n`,file,`\r\n--${boundary}--\r\n`])
    const uploadResponse = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})
    const created = await uploadResponse.json()
    if (readerLibraryEnabled() && created.id && isShareableBook(file.name)) await ensurePublicRead(created.id)
    if (await refreshLibrary()) setStatus(`${file.name} hozzáadva a könyvtárhoz.`,'success')
  } catch (error) { setStatus(`A feltöltés nem sikerült. ${error.message}`,'error') }
}
async function downloadBook(fileId) {
  try { const meta=await(await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`)).json(); const blob=await(await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=meta.name; a.click(); URL.revokeObjectURL(url) } catch { setStatus('A letöltés nem sikerült.','error') }
}
async function sendBook(fileId) {
  if (!accessTokenAvailable()) return setStatus('Előbb csatlakoztasd a Google Drive-ot.', 'error')
  if (!TRANSFER_BROKER_URL) return setStatus('Az E-book Transfer broker nincs konfigurálva.', 'error')
  try {
    const meta = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`)).json()
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
    }).catch((error) => {
      if (!String(error.message).toLowerCase().includes('already')) throw error
    })
    const brokerUrl = buildBrokerUrl({ action: 'create', fileId, returnUrl: APP_RETURN_URL })
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`
    const readerUrl = new URL(APP_RETURN_URL)
    readerUrl.searchParams.set('ebook-reader', '1')
    $('#ebook-transfer-name').textContent = meta.name
    $('#ebook-transfer-url').value = downloadUrl
    $('#ebook-transfer-pair').dataset.brokerUrl = brokerUrl
    $('#ebook-transfer-code').hidden = true
    $('#ebook-transfer-code').removeAttribute('src')
    $('#ebook-reader-url').value = readerUrl.toString()
    $('#ebook-transfer-panel').hidden = false
    const canvas = $('#ebook-transfer-qr')
    canvas.hidden = true
    $('#ebook-qr-status').textContent = ''
    try {
      await QRCode.toCanvas(canvas, downloadUrl, { width: 260, margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      canvas.hidden = false
    } catch { $('#ebook-qr-status').textContent = 'A QR-kód nem készült el. Használd a letöltési linket vagy kérj párosítási kódot.' }
    setStatus('A könyv küldésre kész. Olvasd be a QR-kódot, vagy kérj 6 karakteres kódot.', 'success')
  } catch (error) {
    setStatus(`Az átvitel előkészítése nem sikerült. ${error.message}`, 'error')
  }
}
function setEbookMode(mode = 'library') {
  const manager = $('#ebook-manager-view')
  if (manager) manager.dataset.ebookMode = mode
  const labels = { library: 'E-book Könyvtár', organizer: 'Könyvszerkesztő' }
  const sub = document.querySelector('#ebook-toolbar .toolbar__brand-sub')
  if (sub) sub.textContent = labels[mode] || labels.library
}
function showEbookManager() {
  const manager = $('#ebook-manager-view')
  if (manager) manager.hidden = false
  setEbookMode('library')
  if (accessTokenAvailable()) refreshLibrary()
}
function showEbookOrganizer() {
  const manager = $('#ebook-manager-view')
  if (manager) manager.hidden = false
  setEbookMode('organizer')
  if (accessTokenAvailable()) refreshLibrary()
}
export function initEbookLibrary() {
  import('./ebook-reader-sync.js').then(({ initReaderSync }) => initReaderSync()).catch((error) => console.warn('Az USB-s e-reader modul nem tölthető be:', error))
  const params = new URLSearchParams(window.location.search)
  const directReceiver = params.has('ebook-pair') || params.has('ebook-reader')
  const requestedView = window.sessionStorage?.getItem('grapes-ebook-view') === 'organizer' ? 'organizer' : 'library'
  if (initialized) {
    if (directReceiver || requestedView === 'library') showEbookManager()
    else showEbookOrganizer()
    handleTransferLink()
    return
  }
  initialized=true
  onGrapesDriveChange(renderDriveConnection)
  $('#ebook-reader-pair-btn')?.addEventListener('click', createReaderPairing)
  $('#ebook-reader-pair-value')?.addEventListener('click', (event) => event.currentTarget.select())
  $('#ebook-drive-connect')?.addEventListener('click',connectDrive)
  $('#ebook-drive-disconnect')?.addEventListener('click',disconnectDrive)
  $('#ebook-file-input')?.addEventListener('change',(e)=>{const file=e.target.files?.[0];if(file)uploadBook(file);e.target.value=''})
  $('#ebook-upload-btn')?.addEventListener('click',()=>$('#ebook-file-input')?.click())
  $('#ebook-refresh-btn')?.addEventListener('click', () => refreshLibrary({ forceFullScan: true }))
  $('#ebook-metadata-filter')?.addEventListener('input', renderMetadataOptions)
  $('#ebook-metadata-book')?.addEventListener('change', selectMetadataBook)
  for (const selector of METADATA_FIELDS.map((field) => `#ebook-metadata-${field}`)) {
    $(selector)?.addEventListener('input', () => { if (activeMetadataBookId) { setMetadataDirty(true); updateMetadataPreview() } })
  }
  $('#ebook-metadata-cover')?.addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_COVER_SIZE) { setMetadataMessage('Csak legfeljebb 10 MiB méretű JPG vagy PNG borító tölthető fel.', 'error'); event.currentTarget.value = ''; return }
    pendingCoverBlob = file; pendingCoverUrl = ''; pendingCoverRemoved = false; coverChangeSerial++
    showCoverBlob(file)
    setMetadataDirty(true)
  })
  $('#ebook-metadata-cover-clear')?.addEventListener('click', () => {
    pendingCoverBlob = null; pendingCoverUrl = ''; pendingCoverRemoved = true; coverChangeSerial++
    renderCoverPreview('')
    if ($('#ebook-metadata-cover')) $('#ebook-metadata-cover').value = ''
    setMetadataDirty(true)
  })
  $('#ebook-metadata-lookup')?.addEventListener('click', lookupBookMetadata)
  $('#ebook-metadata-source')?.addEventListener('change', selectMetadataSource)
  $('#ebook-metadata-apply')?.addEventListener('click', applyMetadataSuggestion)
  $('#ebook-metadata-save')?.addEventListener('click', saveMetadataFromForm)
  $('#ebook-metadata-grant')?.addEventListener('click', grantSelectedEpubAccess)
  $('#ebook-metadata-save-catalog')?.addEventListener('click', () => saveMetadata({ catalogOnly: true }))
  $('#ebook-transfer-close')?.addEventListener('click', closeTransfer)
  $('#ebook-transfer-pair')?.addEventListener('click', () => {
    const url = $('#ebook-transfer-pair').dataset.brokerUrl
    if (url) showPairingFrame('#ebook-transfer-code', url)
  })
  $('#ebook-transfer-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#ebook-transfer-url').value); setStatus('Átviteli link kimásolva.', 'success') } catch { setStatus('A link másolása nem sikerült.', 'error') } })
  $('#ebook-receiver-submit')?.addEventListener('click', () => {
    const code = $('#ebook-receiver-input')?.value.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code || '')) { $('#ebook-receiver-status').textContent = 'Adj meg egy 6 karakteres párosítási kódot.'; return }
    const url = buildBrokerUrl({ action: 'download', code })
    if (!url) { $('#ebook-receiver-status').textContent = 'Az átvétel még nincs konfigurálva.'; return }
    window.location.href = url
  })
  $('#ebook-receiver-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#ebook-receiver-submit')?.click() })
  window.addEventListener?.('message', handleReaderPairingMessage)
  document.addEventListener?.('grapes:before-screen-change', (event) => {
    if (event.detail?.from !== 'ebook' || !metadataDirty || $('#ebook-manager-view')?.dataset.ebookMode !== 'organizer') return
    if (!window.confirm('A könyvszerkesztőben mentetlen módosítások vannak. Biztosan kilépsz?')) event.preventDefault()
    else setMetadataDirty(false)
  })
  window.addEventListener?.('beforeunload', (event) => {
    if (!metadataDirty) return
    event.preventDefault()
    event.returnValue = ''
  })
  const sharedConnected = accessTokenAvailable()
  renderLibraryCache()
  renderDriveConnection()
  setStatus(sharedConnected ? 'A közös Grapes Drive kapcsolat aktív.' : (CLIENT_ID ? 'A Google Drive-ot a főmenüben vagy itt csatlakoztathatod.' : 'Drive nincs konfigurálva. Állítsd be a VITE_GOOGLE_CLIENT_ID értéket.'), sharedConnected ? 'success' : (CLIENT_ID ? '' : 'error'))
  if (sharedConnected) refreshLibrary()
  if (directReceiver || requestedView === 'library') showEbookManager()
  else showEbookOrganizer()
  handleTransferLink()
}
