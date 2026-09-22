import QRCode from 'qrcode'
import './styles/screens/ebook-library.css'
import { connectGrapesDrive, getGrapesDriveAccessToken, grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || CLIENT_ID.split('-')[0] || ''
const FOLDER_NAME = 'Grapes E-book Library'
const READER_PAGE_URL = new URL('ebook-reader.html', window.location.href).toString()
const READER_SHARING_KEY = 'grapes-reader-library-enabled'
const ALLOWED = ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'txt', 'cbz', 'cbr']

let initialized = false
let pickerPromise = null
const $ = (selector) => document.querySelector(selector)
const ext = (name = '') => name.split('.').pop().toLowerCase()
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
function closeTransfer() { const panel = $('#ebook-transfer-panel'); if (panel) panel.hidden = true }
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
    row.innerHTML = `<div class="ebook-library__book-icon" aria-hidden="true">E</div><div class="ebook-library__book-main"><strong>${escapeHtml(book.name)}</strong><span>${ext(book.name).toUpperCase()} · ${formatSize(Number(book.size))}</span></div><div class="ebook-library__book-actions"><button class="btn btn--ghost btn--sm" type="button" data-download="${book.id}">Letöltés</button><button class="btn btn--primary btn--sm" type="button" data-send="${book.id}">Küldés</button></div>`
    list.append(row)
  }
  list.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', () => downloadBook(b.dataset.download)))
  list.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => sendBook(b.dataset.send)))
}
async function loadGooglePicker() {
  if (window.google?.picker) return
  if (!GOOGLE_API_KEY || !GOOGLE_APP_ID) throw new Error('A Google Picker nincs konfigurálva.')
  if (pickerPromise) return pickerPromise

  pickerPromise = new Promise((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi?.load) return reject(new Error('A Google API kliens nem érhető el.'))
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('A Google Picker betöltése nem sikerült.')),
        timeout: 10000,
        ontimeout: () => reject(new Error('A Google Picker betöltése túllépte az időkorlátot.')),
      })
    }

    if (window.gapi?.load) return loadPicker()
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.onload = loadPicker
    script.onerror = () => reject(new Error('A Google API kliens betöltése nem sikerült.'))
    document.head.append(script)
  })

  try { return await pickerPromise } catch (error) { pickerPromise = null; throw error }
}

async function importDriveBook(fileId) {
  const folderId = await ensureLibraryFolder()
  const response = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,parents`)
  const file = await response.json()

  if (!ALLOWED.includes(ext(file.name))) {
    throw new Error('Ez a fájltípus jelenleg nem támogatott.')
  }

  let libraryFileId = file.id
  if (!file.parents?.includes(folderId)) {
    const copiedResponse = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/copy?fields=id,name,size,parents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, parents: [folderId] }),
    })
    libraryFileId = (await copiedResponse.json()).id
  }

  if (readerLibraryEnabled()) await ensurePublicRead(libraryFileId)
  if (await refreshLibrary()) setStatus(`${file.name} hozzáadva a Grapes könyvtárhoz.`, 'success')
}

async function openDrivePicker() {
  if (!accessTokenAvailable()) return setStatus('Előbb csatlakoztasd a Google Drive-ot.', 'error')
  if (!GOOGLE_API_KEY) return setStatus('A Google Picker API-kulcs még nincs beállítva.', 'error')

  try {
    await loadGooglePicker()
    const picker = window.google.picker
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)

    new picker.PickerBuilder()
      .setOAuthToken(getGrapesDriveAccessToken())
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .setOrigin(window.location.origin)
      .addView(view)
      .setCallback(async (data) => {
        if (data[picker.Response.ACTION] === picker.Action.ERROR) {
          return setStatus('Google Picker hiba. Ellenőrizd az API-kulcsot, a projektazonosítót és az engedélyezett webhelyeket.', 'error')
        }
        if (data[picker.Response.ACTION] !== picker.Action.PICKED) return
        const file = data[picker.Response.DOCUMENTS]?.[0]
        const fileId = file?.[picker.Document.ID]
        if (!fileId) return

        setStatus('A kiválasztott könyv hozzáadása…')
        try {
          await importDriveBook(fileId)
        } catch (error) {
          setStatus(error.message || 'A Drive-ból választott könyv hozzáadása nem sikerült.', 'error')
        }
      })
      .build()
      .setVisible(true)
  } catch (error) {
    setStatus(error.message || 'A Google Picker megnyitása nem sikerült.', 'error')
  }
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
const driveRequest = grapesDriveRequest
function accessTokenAvailable() { return isGrapesDriveConnected() }
async function ensureLibraryFolder() {
  const query=`name = 'Grapes E-book Library' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const response=await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`)
  const data=await response.json(); if(data.files?.[0]) return data.files[0].id
  const created=await driveRequest('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})})
  return (await created.json()).id
}
async function getReaderLibraryBooks() {
  const folderId = await ensureLibraryFolder()
  const query = `'${folderId}' in parents and trashed = false`
  const books = []
  let pageToken = ''
  do {
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=100&pageToken=${encodeURIComponent(pageToken)}`)
    const data = await response.json()
    books.push(...(data.files || []).filter((file) => ALLOWED.includes(ext(file.name))))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return { folderId, books }
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
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({
      name: `.grapes-reader-pairing-${Date.now()}.json`,
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

  let popup = null
  try {
    popup = window.open('about:blank', 'grapes-reader-pairing')
    if (popup) popup.opener = null
  } catch {}

  try {
    setStatus('Az e-olvasó könyvtár előkészítése…')
    const { folderId, books } = await getReaderLibraryBooks()
    for (let index = 0; index < books.length; index++) {
      setStatus(`E-olvasó megosztás: ${index + 1}/${books.length} könyv…`)
      await ensurePublicRead(books[index].id)
    }
    setReaderLibraryEnabled(true)

    const marker = await createReaderMarker(folderId)
    const brokerUrl = buildBrokerUrl({
      action: 'create-reader-pairing',
      markerId: marker.markerId,
      nonce: marker.nonce,
      returnUrl: READER_PAGE_URL,
    })

    const fallback = $('#ebook-reader-pair-fallback')
    if (fallback) {
      fallback.href = brokerUrl
      fallback.hidden = false
    }

    if (popup && !popup.closed) popup.location.href = brokerUrl
    setStatus(`${books.length} könyv előkészítve. A párosítási kód külön oldalon nyílik meg.`, 'success')
  } catch (error) {
    if (popup && !popup.closed) popup.close()
    setStatus(`Az e-olvasó párosítása nem sikerült. ${error.message}`, 'error')
  }
}
async function refreshLibrary() {
  if(!accessTokenAvailable()) return
  try {
    const folderId=await ensureLibraryFolder(); const query=`'${folderId}' in parents and trashed = false`
    const books = []
    let pageToken = ''
    do {
      const response=await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=100&pageToken=${encodeURIComponent(pageToken)}`)
      const data=await response.json()
      books.push(...(data.files||[]).filter((f)=>ALLOWED.includes(ext(f.name))))
      pageToken = data.nextPageToken || ''
    } while (pageToken)
    renderBooks(books); setStatus(`${books.length} könyv a könyvtárban.`,'success')
    return true
  } catch (error) { setStatus(`A könyvtár betöltése nem sikerült. ${error.message}`,'error'); return false }
}
async function uploadBook(file) {
  if(!accessTokenAvailable()) return setStatus('Előbb csatlakoztasd a Google Drive-ot.','error')
  if(!ALLOWED.includes(ext(file.name))) return setStatus('Ez a fájltípus jelenleg nem támogatott.','error')
  try {
    const folderId=await ensureLibraryFolder(); const boundary=`grapes-ebook-${crypto.randomUUID()}`
    const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify({name:file.name,parents:[folderId]}),`\r\n--${boundary}\r\nContent-Type: ${file.type||'application/octet-stream'}\r\n\r\n`,file,`\r\n--${boundary}--\r\n`])
    const uploadResponse = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})
    const created = await uploadResponse.json()
    if (readerLibraryEnabled() && created.id) await ensurePublicRead(created.id)
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
    $('#ebook-transfer-pair').href = brokerUrl
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
  $('#ebook-open-manager')?.addEventListener('click', showEbookManager)
  $('#ebook-manager-back')?.addEventListener('click', showEbookHub)
  $('#ebook-reader-pair-btn')?.addEventListener('click', createReaderPairing)
  $('#ebook-drive-connect')?.addEventListener('click',connectDrive)
  $('#ebook-file-input')?.addEventListener('change',(e)=>{const file=e.target.files?.[0];if(file)uploadBook(file);e.target.value=''})
  $('#ebook-upload-btn')?.addEventListener('click',()=>$('#ebook-file-input')?.click())
  $('#ebook-drive-picker-btn')?.addEventListener('click', openDrivePicker)
  $('#ebook-refresh-btn')?.addEventListener('click',refreshLibrary)
  $('#ebook-transfer-close')?.addEventListener('click', closeTransfer)
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
  const connectButton = $('#ebook-drive-connect')
  if (connectButton && sharedConnected) {
    connectButton.textContent = 'Google Drive csatlakoztatva'
    connectButton.disabled = true
  }
  setStatus(sharedConnected ? 'A közös Grapes Drive kapcsolat aktív.' : (CLIENT_ID ? 'A Google Drive-ot a főmenüben vagy itt csatlakoztathatod.' : 'Drive nincs konfigurálva. Állítsd be a VITE_GOOGLE_CLIENT_ID értéket.'), sharedConnected ? 'success' : (CLIENT_ID ? '' : 'error'))
  if (sharedConnected) refreshLibrary()
  if (directReceiver) showEbookManager()
  else showEbookHub()
  handleTransferLink()
}
