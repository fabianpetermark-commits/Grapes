import { grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const FOLDER_NAME = 'Grapes E-book Library'
const METADATA_NAME = '.grapes-ebook-metadata.json'

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

export async function listMobileEbooks() {
  if (!isGrapesDriveConnected()) return []
  const folders = await findFolders()
  if (!folders.length) return []
  const groups = await Promise.all(folders.map(async folder => ({ books: await libraryTree(folder.id), metadata: await metadataFor(folder.id) })))
  const metadata = Object.assign({}, ...groups.map(group => group.metadata))
  const unique = new Map(groups.flatMap(group => group.books).map(book => [book.id, book]))
  return [...unique.values()].sort((a, b) => addedAt(b) - addedAt(a)).map(book => ({
    ...book,
    title: String(metadata[book.id]?.title || book.name.replace(/\.[^.]+$/, '')).trim(),
    author: String(metadata[book.id]?.author || '').trim(),
  }))
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
