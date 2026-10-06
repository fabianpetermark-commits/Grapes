// Shared Grapes Drive / Project Storage foundation.
// Project writes stay within files created/opened by Grapes. The optional
// read-only scope lets the e-book module discover books elsewhere in Drive.

export const GRAPES_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GRAPES_DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const LEGACY_DRIVE_WRITE_SCOPE = 'https://www.googleapis.com/auth/drive'
export const GRAPES_ROOT_FOLDER = 'Grapes'
export const GRAPES_PROJECTS_FOLDER = 'Projects'
export const GRAPES_PROJECT_MIME = 'application/json'
export const GRAPES_PROJECT_VERSION = 1

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
let accessToken = null
let expiresAt = 0
let grantedScopes = GRAPES_DRIVE_SCOPE
let connecting = null
let identityPromise = null
let expiryTimer = null
let accountProfile = null
const SESSION_KEY = 'grapes-drive-session'
const ACCOUNT_KEY = 'grapes-drive-account'
const FULL_READ_KEY = 'grapes-drive-full-read'
const listeners = new Set()
const folderCache = new Map()

function clearSession() {
  window.clearTimeout?.(expiryTimer)
  accessToken = null
  expiresAt = 0
  grantedScopes = GRAPES_DRIVE_SCOPE
  accountProfile = null
  folderCache.clear()
  try { window.sessionStorage.removeItem(SESSION_KEY) } catch {}
  for (const listener of listeners) listener(false)
}

function scheduleExpiry() {
  window.clearTimeout?.(expiryTimer)
  if (accessToken) expiryTimer = window.setTimeout?.(clearSession, Math.max(0, expiresAt - Date.now() - 30000))
}

try {
  const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY))
  if (saved?.clientId === CLIENT_ID && typeof saved.accessToken === 'string' && saved.expiresAt > Date.now() + 30000) {
    accessToken = saved.accessToken
    expiresAt = saved.expiresAt
    grantedScopes = saved.scopes || GRAPES_DRIVE_SCOPE
    accountProfile = saved.account || null
  } else { window.sessionStorage.removeItem(SESSION_KEY) }
} catch {}
scheduleExpiry()

export function onGrapesDriveChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return
  if (identityPromise) return identityPromise
  identityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = () => reject(new Error('A Google Identity betöltése nem sikerült.'))
    document.head.append(script)
  })
  try { await identityPromise } catch (error) { identityPromise = null; throw error }
}

export function isGrapesDriveConnected() {
  if (accessToken && expiresAt <= Date.now() + 30000) clearSession()
  return Boolean(accessToken)
}

export function getGrapesDriveAccessToken() {
  return isGrapesDriveConnected() ? accessToken : null
}

export function getGrapesAccount() {
  if (accountProfile) return { ...accountProfile }
  let email = ''
  try { email = window.localStorage.getItem(ACCOUNT_KEY) || '' } catch {}
  return email ? { name: email.split('@')[0], email, photo: '' } : null
}

export function getConnectedGrapesAccount() {
  return isGrapesDriveConnected() && accountProfile?.email ? { ...accountProfile } : null
}

export function grapesDriveHasFullReadAccess() {
  return isGrapesDriveConnected() && grantedScopes.split(/\s+/).some((scope) => scope === GRAPES_DRIVE_READ_SCOPE || scope === LEGACY_DRIVE_WRITE_SCOPE)
}

export async function disconnectGrapesDrive() {
  const token = accessToken
  if (token && window.google?.accounts?.oauth2?.revoke) {
    await new Promise((resolve) => window.google.accounts.oauth2.revoke(token, resolve)).catch(() => {})
  }
  clearSession()
  try { window.localStorage.removeItem(FULL_READ_KEY) } catch {}
  try { window.localStorage.removeItem('grapes-drive-full-write') } catch {}
}

export async function grapesDriveRequest(url, options = {}) {
  return driveRequest(url, options)
}

export async function connectGrapesDrive({ fullRead = false } = {}) {
  if (!CLIENT_ID) throw new Error('A Google Drive kliensazonosító nincs konfigurálva.')
  let preferredFullRead = false
  try { preferredFullRead = window.localStorage.getItem(FULL_READ_KEY) === '1' } catch {}
  const requestedFullRead = fullRead || preferredFullRead
  if (isGrapesDriveConnected() && (!requestedFullRead || grapesDriveHasFullReadAccess())) return accessToken
  await loadGoogleIdentity()
  if (connecting) {
    await connecting
    return requestedFullRead && !grapesDriveHasFullReadAccess()
      ? connectGrapesDrive({ fullRead: true }) : accessToken
  }
  let loginHint = ''
  try { loginHint = window.localStorage.getItem(ACCOUNT_KEY) || '' } catch {}
  connecting = new Promise((resolve, reject) => {
    // Each attempt owns its callbacks; a cached client would resolve an old promise.
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: requestedFullRead ? `${GRAPES_DRIVE_SCOPE} ${GRAPES_DRIVE_READ_SCOPE}` : GRAPES_DRIVE_SCOPE,
      login_hint: loginHint,
      error_callback: (error) => reject(new Error(error?.type || 'Google Drive bejelentkezési hiba.')),
      callback: async (response) => {
        if (response.error) return reject(new Error(response.error_description || response.error))
        if (!response.access_token) return reject(new Error('A Google nem adott hozzáférési tokent.'))
        const responseScopes = String(response.scope || '')
        if (requestedFullRead && ![GRAPES_DRIVE_SCOPE, GRAPES_DRIVE_READ_SCOPE].every((scope) => responseScopes.split(/\s+/).includes(scope))) {
          return reject(new Error('A Google nem adta meg mindkét szükséges Drive-engedélyt.'))
        }
        accessToken = response.access_token
        grantedScopes = responseScopes || GRAPES_DRIVE_SCOPE
        expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000
        scheduleExpiry()
        folderCache.clear()
        if (requestedFullRead) try { window.localStorage.setItem(FULL_READ_KEY, '1') } catch {}
        await rememberAccount(accessToken)
        persistSession()
        for (const listener of listeners) listener(true)
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
  try { return await connecting } finally { connecting = null }
}

async function rememberAccount(token) {
  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return
    const user = (await response.json()).user
    if (!user || accessToken !== token) return
    accountProfile = {
      name: user.displayName || user.emailAddress?.split('@')[0] || 'Google',
      email: user.emailAddress || '',
      photo: user.photoLink || '',
    }
    if (accountProfile.email) window.localStorage.setItem(ACCOUNT_KEY, accountProfile.email)
  } catch { /* Remembering the account is optional, including when storage is blocked. */ }
}

function persistSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      clientId: CLIENT_ID, accessToken, expiresAt, scopes: grantedScopes, account: accountProfile,
    }))
  } catch {}
}

async function driveRequest(url, options = {}) {
  if (!isGrapesDriveConnected()) throw new Error('A Google Drive nincs csatlakoztatva. Csatlakoztasd újra.')
  const requestToken = accessToken
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  })
  if (response.status === 401) {
    if (accessToken === requestToken) clearSession()
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
