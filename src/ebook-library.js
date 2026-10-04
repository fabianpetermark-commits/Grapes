import QRCode from 'qrcode'
import './styles/screens/ebook-library.css'
import { connectGrapesDrive, disconnectGrapesDrive, getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest, isGrapesDriveConnected, onGrapesDriveChange } from './storage/grapes-drive.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const FOLDER_NAME = 'Grapes E-book Library'
const READER_PAGE_URL = new URL('ebook-reader.html', window.location.href).toString()
const READER_SHARING_KEY = 'grapes-reader-library-enabled'
const INTERNAL_PAIRING_FILE = /^\.grapes-reader-pairing(?:-\d+)?\.json$/i
const SHAREABLE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'txt', 'cbz', 'cbr'])
const DRIVE_BOOK_EXTENSIONS = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'azw4', 'kfx', 'prc', 'fb2', 'djvu', 'djv', 'cbz', 'cbr', 'cb7', 'cbt', 'txt', 'rtf', 'doc', 'docx', 'odt', 'html', 'htm', 'xhtml', 'chm', 'lit', 'lrf', 'lrx', 'pdb', 'pml', 'pmlz', 'rb', 'snb', 'tcr', 'tr2', 'tr3', 'xps', 'oxps'])

let initialized = false
const $ = (selector) => document.querySelector(selector)
const ext = (name = '') => name.includes('.') ? name.split('.').pop().toLowerCase() : 'FILE'
const isShareableBook = (name = '') => SHAREABLE_BOOK_EXTENSIONS.has(ext(name))
const isBookFile = (file) => Boolean(file?.name)
  && !file.name.startsWith('.')
  && !INTERNAL_PAIRING_FILE.test(file.name)
  && file.mimeType !== 'application/vnd.google-apps.folder'
  && !String(file.mimeType || '').startsWith('application/vnd.google-apps.')
const isDriveBook = (file) => isBookFile(file) && (DRIVE_BOOK_EXTENSIONS.has(ext(file.name)) || /\.fb2\.zip$/i.test(file.name))
const formatSize = (bytes) => !Number.isFinite(bytes) ? '—' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function setStatus(message, kind = '') { const node = $('#ebook-status'); if (node) { node.textContent = message; node.dataset.kind = kind } }
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
function renderDriveConnection() {
  const connected = isGrapesDriveConnected()
  const button = $('#ebook-drive-connect')
  if (button) { button.disabled = connected; button.textContent = connected ? 'Google Drive csatlakoztatva' : 'Google Drive csatlakoztatása' }
  const disconnect = $('#ebook-drive-disconnect')
  if (disconnect) disconnect.disabled = !connected
  const fullRead = $('#ebook-drive-full-read')
  if (fullRead) {
    fullRead.disabled = !connected || grapesDriveHasFullReadAccess()
    fullRead.textContent = grapesDriveHasFullReadAccess() ? 'Automatikus Drive-beolvasás aktív' : 'Automatikus Drive-beolvasás engedélyezése'
  }
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
  for (const book of books) {
    const row = document.createElement('article'); row.className = 'ebook-library__book'
    const sendAction = book.isAppAuthorized === false ? '' : `<button class="btn btn--primary btn--sm" type="button" data-send="${book.id}">Küldés</button>`
    const accessLabel = book.isAppAuthorized === false ? ' · Drive, csak olvasás' : ''
    row.innerHTML = `<div class="ebook-library__book-icon" aria-hidden="true">E</div><div class="ebook-library__book-main"><strong>${escapeHtml(book.name)}</strong><span>${ext(book.name).toUpperCase()} · ${formatSize(Number(book.size))}${accessLabel}</span></div><div class="ebook-library__book-actions"><button class="btn btn--ghost btn--sm" type="button" data-download="${book.id}">Letöltés</button>${sendAction}</div>`
    list.append(row)
  }
  list.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', () => downloadBook(b.dataset.download)))
  list.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => sendBook(b.dataset.send)))
}
async function connectDrive() {
  try {
    await connectGrapesDrive()
    const connect = $('#ebook-drive-connect')
    if (connect) { connect.textContent = 'Google Drive csatlakoztatva'; connect.disabled = true }
    setStatus('A közös Grapes Drive kapcsolat aktív.', 'success')
    await refreshLibrary()
  } catch (error) {
    setStatus(`Google bejelentkezési hiba: ${error.message}`, 'error')
  }
}
async function disconnectDrive() {
  await disconnectGrapesDrive()
  renderBooks([])
  setStatus('A Google Drive kapcsolat leválasztva. A Drive-on lévő fájlok nem változtak.', 'success')
}
async function enableFullDriveRead() {
  try {
    setStatus('A teljes Drive olvasási engedélyének kérése…')
    await connectGrapesDrive({ fullRead: true })
    renderDriveConnection()
    await refreshLibrary()
  } catch (error) {
    setStatus(`Az automatikus beolvasás nem indult el. ${error.message}`, 'error')
  }
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
async function listLibraryTree(rootFolderId) {
  const books = []
  const pending = [rootFolderId]
  const visited = new Set()
  while (pending.length) {
    const folderId = pending.shift()
    if (!folderId || visited.has(folderId)) continue
    visited.add(folderId)
    const query = `'${folderId}' in parents and trashed = false`
    let pageToken = ''
    do {
      const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,modifiedTime,mimeType,parents,isAppAuthorized)&orderBy=modifiedTime desc&pageSize=100&pageToken=${encodeURIComponent(pageToken)}`)
      const data = await response.json()
      for (const file of data.files || []) {
        if (file.mimeType === 'application/vnd.google-apps.folder') pending.push(file.id)
        else if (isBookFile(file)) books.push(file)
      }
      pageToken = data.nextPageToken || ''
    } while (pageToken)
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
  $('#ebook-reader-pair-code').hidden = true
  try {
    setStatus('Az e-olvasó könyvtár előkészítése…')
    const { folderId, books } = await getReaderLibraryBooks()
    for (let index = 0; index < books.length; index++) {
      setStatus(`E-olvasó megosztás: ${index + 1}/${books.length} könyv…`)
      if (books[index].isAppAuthorized !== false) await ensurePublicRead(books[index].id)
    }
    setReaderLibraryEnabled(true)

    const marker = await createReaderMarker(folderId)
    const brokerUrl = buildBrokerUrl({
      action: 'create-reader-pairing',
      markerId: marker.markerId,
      nonce: marker.nonce,
      returnUrl: READER_PAGE_URL,
    })

    showPairingFrame('#ebook-reader-pair-code', brokerUrl)
    setStatus(`${books.length} könyv előkészítve. A párosítási kód alább jelenik meg.`, 'success')
  } catch (error) {
    setStatus(`Az e-olvasó párosítása nem sikerült. ${error.message}`, 'error')
  } finally { button.disabled = false }
}
async function refreshLibrary() {
  if(!accessTokenAvailable()) return
  try {
    setStatus('Drive-könyvek beolvasása…')
    const folderIds = await findLibraryFolderIds()
    if (!folderIds.length) folderIds.push(await ensureLibraryFolder())
    const foundBooks = (await Promise.all(folderIds.map(listLibraryTree))).flat()
    if (grapesDriveHasFullReadAccess()) foundBooks.push(...await listAllDriveBooks())
    const books = [...new Map(foundBooks.map((file) => [file.id, file])).values()]
    renderBooks(books)
    setStatus(grapesDriveHasFullReadAccess()
      ? `${books.length} könyv a teljes Google Drive-ban. Az új könyvek a Frissítés gombbal megjelennek.`
      : `${books.length} könyv látható. A teljes Drive kereséséhez használd az „Automatikus Drive-beolvasás engedélyezése” gombot.`, 'success')
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
function showEbookHub() {
  const hub = $('#ebook-hub-view')
  const manager = $('#ebook-manager-view')
  if (hub) hub.hidden = false
  if (manager) manager.hidden = true
}
function showEbookManager() {
  const hub = $('#ebook-hub-view')
  const manager = $('#ebook-manager-view')
  if (hub) hub.hidden = true
  if (manager) manager.hidden = false
  if (accessTokenAvailable()) refreshLibrary()
}
export function initEbookLibrary() {
  const params = new URLSearchParams(window.location.search)
  const directReceiver = params.has('ebook-pair') || params.has('ebook-reader')
  if (initialized) {
    if (directReceiver) showEbookManager()
    else showEbookHub()
    handleTransferLink()
    return
  }
  initialized=true
  onGrapesDriveChange(renderDriveConnection)
  $('#ebook-open-manager')?.addEventListener('click', showEbookManager)
  $('#ebook-manager-back')?.addEventListener('click', showEbookHub)
  $('#ebook-reader-pair-btn')?.addEventListener('click', createReaderPairing)
  $('#ebook-drive-connect')?.addEventListener('click',connectDrive)
  $('#ebook-drive-disconnect')?.addEventListener('click',disconnectDrive)
  $('#ebook-drive-full-read')?.addEventListener('click',enableFullDriveRead)
  $('#ebook-file-input')?.addEventListener('change',(e)=>{const file=e.target.files?.[0];if(file)uploadBook(file);e.target.value=''})
  $('#ebook-upload-btn')?.addEventListener('click',()=>$('#ebook-file-input')?.click())
  $('#ebook-refresh-btn')?.addEventListener('click',refreshLibrary)
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
  const sharedConnected = accessTokenAvailable()
  renderDriveConnection()
  setStatus(sharedConnected ? 'A közös Grapes Drive kapcsolat aktív.' : (CLIENT_ID ? 'A Google Drive-ot a főmenüben vagy itt csatlakoztathatod.' : 'Drive nincs konfigurálva. Állítsd be a VITE_GOOGLE_CLIENT_ID értéket.'), sharedConnected ? 'success' : (CLIENT_ID ? '' : 'error'))
  if (sharedConnected) refreshLibrary()
  if (directReceiver) showEbookManager()
  else showEbookHub()
  handleTransferLink()
}
