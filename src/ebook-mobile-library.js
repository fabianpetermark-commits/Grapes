import { grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const FOLDER_NAME = import.meta.env.VITE_GRAPES_TEST_CHANNEL === '1' ? 'Grapes TEST E-book Library' : 'Grapes E-book Library'
const METADATA_NAME = '.grapes-ebook-metadata.json'
const PROGRESS_NAME = '.grapes-ebook-reading-progress.json'
const LOCAL_PROGRESS_KEY = 'grapes-ebook-reading-progress-v1'

const isBook = file => Boolean(file?.id && file?.name)
  && !file.name.startsWith('.')
  && file.mimeType !== 'application/vnd.google-apps.folder'
  && !String(file.mimeType || '').startsWith('application/vnd.google-apps.')

const addedAt = book => Math.max(Date.parse(book.createdTime || '') || 0, Date.parse(book.modifiedTime || '') || 0)

async function findFolders() {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=100`)
  return (await response.json()).files || []
}

async function createFolder() {
  const response = await grapesDriveRequest('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return (await response.json()).id
}

async function folderChildren(folderId) {
  const files = []
  let pageToken = ''
  do {
    const query = `'${folderId}' in parents and trashed = false`
    const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,size,createdTime,modifiedTime,mimeType,isAppAuthorized)&orderBy=modifiedTime%20desc&pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`)
    const data = await response.json()
    files.push(...(data.files || []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return files
}

async function libraryTree(folderId) {
  const books = []
  const visited = new Set()
  let pending = [folderId]
  while (pending.length) {
    const id = pending.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    for (const file of await folderChildren(id)) {
      if (file.mimeType === 'application/vnd.google-apps.folder') pending.push(file.id)
      else if (isBook(file)) books.push(file)
    }
  }
  return books
}

async function metadataFor(folderId) {
  const query = `'${folderId}' in parents and name = '${METADATA_NAME}' and trashed = false`
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`)
  const file = (await response.json()).files?.[0]
  if (!file) return {}
  try {
    const payload = await (await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`)).json()
    return payload?.books && typeof payload.books === 'object' ? payload.books : payload || {}
  } catch { return {} }
}

async function progressFileFor(folderId) {
  const query = `'${folderId}' in parents and name = '${PROGRESS_NAME}' and trashed = false`
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`)
  return (await response.json()).files?.[0] || null
}

function normalizeProgress(payload) {
  const books = payload?.books && typeof payload.books === 'object' ? payload.books : {}
  return Object.fromEntries(Object.entries(books).flatMap(([id, value]) => {
    if (!id || !value || typeof value !== 'object') return []
    return [[id, {
      chapterId: String(value.chapterId || ''),
      chapterIndex: Math.max(0, Number(value.chapterIndex) || 0),
      chapterProgress: Math.min(1, Math.max(0, Number(value.chapterProgress) || 0)),
      overallPercent: Math.min(100, Math.max(0, Number(value.overallPercent) || 0)),
      bookModifiedTime: String(value.bookModifiedTime || ''),
      updatedAt: String(value.updatedAt || ''),
    }]]
  }))
}

async function progressFor(folderId) {
  const file = await progressFileFor(folderId)
  if (!file) return { fileId: '', books: {} }
  try {
    const payload = await (await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`)).json()
    return { fileId: file.id, books: normalizeProgress(payload) }
  } catch { return { fileId: file.id, books: {} } }
}

function localProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}')) } catch { return {} }
}

function saveLocalProgress(books) {
  try { localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ version: 1, books })) } catch {}
}

function mergeProgress(...groups) {
  const merged = {}
  for (const group of groups) {
    for (const [bookId, entry] of Object.entries(group || {})) {
      const currentTime = Date.parse(merged[bookId]?.updatedAt || '') || 0
      const incomingTime = Date.parse(entry?.updatedAt || '') || 0
      if (!merged[bookId] || incomingTime >= currentTime) merged[bookId] = entry
    }
  }
  return merged
}

export async function listMobileEbooks() {
  if (!isGrapesDriveConnected()) return []
  const folders = await findFolders()
  if (!folders.length) return []
  const groups = await Promise.all(folders.map(async folder => ({ books: await libraryTree(folder.id), metadata: await metadataFor(folder.id), progress: (await progressFor(folder.id)).books })))
  const metadata = Object.assign({}, ...groups.map(group => group.metadata))
  const progress = mergeProgress(localProgress(), ...groups.map(group => group.progress))
  const unique = new Map(groups.flatMap(group => group.books).map(book => [book.id, book]))
  return [...unique.values()].sort((a, b) => addedAt(b) - addedAt(a)).map(book => ({
    ...book,
    title: String(metadata[book.id]?.title || book.name.replace(/\.[^.]+$/, '')).trim(),
    author: String(metadata[book.id]?.author || '').trim(),
    reading: progress[book.id] || null,
  }))
}

export async function downloadMobileEbook(fileId) {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot.')
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  return response.blob()
}

export async function saveMobileReadingProgress(book, value) {
  if (!book?.id) throw new Error('Nincs kiválasztott könyv.')
  const updatedAt = new Date().toISOString()
  const entry = {
    chapterId: String(value?.chapterId || ''),
    chapterIndex: Math.max(0, Number(value?.chapterIndex) || 0),
    chapterProgress: Math.min(1, Math.max(0, Number(value?.chapterProgress) || 0)),
    overallPercent: Math.min(100, Math.max(0, Number(value?.overallPercent) || 0)),
    bookModifiedTime: String(book.modifiedTime || ''),
    updatedAt,
  }
  const cached = localProgress()
  cached[book.id] = entry
  saveLocalProgress(cached)
  if (!isGrapesDriveConnected()) return entry

  const folders = await findFolders()
  const folderId = folders[0]?.id || await createFolder()
  const current = await progressFor(folderId)
  const books = { ...current.books, [book.id]: entry }
  const payload = JSON.stringify({ version: 1, updatedAt, books })
  if (current.fileId) {
    await grapesDriveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(current.fileId)}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload,
    })
  } else {
    const boundary = `grapes-reading-${crypto.randomUUID()}`
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name: PROGRESS_NAME, parents: [folderId], mimeType: 'application/json' }),
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`, payload, `\r\n--${boundary}--\r\n`,
    ])
    await grapesDriveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    })
  }
  return entry
}

export async function uploadMobileEbook(file) {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot.')
  if (!file?.name || file.name.startsWith('.')) throw new Error('Ez a fájl nem vehető fel a könyvtárba.')
  const folders = await findFolders()
  const folderId = folders[0]?.id || await createFolder()
  const boundary = `grapes-mobile-ebook-${crypto.randomUUID()}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name: file.name, parents: [folderId] }),
    `\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    `\r\n--${boundary}--\r\n`,
  ])
  await grapesDriveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })
  return listMobileEbooks()
}
