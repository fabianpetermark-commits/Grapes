import { grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const FOLDER_NAME = 'Grapes E-book Library'
const DB_NAME = 'grapes-ebook-reader-sync'
let readerRoot = null
let driveBooks = []
let readerBooks = []
let initialized = false
let readerConnectionState = 'disconnected'
let readerVerification = null

const $ = selector => document.querySelector(selector)
const showSuccess = (visible) => { const node = $('#ebook-sync-success'); if (node) node.hidden = !visible }
const status = (message, kind = '') => { const node = $('#ebook-sync-status'); if (node) { node.textContent = message; node.dataset.kind = kind }; if (kind !== 'success') showSuccess(false) }
const supports = () => typeof window.showDirectoryPicker === 'function' && typeof window.indexedDB !== 'undefined'
const candidate = name => Boolean(String(name || '').trim()) && !String(name).startsWith('.') && !/^(desktop\.ini|thumbs\.db)$/i.test(name)
const normalize = name => String(name || '').normalize('NFKC').trim().toLocaleLowerCase('hu-HU')
function nameFingerprint(value = '') {
  const normalized = normalize(value)
  let left = 0x811c9dc5; let right = 0x9e3779b9
  for (let index = 0; index < normalized.length; index++) {
    const code = normalized.charCodeAt(index)
    left = Math.imul(left ^ code, 0x01000193)
    right = Math.imul(right ^ (code + index), 0x85ebca6b)
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`
}
const updateConnection = () => {
  const node = $('#ebook-reader-state')
  if (node) {
    const message = readerConnectionState === 'connected'
      ? `● Elérhető – /${readerRoot?.name || ''}`
      : readerConnectionState === 'checking'
        ? `◐ Ellenőrzés – /${readerRoot?.name || ''}`
        : readerRoot
          ? `○ Nem érhető el – /${readerRoot.name}`
          : '○ Nincs csatlakoztatva'
    if (node.textContent !== message) node.textContent = message
    node.dataset.kind = readerConnectionState === 'connected' ? 'success' : readerConnectionState === 'disconnected' && readerRoot ? 'error' : ''
  }
  const button = $('#ebook-reader-connect')
  if (button) button.textContent = readerConnectionState === 'connected' ? 'E-reader mappa módosítása' : 'E-reader csatlakoztatása'
  const sync = $('#ebook-sync')
  if (sync) sync.disabled = readerConnectionState !== 'connected'
}
async function verifyReaderAccess({ announce = false } = {}) {
  if (!readerRoot) { readerConnectionState = 'disconnected'; updateConnection(); return false }
  if (readerVerification) return readerVerification
  if (announce && readerConnectionState !== 'connected') { readerConnectionState = 'checking'; updateConnection() }
  readerVerification = (async () => {
    try {
      if (await readerRoot.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Nincs mappaengedély.')
      const iterator = readerRoot.values()
      await iterator.next()
      readerConnectionState = 'connected'
      updateConnection()
      return true
    } catch {
      readerConnectionState = 'disconnected'
      updateConnection()
      return false
    } finally { readerVerification = null }
  })()
  return readerVerification
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
    else if (candidate(handle.name)) { const file = await handle.getFile(); result.push({ name: file.name, size: file.size, lastModified: file.lastModified, path, handle, file }) }
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
    const data = await (await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime,md5Checksum,mimeType,parents,appProperties)&pageSize=1000`)).json()
    for (const file of data.files || []) file.mimeType === 'application/vnd.google-apps.folder' ? pending.push(file.id) : candidate(file.name) && result.push(file)
  }
  return result
}
function renderInventory() {
  const groups = new Map()
  for (const book of driveBooks) groups.set(normalize(book.name), { name: book.name, drive: book, reader: null })
  for (const book of readerBooks) { const group = groups.get(normalize(book.name)) || { name: book.name, drive: null, reader: null }; group.reader = book; groups.set(normalize(book.name), group) }
  const entries = [...groups.values()]
  for (const row of document.querySelectorAll('#ebook-list [data-book-name]')) {
    const entry = entries.find(item => normalize(item.name) === normalize(row.dataset.bookName))
    const badge = row.querySelector('[data-location-badge]')
    if (badge && entry) badge.textContent = entry.reader ? 'Drive · E-reader' : 'Drive'
  }
}
async function refreshInventory() {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot a főmenüben.')
  const folder = await findLibraryFolder()
  driveBooks = await listDriveBooks(folder)
  readerBooks = await verifyReaderAccess() ? await scanDirectory(readerRoot) : []
  renderInventory()
}
async function connectReader() {
  if (!supports()) { status('Ez a böngésző nem támogatja az USB-s mappahozzáférést.', 'error'); return }
  try { const handle = await showDirectoryPicker({ id: 'grapes-ebook-reader', mode: 'readwrite', startIn: 'documents' }); if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Az írási engedély nem lett megadva.'); readerRoot = handle; await saveHandle(handle); if (!await verifyReaderAccess({ announce: true })) throw new Error('A kiválasztott mappa jelenleg nem érhető el.'); await refreshInventory() }
  catch (error) { if (error?.name !== 'AbortError') status(`Az e-reader csatlakoztatása nem sikerült. ${error.message}`, 'error') }
}
async function writeToReader(book, existing = null) {
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(book.id)}?alt=media`)
  const handle = existing?.handle && normalize(existing.name) === normalize(book.name)
    ? existing.handle
    : await readerRoot.getFileHandle(book.name, { create: true })
  const writable = await handle.createWritable(); await writable.write(await response.blob()); await writable.close()
}
function previousNameFingerprints(book) {
  const compact = String(book.appProperties?.grapesPrev || '').split(',').filter((value) => /^[a-f0-9]{16}$/.test(value))
  try {
    const legacy = JSON.parse(book.appProperties?.grapesPreviousNames || '[]').filter((name) => typeof name === 'string').map(nameFingerprint)
    return [...new Set([...compact, ...legacy])]
  } catch { return compact }
}
function shouldCopyToReader(book, current) {
  if (!current) return true
  if (Number(book.size) !== Number(current.size)) return true
  const driveTime = new Date(book.modifiedTime || '').getTime()
  const readerTime = Number(current.lastModified)
  if (!Number.isFinite(driveTime) || !Number.isFinite(readerTime) || readerTime <= 0) return true
  return driveTime > readerTime
}
async function removeReaderBook(book) {
  const parts = String(book?.path || '').split('/').filter(Boolean)
  if (!parts.length) return
  let parent = readerRoot
  for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part)
  await parent.removeEntry(parts.at(-1))
}
async function uploadFromReader(book, folderId) {
  const boundary = `grapes-reader-sync-${crypto.randomUUID()}`
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({ name: book.name, parents: [folderId] }), `\r\n--${boundary}\r\nContent-Type: ${book.file.type || 'application/octet-stream'}\r\n\r\n`, book.file, `\r\n--${boundary}--\r\n`])
  await grapesDriveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
}
async function synchronize() {
  if (!readerRoot || !await verifyReaderAccess()) return status('Az e-reader nem érhető el. Csatlakoztasd USB-kábellel, majd válaszd ki újra a mappáját.', 'error')
  try {
    showSuccess(false)
    await refreshInventory(); const folderId = await findLibraryFolder(); let toReader = 0, toDrive = 0
    const readerByName = new Map(readerBooks.map(book => [normalize(book.name), book]))
    const readerByFingerprint = new Map(readerBooks.map(book => [nameFingerprint(book.name), book]))
    const claimedReaderPaths = new Set()
    const readerQueue = []
    const cleanupQueue = []
    for (const book of driveBooks) {
      const current = readerByName.get(normalize(book.name))
      const previous = previousNameFingerprints(book).map(fingerprint => readerByFingerprint.get(fingerprint)).filter(Boolean)
      if (current) claimedReaderPaths.add(current.path)
      previous.forEach(item => claimedReaderPaths.add(item.path))
      if (shouldCopyToReader(book, current)) readerQueue.push({ book, current, previous: current ? [] : previous })
      else cleanupQueue.push(...previous.filter(item => item.path !== current.path))
    }
    const driveQueue = readerBooks.filter(book => !claimedReaderPaths.has(book.path))
    const total = readerQueue.length + driveQueue.length + cleanupQueue.length
    updateProgress(0, total, total ? 'Előkészítés…' : 'Minden könyv szinkronban van')
    let completed = 0
    for (const item of readerQueue) { updateProgress(completed, total, `${item.book.name} → e-reader`); await writeToReader(item.book, item.current); for (const previous of item.previous) await removeReaderBook(previous); toReader++; updateProgress(++completed, total, `${item.book.name} kész`) }
    for (const book of cleanupQueue) { updateProgress(completed, total, `${book.name} régi példány törlése`); await removeReaderBook(book); updateProgress(++completed, total, 'Régi fájlnév eltávolítva') }
    for (const book of driveQueue) { updateProgress(completed, total, `${book.name} → Drive`); await uploadFromReader(book, folderId); toDrive++; updateProgress(++completed, total, `${book.name} kész`) }
    await refreshInventory(); status(`Szinkronizálás kész: ${toReader} könyv az e-readerre, ${toDrive} könyv a Drive-ra.`, 'success'); showSuccess(true)
    updateProgress(total, total, 'Kész')
  } catch (error) { status(`A szinkronizálás nem sikerült. ${error.message}`, 'error') }
}
export function initReaderSync() {
  if (initialized) return
  initialized = true
  $('#ebook-reader-connect')?.addEventListener('click', connectReader)
  $('#ebook-sync')?.addEventListener('click', synchronize)
  if (!supports()) { const note = $('#ebook-reader-support'); if (note) note.hidden = false }
  loadHandle().then(async handle => { if (handle) { readerRoot = handle; await verifyReaderAccess({ announce: true }) } }).catch(() => {})
  window.setInterval?.(() => { if (readerRoot) verifyReaderAccess({ announce: false }) }, 5000)
  updateConnection()
}
