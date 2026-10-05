import QRCode from 'qrcode'
import './styles/screens/ebook-library.css'
import { connectGrapesDrive, disconnectGrapesDrive, getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest, isGrapesDriveConnected, onGrapesDriveChange } from './storage/grapes-drive.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const FOLDER_NAME = 'Grapes E-book Library'
const READER_PAGE_URL = new URL('ebook-reader.html', window.location.href).toString()
const READER_SHARING_KEY = 'grapes-reader-library-enabled'
const LIBRARY_CACHE_KEY = 'grapes-ebook-library-cache-v1'
const FULL_SCAN_CACHE_MS = 5 * 60 * 1000
const INTERNAL_PAIRING_FILE = /^\.grapes-reader-pairing(?:-\d+)?\.json$/i
const INTERNAL_METADATA_FILE = /^\.grapes-ebook-metadata\.json$/i
const SHAREABLE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'txt', 'cbz', 'cbr'])
const DRIVE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'azw4', 'kfx', 'prc', 'fb2', 'djvu', 'djv', 'cbz', 'cbr', 'cb7', 'cbt', 'txt', 'rtf', 'doc', 'docx', 'odt', 'html', 'htm', 'xhtml', 'chm', 'lit', 'lrf', 'lrx', 'pdb', 'pml', 'pmlz', 'rb', 'snb', 'tcr', 'tr2', 'tr3', 'xps', 'oxps'])

let initialized = false
let currentBooks = []
let ebookMetadata = {}
let ebookMetadataFileId = null
let pendingMetadataSuggestion = null
let metadataLookupSerial = 0
let metadataSearchMatches = []
let metadataDirty = false
let activeMetadataBookId = ''
let cachedBooks = []
let cachedAt = 0
let readerPairMessageTimer = null
let readerPairExpiryTimer = null
let readerPairNonce = ''
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
function saveLibraryCache(books) {
  cachedBooks = books
  cachedAt = Date.now()
  try { window.localStorage?.setItem(LIBRARY_CACHE_KEY, JSON.stringify({ savedAt: cachedAt, books })) } catch {}
}
function renderLibraryCache() {
  try {
    const cached = JSON.parse(window.localStorage?.getItem(LIBRARY_CACHE_KEY) || 'null')
    if (!Array.isArray(cached?.books) || !cached.books.length) return false
    cachedBooks = cached.books
    cachedAt = Number(cached.savedAt) || 0
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
function normalizeEbookMetadata(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const normalized = payload.books && typeof payload.books === 'object'
    ? normalizeEbookMetadata(payload.books)
    : {}
  for (const [id, value] of Object.entries(payload)) {
    if (id === 'books' || id === 'version' || id === 'updatedAt') continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    if (!Object.hasOwn(value, 'title') && !Object.hasOwn(value, 'author')) continue
    normalized[id] = {
      title: String(value.title || '').trim(),
      author: String(value.author || '').trim(),
    }
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
  const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), books: ebookMetadata })
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
  if ($('#ebook-metadata-title')) $('#ebook-metadata-title').value = data.title || ''
  if ($('#ebook-metadata-author')) $('#ebook-metadata-author').value = data.author || ''
  pendingMetadataSuggestion = id ? parseFilenameMetadata(currentBooks.find((book) => book.id === id)?.name || '') : null
  metadataSearchMatches = []
  const sourceWrap = $('#ebook-metadata-source-wrap')
  if (sourceWrap) sourceWrap.hidden = true
  setMetadataMessage(id ? `Fájlnév alapján: ${suggestMetadata(currentBooks.find((book) => book.id === id)?.name || '')}` : '')
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = !pendingMetadataSuggestion
  updateMetadataPreview()
  setMetadataDirty(false)
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
  const typedTitle = $('#ebook-metadata-title')?.value.trim() || ''
  const typedAuthor = $('#ebook-metadata-author')?.value.trim() || ''
  const parsed = parseFilenameMetadata(book?.name || '')
  const title = typedTitle || parsed?.title || ''
  const author = typedAuthor || parsed?.author || ''
  const isbn = extractIsbn(book?.name || '')
  if (!title && !author && !isbn) { setMetadataMessage('Adj meg címet vagy szerzőt a kereséshez.', 'error'); return }
  const serial = ++metadataLookupSerial
  const button = $('#ebook-metadata-lookup'); if (button) button.disabled = true
  const sourceWrap = $('#ebook-metadata-source-wrap')
  if (sourceWrap) sourceWrap.hidden = true
  pendingMetadataSuggestion = null
  metadataSearchMatches = []
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = true
  setMetadataMessage('Keresés az Open Library és a Google Books katalógusában…')
  try {
    const results = await Promise.allSettled([findBookMetadata({ title, author, isbn }), findGoogleBooksMetadata({ title, author, isbn })])
    if (serial !== metadataLookupSerial || id !== $('#ebook-metadata-book')?.value) return
    const matches = results.map((result, index) => result.status === 'fulfilled' && result.value ? { ...result.value, source: index ? 'Google Books' : 'Open Library' } : null).filter(Boolean)
    const unavailable = results.map((result, index) => result.status === 'rejected' ? (index ? 'Google Books' : 'Open Library') : null).filter(Boolean)
    if (!matches.length) {
      const reason = unavailable.length ? ` Nem elérhető: ${unavailable.join(', ')}.` : ''
      throw new Error(`Egyik katalógusban sem találtam elég biztos egyezést.${reason} A cím és a szerző kézzel menthető.`)
    }
    const select = $('#ebook-metadata-source')
    if (select) {
      select.replaceChildren()
      matches.forEach((match, index) => {
        const option = document.createElement('option')
        option.value = String(index)
        option.textContent = `${match.source}: ${match.suggestion.title}${match.suggestion.author ? ` — ${match.suggestion.author}` : ''}${match.year ? ` · ${match.year}` : ''}`
        select.append(option)
      })
      select.value = '0'
    }
    if (sourceWrap) sourceWrap.hidden = matches.length < 2
    metadataSearchMatches = matches
    pendingMetadataSuggestion = matches[0].suggestion
    const first = matches[0]
    const detail = first.kind === 'author'
      ? 'A szerzőt megtaláltam; a megadott magyar címet megtartottam.'
      : `Találat: ${first.suggestion.title}${first.suggestion.author ? ` — ${first.suggestion.author}` : ''}${first.year ? ` · ${first.year}` : ''}`
    const agreement = matches.length > 1
      ? (metadataSimilarity(matches[0].suggestion.title, matches[1].suggestion.title) >= 0.8 && metadataSimilarity(matches[0].suggestion.author, matches[1].suggestion.author) >= 0.7
          ? ' A cím és a szerző mindkét forrásban egyezik; a kiadási év eltérhet.' : ' A források eltérnek; válaszd ki a megfelelő találatot.')
      : ` Csak a(z) ${first.source} adott biztos találatot.`
    setMetadataMessage(`${detail}${agreement}${unavailable.length ? ` Nem elérhető: ${unavailable.join(', ')}.` : ''}`, 'success')
    $('#ebook-metadata-apply').disabled = false
  } catch (error) {
    if (serial !== metadataLookupSerial) return
    const message = error?.name === 'AbortError' ? 'A keresés túllépte az időkorlátot.' : error.message
    setMetadataMessage(`A webes keresés nem sikerült. ${message}`, 'error')
  } finally { if (button && serial === metadataLookupSerial) button.disabled = false }
}

async function findGoogleBooksMetadata({ title = '', author = '', isbn = '' } = {}) {
  const token = getGrapesDriveAccessToken()
  if (!token) return null
  const searches = isbn ? [`isbn:${isbn}`] : []
  if (title || author) searches.push([title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(' '))
  for (const query of searches) {
    const params = new URLSearchParams({ q: query, printType: 'books', maxResults: '20' })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    let items
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      if (!response.ok) throw new Error(`Google Books keresési hiba (${response.status})`)
      items = (await response.json()).items || []
    } finally { window.clearTimeout(timeout) }
    const docs = items.map((item) => ({
      title: item.volumeInfo?.title || '', author_name: item.volumeInfo?.authors || [],
      first_publish_year: item.volumeInfo?.publishedDate?.slice(0, 4) || '',
      isbn: item.volumeInfo?.industryIdentifiers?.map((identifier) => identifier.identifier) || [],
    }))
    const exactIsbn = isbn && docs.find((doc) => doc.isbn.includes(isbn))
    if (exactIsbn) return metadataMatch(exactIsbn, 'isbn')
    const best = bestMetadataDocument(docs, { title, author })
    if (best && (title && author ? best.titleScore >= 0.72 && best.authorScore >= 0.5 : title ? best.titleScore >= 0.72 : best.authorScore >= 0.72)) return metadataMatch(best.doc, 'exact')
  }
  return null
}

async function queryOpenLibrary(parameters, signal) {
  const search = new URLSearchParams({ fields: 'title,author_name,first_publish_year,cover_i,key', limit: '20' })
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
    const isbnMatch = bestMetadataDocument(await queryOpenLibrary({ isbn }, controller.signal), { title, author })
    if (isbnMatch?.doc) return metadataMatch(isbnMatch.doc, 'isbn')
  }
  if (title && author) {
    const exact = bestMetadataDocument(await queryOpenLibrary({ title, author }, controller.signal), { title, author })
    if (exact?.score >= 0.62) return metadataMatch(exact.doc, 'exact')
  }
  if (title) {
    const byTitle = bestMetadataDocument(await queryOpenLibrary({ title }, controller.signal), { title, author })
    if (byTitle?.titleScore >= 0.72 && (!author || byTitle.authorScore >= 0.5)) return metadataMatch(byTitle.doc, 'title')
  }
  if (author) {
    const byAuthor = bestMetadataDocument(await queryOpenLibrary({ author }, controller.signal), { author })
    if (byAuthor?.authorScore >= 0.72) {
      return {
        kind: 'author', year: '',
        suggestion: { title, author: byAuthor.doc.author_name?.[0] || author },
      }
    }
  }
  return null
  } finally { window.clearTimeout(timeout) }
}

function metadataMatch(doc, kind) {
  return {
    kind, year: doc.first_publish_year || '',
    suggestion: { title: doc.title || '', author: doc.author_name?.[0] || '' },
  }
}
function applyMetadataSuggestion() {
  if (!pendingMetadataSuggestion) { setMetadataMessage('Nincs alkalmazható javaslat.', 'error'); return }
  $('#ebook-metadata-title').value = pendingMetadataSuggestion.title || ''
  $('#ebook-metadata-author').value = pendingMetadataSuggestion.author || ''
  $('#ebook-metadata-apply').disabled = true
  setMetadataDirty(true)
  updateMetadataPreview()
  setMetadataMessage('A javaslat alkalmazva. A véglegesítéshez kattints a Metaadatok mentése gombra.', 'success')
}
function selectMetadataSource() {
  const match = metadataSearchMatches[Number($('#ebook-metadata-source')?.value)]
  pendingMetadataSuggestion = match?.suggestion || null
  if ($('#ebook-metadata-apply')) $('#ebook-metadata-apply').disabled = !pendingMetadataSuggestion
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
async function saveMetadataFromForm() {
  const id = $('#ebook-metadata-book')?.value
  if (!id) return setStatus('Válassz ki egy könyvet a szerkesztéshez.', 'error')
  const edited = {
    title: $('#ebook-metadata-title')?.value.trim() || '',
    author: $('#ebook-metadata-author')?.value.trim() || '',
  }
  try {
    const save = $('#ebook-metadata-save'); if (save) save.disabled = true
    const indicator = $('#ebook-metadata-dirty'); if (indicator) indicator.textContent = 'Mentés a Drive-ra…'
    const { folderId } = await getReaderLibraryBooks()
    // Mindig a Drive legfrissebb állapotához fűzzük a módosítást. Így egy
    // másik eszközön mentett könyv nem tűnik el a következő mentéskor.
    await loadEbookMetadata(folderId)
    ebookMetadata[id] = edited
    await saveEbookMetadata(folderId)
    renderBooks(currentBooks)
    openMetadataEditor(id)
    setMetadataDirty(false)
    setStatus('A könyv metaadatai mentve a Drive-ba.', 'success')
  } catch (error) { setMetadataDirty(true); setStatus(`A metaadatok mentése nem sikerült. ${error.message}`, 'error') }
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
  renderBooks([])
  setStatus('A Google Drive kapcsolat leválasztva. A Drive-on lévő fájlok nem változtak.', 'success')
}
const driveRequest = grapesDriveRequest
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
    const returnUrl = new URL(window.location.href)
    returnUrl.search = ''
    returnUrl.hash = ''
    const brokerUrl = buildBrokerUrl({ action: 'create', fileId, returnUrl: returnUrl.toString() })
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`
    const readerUrl = new URL(returnUrl)
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
  for (const selector of ['#ebook-metadata-title', '#ebook-metadata-author']) {
    $(selector)?.addEventListener('input', () => { if (activeMetadataBookId) { setMetadataDirty(true); updateMetadataPreview() } })
  }
  $('#ebook-metadata-lookup')?.addEventListener('click', lookupBookMetadata)
  $('#ebook-metadata-source')?.addEventListener('change', selectMetadataSource)
  $('#ebook-metadata-apply')?.addEventListener('click', applyMetadataSuggestion)
  $('#ebook-metadata-save')?.addEventListener('click', saveMetadataFromForm)
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
