import QRCode from 'qrcode'
import './styles/screens/ebook-library.css'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'Grapes E-book Library'
const ALLOWED = ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'txt', 'cbz', 'cbr']

let accessToken = null
let initialized = false
const $ = (selector) => document.querySelector(selector)
const ext = (name = '') => name.split('.').pop().toLowerCase()
const formatSize = (bytes) => !Number.isFinite(bytes) ? '—' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function setStatus(message, kind = '') { const node = $('#ebook-status'); if (node) { node.textContent = message; node.dataset.kind = kind } }
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
async function createPublicTransfer(fileId, name) {
  if (!TRANSFER_BROKER_URL) throw new Error('Az E-book Transfer broker nincs konfigurálva.')
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
    })
  } catch (error) {
    if (!String(error.message).toLowerCase().includes('already')) throw error
  }
  const returnUrl = new URL(window.location.href)
  returnUrl.search = ''
  returnUrl.hash = ''
  const brokerUrl = buildBrokerUrl({ action: 'create', fileId, returnUrl: returnUrl.toString() })
  window.open(brokerUrl, '_blank', 'noopener,noreferrer')
  $('#ebook-transfer-name').textContent = name
  $('#ebook-transfer-url').value = brokerUrl
  $('#ebook-transfer-panel').hidden = false
  setStatus('Az átvitel előkészítése megnyílt új lapon. Ott jelenik meg a 6 karakteres kód és a QR-kód.', 'success')
}
function closeTransfer() { const panel = $('#ebook-transfer-panel'); if (panel) panel.hidden = true }
function handleTransferLink() {
  const params = new URLSearchParams(window.location.search)
  const code = (params.get('ebook-pair') || '').trim().toUpperCase()
  if (!code || !/^[A-Z0-9]{6}$/.test(code)) return
  const panel = $('#ebook-receiver-panel'); if (!panel) return
  $('#ebook-receiver-code').textContent = code
  const downloadUrl = buildBrokerUrl({ action: 'download', code })
  $('#ebook-receiver-download').href = downloadUrl || '#'
  $('#ebook-receiver-open').href = downloadUrl || '#'
  panel.hidden = false
  if (downloadUrl) setStatus('A párosítási kód érvényes. Az e-book letöltése indítható.', 'success')
  else setStatus('A Transfer broker nincs konfigurálva ezen a builden.', 'error')
}
async function renderTransferQr(fileId, name) {
  if (!accessToken) return setStatus('Előbb csatlakoztasd a Google Drive-ot.', 'error')
  try { await createPublicTransfer(fileId, name) } catch { setStatus('Az e-olvasó megosztási linkjének létrehozása nem sikerült. Ellenőrizd a Drive-hozzáférést.', 'error') }
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
async function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return
  await new Promise((resolve, reject) => { const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true; s.defer=true; s.onload=resolve; s.onerror=reject; document.head.append(s) })
}
async function connectDrive() {
  if (!CLIENT_ID) return setStatus('A Google Drive használatához VITE_GOOGLE_CLIENT_ID szükséges.', 'error')
  try {
    await loadGoogleIdentity()
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) return setStatus('A Google Drive engedélyezése nem sikerült.', 'error')
        accessToken=response.access_token; $('#ebook-drive-connect').textContent='Google Drive csatlakoztatva'; $('#ebook-drive-connect').disabled=true
        setStatus('Google Drive csatlakoztatva.', 'success'); await refreshLibrary()
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  } catch (error) { setStatus(`Google bejelentkezési hiba: ${error.message}`, 'error') }
}
async function driveRequest(url, options = {}) {
  const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${accessToken}`}})
  if (!response.ok) throw new Error(await response.text())
  return response
}
async function ensureLibraryFolder() {
  const query=`name = 'Grapes E-book Library' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const response=await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`)
  const data=await response.json(); if(data.files?.[0]) return data.files[0].id
  const created=await driveRequest('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})})
  return (await created.json()).id
}
async function refreshLibrary() {
  if(!accessToken) return
  try {
    const folderId=await ensureLibraryFolder(); const query=`'${folderId}' in parents and trashed = false`
    const response=await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`)
    const data=await response.json(); const books=(data.files||[]).filter((f)=>ALLOWED.includes(ext(f.name)))
    renderBooks(books); setStatus(`${books.length} könyv a könyvtárban.`,'success')
  } catch { setStatus('A könyvtár betöltése nem sikerült. Ellenőrizd a Drive-hozzáférést.','error') }
}
async function uploadBook(file) {
  if(!accessToken) return setStatus('Előbb csatlakoztasd a Google Drive-ot.','error')
  if(!ALLOWED.includes(ext(file.name))) return setStatus('Ez a fájltípus jelenleg nem támogatott.','error')
  try {
    const folderId=await ensureLibraryFolder(); const boundary='grapes-ebook-boundary'
    const body=new Blob([`--${boundary}\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n`,JSON.stringify({name:file.name,parents:[folderId]}),`\\r\\n--${boundary}\\r\\nContent-Type: ${file.type||'application/octet-stream'}\\r\\n\\r\\n`,file,`\\r\\n--${boundary}--`])
    await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})
    setStatus(`${file.name} hozzáadva a könyvtárhoz.`,'success'); await refreshLibrary()
  } catch { setStatus('A feltöltés nem sikerült.','error') }
}
async function downloadBook(fileId) {
  try { const meta=await(await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`)).json(); const blob=await(await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=meta.name; a.click(); URL.revokeObjectURL(url) } catch { setStatus('A letöltés nem sikerült.','error') }
}
async function sendBook(fileId) {
  if (!accessToken) return setStatus('Előbb csatlakoztasd a Google Drive-ot.', 'error')
  const transferWindow = window.open('about:blank', '_blank')
  try {
    const meta = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`)).json()
    if (transferWindow) transferWindow.location.href = buildBrokerUrl({ action: 'create', fileId, returnUrl: new URL(window.location.href).toString().split('?')[0] })
    else await renderTransferQr(fileId, meta.name)
  } catch {
    if (transferWindow) transferWindow.close()
    setStatus('Az átvitel előkészítése nem sikerült.', 'error')
  }
}
export function initEbookLibrary() {
  if(initialized) return refreshLibrary(); initialized=true
  $('#ebook-drive-connect')?.addEventListener('click',connectDrive)
  $('#ebook-file-input')?.addEventListener('change',(e)=>{const file=e.target.files?.[0];if(file)uploadBook(file);e.target.value=''})
  $('#ebook-upload-btn')?.addEventListener('click',()=>$('#ebook-file-input')?.click())
  $('#ebook-refresh-btn')?.addEventListener('click',refreshLibrary)
  $('#ebook-transfer-close')?.addEventListener('click', closeTransfer)
  $('#ebook-transfer-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#ebook-transfer-url').value); setStatus('Átviteli link kimásolva.', 'success') } catch { setStatus('A link másolása nem sikerült.', 'error') } })
  $('#ebook-receiver-submit')?.addEventListener('click', () => {
    const code = $('#ebook-receiver-input')?.value.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code || '')) return setStatus('Adj meg egy 6 karakteres párosítási kódot.', 'error')
    const url = buildBrokerUrl({ action: 'download', code })
    if (!url) return setStatus('A Transfer broker nincs konfigurálva.', 'error')
    window.location.href = url
  })
  $('#ebook-receiver-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#ebook-receiver-submit')?.click() })
  handleTransferLink()
  setStatus(CLIENT_ID?'Csatlakoztasd a saját Google Drive-odat.':'Drive nincs konfigurálva. Állítsd be a VITE_GOOGLE_CLIENT_ID értéket.',CLIENT_ID?'':'error')
}
