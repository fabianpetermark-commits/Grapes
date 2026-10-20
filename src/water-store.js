export const LEGACY_WATER_KEY = 'grapes-water-v1'
export const WATER_KEY_PREFIX = 'grapes-water-v2:'
const LEGACY_OWNER_KEY = 'grapes-water-v1-claimed-by'

export function waterProfileId(account) {
  return String(account?.id || account?.email || 'local-food-profile').trim().toLocaleLowerCase('hu-HU')
}

export function waterKey(profileId) {
  if (!profileId) throw new Error('A víznapló profilazonosítója hiányzik.')
  return WATER_KEY_PREFIX + encodeURIComponent(profileId)
}

function parseStore(raw) {
  if (raw === null) return {}
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('A víznapló sérült. Az eredeti adat megmaradt; készíts biztonsági másolatot a helyreállítás előtt.') }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.entries(value).some(([date, day]) => !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !day || typeof day !== 'object' || !Array.isArray(day.entries))) {
    throw new Error('A víznapló formátuma sérült. Az eredeti adat megmaradt.')
  }
  return value
}

export function readWaterStore(storage, profileId) {
  return parseStore(storage.getItem(waterKey(profileId)))
}

export function writeWaterStore(storage, profileId, store) {
  // Never replace damaged data, even if a caller rendered an empty fallback.
  readWaterStore(storage, profileId)
  const content = JSON.stringify(store)
  parseStore(content)
  storage.setItem(waterKey(profileId), content)
}

export function legacyWaterStatus(storage, profileId) {
  const raw = storage.getItem(LEGACY_WATER_KEY)
  if (raw === null) return { available: false, claimed: false }
  const owner = storage.getItem(LEGACY_OWNER_KEY)
  if (owner && owner !== profileId) return { available: false, claimed: true }
  try { parseStore(raw) } catch { return { available: false, claimed: false, damaged: true } }
  return { available: true, claimed: Boolean(owner) }
}

export function claimLegacyWaterStore(storage, profileId) {
  const status = legacyWaterStatus(storage, profileId)
  if (!status.available) throw new Error(status.damaged ? 'A régi víznapló sérült; az eredeti adat megmaradt.' : 'A régi víznapló nem érhető el ehhez a profilhoz.')
  const existing = readWaterStore(storage, profileId)
  if (Object.keys(existing).length) throw new Error('A jelenlegi profil víznaplója már tartalmaz adatot. Előbb készíts biztonsági másolatot.')
  const legacy = parseStore(storage.getItem(LEGACY_WATER_KEY))
  storage.setItem(LEGACY_OWNER_KEY, profileId)
  writeWaterStore(storage, profileId, legacy)
  return Object.keys(legacy).length
}
