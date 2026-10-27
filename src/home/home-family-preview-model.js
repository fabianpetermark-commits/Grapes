import { UNITS } from './home-data.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLES = new Set(['owner', 'editor', 'viewer'])
const PLACES = new Set(['fridge', 'freezer', 'pantry'])
const STATUS = new Set(['planned', 'checked', 'deferred'])
const fail = () => { throw new Error('A közös Otthon előnézeti adatai nem ellenőrizhetők.') }

const sameHome = (value, id) => String(value ?? '').toLowerCase() === id
const reasonable = text => typeof text === 'string' && text.trim().length > 0 &&
  text.length <= 160
const validQuantity = item => {
  if (item.quantityBase == null) return item.displayUnit == null
  return Number.isSafeInteger(item.quantityBase) && item.quantityBase >= 0 &&
    Object.hasOwn(UNITS, item.displayUnit) &&
    item.dimension === UNITS[item.displayUnit][0]
}

/**
 * Converts an authenticated Supabase TEST v2 read response into an explicitly
 * read-only view of the EXISTING approved One Home widgets. Never migrates,
 * merges, writes to, or replaces the local Home v1 event journal.
 *
 * This is a projection only; the read gateway must enforce Auth/RLS and
 * re-check user identity after each real network response.
 */
export function projectOneHomeFamilyPreview(snapshot, requestedHouseholdId) {
  const home = String(requestedHouseholdId ?? '').toLowerCase()
  if (!UUID.test(home) || !snapshot || !sameHome(snapshot.householdId, home) ||
      !ROLES.has(snapshot.role) || !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 0 || !Array.isArray(snapshot.inventory) ||
      !Array.isArray(snapshot.shopping) ||
      snapshot.inventory.length > 10000 || snapshot.shopping.length > 10000) fail()

  const inventory = snapshot.inventory.map(lot => {
    if (!lot || !reasonable(lot.name) || typeof lot.id !== 'string' ||
        !sameHome(lot.householdId, home) || !validQuantity(lot) ||
        lot.quantityBase == null || !PLACES.has(lot.storageLocation) ||
        lot.evidenceStatus !== 'confirmed' || lot.sourceType !== 'manual' ||
        lot.sourceId != null || typeof lot.observedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}/.test(lot.observedAt)) fail()
    return Object.freeze({
      id: lot.id, name: lot.name, householdId: home,
      quantityBase: lot.quantityBase, dimension: lot.dimension,
      displayUnit: lot.displayUnit, storageLocation: lot.storageLocation,
      evidenceStatus: 'confirmed', observedAt: lot.observedAt,
      expiryDate: lot.expiryDate || null,
      expiryKind: lot.expiryKind || null,
    })
  })
  const shopping = snapshot.shopping.map(item => {
    if (!item || !reasonable(item.name) || typeof item.id !== 'string' ||
        !sameHome(item.householdId, home) || !STATUS.has(item.status) ||
        !validQuantity(item) || item.sourceType !== 'manual') fail()
    return Object.freeze({
      id: item.id, name: item.name, householdId: home,
      quantityBase: item.quantityBase, displayUnit: item.displayUnit,
      dimension: item.dimension, status: item.status,
    })
  })
  const unique = rows => new Set(rows.map(row => row.id)).size === rows.length
  if (!unique(inventory) || !unique(shopping)) fail()
  return Object.freeze({
    householdId: home, role: snapshot.role, revision: snapshot.revision,
    inventory: Object.freeze(inventory), shopping: Object.freeze(shopping),
  })
}
