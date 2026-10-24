import { readWaterStoreStrict, waterBackupFromJson, waterBackupSummary,
  writeWaterStoreVerified } from './water-backup.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEGACY_KEY = 'grapes-water-v1'

export function waterProfileKey(profileId) {
  if (!UUID.test(profileId || '')) throw new Error('Érvénytelen TEST Water-profil.')
  return `grapes-water-v2:${profileId.toLowerCase()}`
}

export function readProfileWater(storage, profileId) {
  return readWaterStoreStrict(storage, waterProfileKey(profileId))
}

export function writeProfileWater(storage, profileId, days, expectedRaw) {
  return writeWaterStoreVerified(storage, days, expectedRaw, waterProfileKey(profileId))
}

export function inspectLegacyWater(storage, ownerId, profileId) {
  waterProfileKey(profileId)
  const raw = storage.getItem(LEGACY_KEY)
  if (raw === null) return { status: 'missing' }
  if (ownerId && ownerId !== profileId) return { status: 'other-profile' }
  try {
    const days = readWaterStoreStrict(storage)
    return { status: ownerId ? 'claimed' : 'available', ...waterBackupSummary(days) }
  } catch { return { status: 'damaged' } }
}

export async function claimLegacyWater(storage, profileId, claimOwner) {
  const key = waterProfileKey(profileId)
  if (typeof claimOwner !== 'function') throw new Error('A régi Water tulajdonosa nem igazolható.')
  const original = storage.getItem(LEGACY_KEY)
  if (original === null) throw new Error('Nincs régi Víz napló.')
  const days = readWaterStoreStrict(storage)
  const currentRaw = storage.getItem(key)
  const current = readProfileWater(storage, profileId)
  if (Object.keys(current).length) throw new Error('A TEST-profil Víz naplója már tartalmaz adatot.')
  // Reserve ownership atomically in IndexedDB before exposing legacy content
  // under the new key. A crash after reservation only allows the same user
  // to retry; the original bytes are never removed.
  await claimOwner(profileId)
  if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(key) !== currentRaw) {
    throw new Error('A Víz napló időközben megváltozott; az átvétel leállt.')
  }
  writeProfileWater(storage, profileId, days, currentRaw)
  return waterBackupSummary(days)
}

export function profileWaterBackupToJson(storage, profileId, exportedAt = new Date().toISOString()) {
  return JSON.stringify({ grapesWaterBackup: true, version: 2, profileId,
    exportedAt, data: readProfileWater(storage, profileId) }, null, 2)
}

export function profileWaterBackupFromJson(text, profileId, { allowLegacy = false } = {}) {
  let backup
  try { backup = JSON.parse(text) } catch { throw new Error('Hibás Víz napló JSON-mentés.') }
  if (backup?.version === 1 && allowLegacy) return { days: waterBackupFromJson(text), legacy: true }
  if (backup?.grapesWaterBackup !== true || backup.version !== 2 || backup.profileId !== profileId) {
    throw new Error('A Víz mentése másik TEST-profilhoz tartozik vagy nem támogatott.')
  }
  const data = JSON.stringify(backup.data)
  return { days: readWaterStoreStrict({ getItem: () => data }), legacy: false }
}
