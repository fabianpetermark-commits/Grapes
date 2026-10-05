import { grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const FOLDER_NAME = 'Grapes E-book Library'
const DB_NAME = 'grapes-ebook-reader-sync'
let readerRoot = null
let driveBooks = []
let readerBooks = []
let initialized = false

const $ = selector => document.querySelector(selector)
const status = (message, kind = '') => { const node = $('#ebook-sync-status'); if (node) { node.textContent = message; node.dataset.kind = kind } }
const supports = () => typeof window.showDirectoryPicker === 'function' && typeof window.indexedDB !== 'undefined'
const candidate = name => Boolean(String(name || '').trim()) && !String(name).startsWith('.') && !/^(desktop\.ini|thumbs\.db)$/i.test(name)
const normalize = name => String(name || '').normalize('NFKC').trim().toLocaleLowerCase('hu-HU')
const updateConnection = () => {
  const node = $('#ebook-reader-state')
  if (node) node.textContent = readerRoot ? `● Csatlakoztatva – /${readerRoot.name}` : '○ Nincs csatlakoztatva'
  const button = $('#ebook-reader-connect')
  if (button) button.textContent = readerRoot ? 'E-reader mappa módosítása' : 'E-reader csatlakoztatása'
}
function updateProgress(current, total, label = '') {
  const progress = $('#ebook-sync-progress')
  const text = $('#ebook-sync-progress-label')
  if (!progress || !text) return
  progress.hidden = total <= 0
  progress.max = Math.max(1, total)
  progress.value = Math.min(current, total)
  text.textContent = total > 0 ? `${Math.round(current / total * 100)}% · ${label}` : ''
}
function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore('handles'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
async function saveHandle(handle) { const db = await openDb(); await new Promise((resolve, reject) => { const request = db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'root'); request.onsuccess = resolve; request.onerror = () => reject(request.error) }); db.close() }
async function loadHandle() { const db = await openDb(); const handle = await new Promise((resolve, reject) => { const request = db.transaction('handles').objectStore('handles').get('root'); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error) }); db.close(); return handle }
async function scanDirectory(directory, prefix = '') {
  const result = []
  for await (const handle of directory.values()) {
    if (handle.name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${handle.name}` : handle.name
    if (handle.kind === 'directory') result.push(...await scanDirectory(handle, path))
    else if (candidate(handle.name)) { const file = await handle.getFile(); result.push({ name: file.name, size: file.size, path, handle, file }) }
  }
  return result
}
async function findLibraryFolder() {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const data = await (await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100`)).json()
  return data.files?.[0]?.id || null
}
async function listDriveBooks(folderId) {
  if (!folderId) return []
  const result = [], pending = [folderId], visited = new Set()
  while (pending.length) {
    const folder = pending.shift(); if (visited.has(folder)) continue; visited.add(folder)
    const query = `'${folder}' in parents and trashed = false`
    const data = await (await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,parents)&pageSize=1000`)).json()
    for (const file of data.files || []) file.mimeType === 'application/vnd.google-apps.folder' ? pending.push(file.id) : candidate(file.name) && result.push(file)
  }
  return result
}
function renderInventory() {
  const host = $('#ebook-sync-list'); if (!host) return
  const groups = new Map()
  for (const book of driveBooks) groups.set(normalize(book.name), { name: book.name, drive: book, reader: null })
  for (const book of readerBooks) { const group = groups.get(normalize(book.name)) || { name: book.name, drive: null, reader: null }; group.reader = book; groups.set(normalize(book.name), group) }
  const entries = [...groups.values()].map(group => ({ ...group, state: group.drive && group.reader ? (Number(group.drive.size) === Number(group.reader.size) ? 'Szinkronban' : 'Eltérő méret') : group.drive ? 'Csak Drive-on' : 'Csak e-readeren' }))
  host.replaceChildren(...entries.map(item => { const row = document.createElement('li'); row.textContent = `${item.name} · ${item.state}`; return row }))
  const counts = entries.reduce((acc, item) => { acc[item.state] = (acc[item.state] || 0) + 1; return acc }, {})
  const summary = Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Nincs könyv'
  status(summary)
}
async function refreshInventory() {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot a főmenüben.')
  const folder = await findLibraryFolder()
  driveBooks = await listDriveBooks(folder)
  readerBooks = readerRoot ? await scanDirectory(readerRoot) : []
  renderInventory()
}
async function connectReader() {
  if (!supports()) { status('Ez a böngésző nem támogatja az USB-s mappahozzáférést.', 'error'); return }
  try { const handle = await showDirectoryPicker({ id: 'grapes-ebook-reader', mode: 'readwrite', startIn: 'documents' }); if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Az írási engedély nem lett megadva.'); readerRoot = handle; await saveHandle(handle); updateConnection(); await refreshInventory() }
  catch (error) { if (error?.name !== 'AbortError') status(`Az e-reader csatlakoztatása nem sikerült. ${error.message}`, 'error') }
}
async function writeToReader(book) {
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(book.id)}?alt=media`)
  const handle = await readerRoot.getFileHandle(book.name, { create: true }); const writable = await handle.createWritable(); await writable.write(await response.blob()); await writable.close()
}
async function uploadFromReader(book, folderId) {
  const boundary = `grapes-reader-sync-${crypto.randomUUID()}`
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({ name: book.name, parents: [folderId] }), `\r\n--${boundary}\r\nContent-Type: ${book.file.type || 'application/octet-stream'}\r\n\r\n`, book.file, `\r\n--${boundary}--\r\n`])
  await grapesDriveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
}
async function synchronize() {
  if (!readerRoot) return status('Előbb csatlakoztasd az USB-kábellel az e-readert.', 'error')
  try {
    await refreshInventory(); const folderId = await findLibraryFolder(); let toReader = 0, toDrive = 0
    const readerNames = new Set(readerBooks.map(book => normalize(book.name)))
    const driveNames = new Set(driveBooks.map(book => normalize(book.name)))
    const readerQueue = driveBooks.filter(book => !readerNames.has(normalize(book.name)))
    const driveQueue = readerBooks.filter(book => !driveNames.has(normalize(book.name)))
    const total = readerQueue.length + driveQueue.length
    updateProgress(0, total, total ? 'Előkészítés…' : 'Minden könyv szinkronban van')
    let completed = 0
    for (const book of readerQueue) { updateProgress(completed, total, `${book.name} → e-reader`); await writeToReader(book); toReader++; updateProgress(++completed, total, `${book.name} kész`) }
    for (const book of driveQueue) { updateProgress(completed, total, `${book.name} → Drive`); await uploadFromReader(book, folderId); toDrive++; updateProgress(++completed, total, `${book.name} kész`) }
    await refreshInventory(); status(`Szinkronizálás kész: ${toReader} könyv az e-readerre, ${toDrive} könyv a Drive-ra.`, 'success')
    updateProgress(total, total, 'Kész')
  } catch (error) { status(`A szinkronizálás nem sikerült. ${error.message}`, 'error') }
}
export function initReaderSync() {
  if (initialized) return
  initialized = true
  $('#ebook-reader-connect')?.addEventListener('click', connectReader)
  $('#ebook-sync')?.addEventListener('click', synchronize)
  if (!supports()) { const note = $('#ebook-reader-support'); if (note) note.hidden = false }
  loadHandle().then(async handle => { if (handle && await handle.queryPermission({ mode: 'readwrite' }) === 'granted') { readerRoot = handle; updateConnection() } }).catch(() => {})
  updateConnection()
}
