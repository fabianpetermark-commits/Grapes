import { configuredDeveloperEmail, normalizeEmail } from './developer-settings.js'

export const REGISTERED_USERS_KEY = 'grapes-registered-users-v1'
export const REGISTERED_USERS_FILE = 'registered-users.grapes.json'

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeRegisteredUser(value, now = () => new Date().toISOString()) {
  const email = normalizeEmail(value?.email)
  if (!validEmail(email)) throw new Error('Érvényes e-mail-cím szükséges.')
  return {
    email,
    name: String(value?.name || '').trim() || email.split('@')[0],
    role: value?.role === 'owner' ? 'owner' : 'member',
    addedAt: String(value?.addedAt || now()),
  }
}

export function ensureDeveloperOwner(users, developerEmail = configuredDeveloperEmail()) {
  const normalized = []
  for (const value of Array.isArray(users) ? users : []) {
    try {
      const user = normalizeRegisteredUser(value)
      const existing = normalized.findIndex(item => item.email === user.email)
      if (existing >= 0) normalized[existing] = user
      else normalized.push(user)
    } catch { /* Invalid legacy rows are ignored. */ }
  }
  const ownerEmail = normalizeEmail(developerEmail)
  const owner = normalized.find(item => item.email === ownerEmail)
  if (owner) owner.role = 'owner'
  else if (ownerEmail) normalized.unshift(normalizeRegisteredUser({ email: ownerEmail, name: 'Projectsoundmodel', role: 'owner' }))
  return normalized.sort((left, right) => Number(right.role === 'owner') - Number(left.role === 'owner') || left.email.localeCompare(right.email))
}

export function readRegisteredUsers(storage = globalThis.localStorage, developerEmail = configuredDeveloperEmail()) {
  try {
    const parsed = JSON.parse(storage?.getItem(REGISTERED_USERS_KEY) || '[]')
    return ensureDeveloperOwner(parsed, developerEmail)
  } catch {
    return ensureDeveloperOwner([], developerEmail)
  }
}

export function writeRegisteredUsers(users, storage = globalThis.localStorage, developerEmail = configuredDeveloperEmail()) {
  const normalized = ensureDeveloperOwner(users, developerEmail)
  storage?.setItem(REGISTERED_USERS_KEY, JSON.stringify(normalized))
  return normalized
}

export function upsertRegisteredUser(users, value, developerEmail = configuredDeveloperEmail()) {
  const next = ensureDeveloperOwner(users, developerEmail)
  const user = normalizeRegisteredUser(value)
  const existing = next.findIndex(item => item.email === user.email)
  if (existing >= 0) next[existing] = { ...next[existing], ...user, role: next[existing].role === 'owner' ? 'owner' : user.role }
  else next.push(user)
  return ensureDeveloperOwner(next, developerEmail)
}

export function removeRegisteredUser(users, email, developerEmail = configuredDeveloperEmail()) {
  const target = normalizeEmail(email)
  if (target === normalizeEmail(developerEmail)) throw new Error('A tulajdonosi fiók nem távolítható el.')
  return ensureDeveloperOwner(users, developerEmail).filter(user => user.email !== target)
}

export async function loadRegisteredUsers() {
  const { isGrapesDriveConnected, listGrapesProjects, loadGrapesProject } = await import('./storage/grapes-drive.js')
  const localUsers = readRegisteredUsers()
  if (!isGrapesDriveConnected()) return { users: localUsers, fileId: null, connected: false, synced: false }
  const files = await listGrapesProjects('system')
  const file = files.find(item => item.name === REGISTERED_USERS_FILE)
  if (!file) return { users: localUsers, fileId: null, connected: true, synced: false }
  const project = await loadGrapesProject(file.id)
  const users = writeRegisteredUsers(project?.data?.users || localUsers)
  return { users, fileId: file.id, connected: true, synced: true }
}

export async function saveRegisteredUsers(users, fileId = null) {
  const { isGrapesDriveConnected, saveGrapesProject } = await import('./storage/grapes-drive.js')
  const normalized = writeRegisteredUsers(users)
  if (!isGrapesDriveConnected()) return { users: normalized, fileId, connected: false, synced: false }
  const savedFileId = await saveGrapesProject({
    module: 'system',
    name: 'registered-users',
    fileId,
    data: { version: 1, users: normalized },
  })
  return { users: normalized, fileId: savedFileId, connected: true, synced: true }
}
