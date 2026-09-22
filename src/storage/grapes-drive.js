// Shared Grapes Drive / Project Storage foundation.
// Keeps module project data private: only files created/opened by Grapes are
// accessible through the browser's drive.file OAuth scope.

export const GRAPES_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GRAPES_ROOT_FOLDER = 'Grapes'
export const GRAPES_PROJECTS_FOLDER = 'Projects'
export const GRAPES_PROJECT_MIME = 'application/json'
export const GRAPES_PROJECT_VERSION = 1

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
let accessToken = null
let tokenClient = null
const folderCache = new Map()

async function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = () => reject(new Error('A Google Identity betöltése nem sikerült.'))
    document.head.append(script)
  })
}

export function isGrapesDriveConnected() {
  return Boolean(accessToken)
}

export async function connectGrapesDrive() {
  if (!CLIENT_ID) throw new Error('A Google Drive kliensazonosító nincs konfigurálva.')
  await loadGoogleIdentity()
  return new Promise((resolve, reject) => {
    tokenClient ||= window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: GRAPES_DRIVE_SCOPE,
      error_callback: (error) => reject(new Error(error?.type || 'Google Drive bejelentkezési hiba.')),
      callback: (response) => {
        if (response.error) return reject(new Error(response.error_description || response.error))
        accessToken = response.access_token
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

async function driveRequest(url, options = {}) {
  if (!accessToken) throw new Error('A Google Drive nincs csatlakoztatva.')
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  })
  if (response.status === 401) {
    accessToken = null
    throw new Error('A Google Drive kapcsolat lejárt. Csatlakoztasd újra.')
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error?.message || `Drive hiba: ${response.status}`)
  }
  return response
}

async function findOrCreateFolder(name, parentId = null) {
  const cacheKey = `${parentId || 'root'}:${name}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)
  const clauses = [
    `name = '${name.replaceAll("'", "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ]
  if (parentId) clauses.push(`'${parentId}' in parents`)
  const fields = encodeURIComponent('files(id,name)')
  const q = encodeURIComponent(clauses.join(' and '))
  const found = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1`)).json()
  if (found.files?.[0]) {
    folderCache.set(cacheKey, found.files[0].id)
    return found.files[0].id
  }
  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) metadata.parents = [parentId]
  const created = await (await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })).json()
  folderCache.set(cacheKey, created.id)
  return created.id
}

export async function ensureGrapesModuleFolder(moduleName) {
  const root = await findOrCreateFolder(GRAPES_ROOT_FOLDER)
  const projects = await findOrCreateFolder(GRAPES_PROJECTS_FOLDER, root)
  return findOrCreateFolder(moduleName, projects)
}

export async function saveGrapesProject({ module, name, data, fileId = null }) {
  if (!module || !name) throw new Error('A projekt modulja és neve kötelező.')
  const payload = JSON.stringify({
    grapesProject: true,
    version: GRAPES_PROJECT_VERSION,
    module,
    name,
    updatedAt: new Date().toISOString(),
    data,
  })
  if (fileId) {
    await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': GRAPES_PROJECT_MIME },
      body: payload,
    })
    return fileId
  }
  const parentId = await ensureGrapesModuleFolder(module)
  const boundary = `grapes-project-${crypto.randomUUID()}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name: `${name}.grapes.json`, parents: [parentId], mimeType: GRAPES_PROJECT_MIME }),
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    payload,
    `\r\n--${boundary}--\r\n`,
  ])
  const created = await (await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })).json()
  return created.id
}

export async function listGrapesProjects(module) {
  const parentId = await ensureGrapesModuleFolder(module)
  const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`)
  const data = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc&pageSize=100`)).json()
  return data.files || []
}

export async function loadGrapesProject(fileId) {
  const response = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  return response.json()
}

export function createDebouncedDriveSave(saveFn, delay = 4000) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => saveFn(...args).catch(console.error), delay)
  }
}
