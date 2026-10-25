// TEST-only foundation for future per-account LOCAL project storage.
// This is not imported by the current Food/Water/Finance/E-book screens.
// Legacy 'grapes-projects' and localStorage are NEVER read, claimed or deleted.
// The storage boundary is against app-level cross-account mistakes, NOT hostile
// same-origin JavaScript (IndexedDB itself is origin-scoped, not user-secured).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLLECTION = 'projects'
const VERSION = 1
const PREFIX = 'grapes-test-local-owner-v1-'
const LOCAL_ID = /^[a-z][a-z0-9_.:-]{0,127}$/i

export class GrapesLocalOwnerError extends Error {
  constructor(message) { super(message); this.name = 'GrapesLocalOwnerError' }
}

function requireId(value) {
  if (typeof value !== 'string' || !LOCAL_ID.test(value)) {
    throw new GrapesLocalOwnerError('Érvénytelen helyi rekordazonosító.')
  }
  return value
}

function ownerId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new GrapesLocalOwnerError('A hitelesített Grapes TEST-fiók nem ellenőrizhető.')
  }
  return value.toLowerCase()
}

function clone(value) {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GrapesLocalOwnerError('A helyi adatoknak objektumnak kell lenniük.')
  }
  return structuredClone(value)
}

function verifiedRow(row, user, id) {
  if (row === undefined) return null
  if (!row || row.ownerId !== user || row.id !== id ||
      !Number.isSafeInteger(row.revision) || row.revision < 1 ||
      row.schemaVersion !== VERSION || !row.data || typeof row.data !== 'object') {
    throw new GrapesLocalOwnerError('A helyi rekord tulajdonosa vagy revíziója nem ellenőrizhető.')
  }
  return { id: row.id, ownerId: row.ownerId, revision: row.revision,
    data: clone(row.data) }
}

function openDb(indexedDb, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(COLLECTION)) {
        request.result.createObjectStore(COLLECTION, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('A fióktárhely nem nyitható meg.'))
    request.onblocked = () => reject(new GrapesLocalOwnerError('A helyi tároló frissítését másik lap blokkolja.'))
  })
}

/**
 * Caller MUST supply a real, fresh verified Auth subject (native on Android).
 * A pin is captured before every operation and rechecked after read/commit.
 * No legacy data movement; new accounts begin with an empty owner partition.
 */
export function createGrapesTestLocalOwnerStore({
  getVerifiedSubject,
  indexedDb = globalThis.indexedDB,
  enabled = false,
} = {}) {
  if (typeof getVerifiedSubject !== 'function') {
    throw new GrapesLocalOwnerError('A natív TEST-fiókellenőrzés hiányzik.')
  }
  async function pin() {
    if (enabled !== true) throw new GrapesLocalOwnerError('A helyi fióktárhely TEST-kapuja ki van kapcsolva.')
    if (!indexedDb?.open) throw new GrapesLocalOwnerError('Az IndexedDB nem érhető el.')
    return ownerId(await getVerifiedSubject())
  }
  async function check(user) {
    if (ownerId(await getVerifiedSubject()) !== user) {
      throw new GrapesLocalOwnerError('A Grapes TEST-fiók megváltozott; a helyi művelet megszakadt.')
    }
  }
  async function withDb(work) {
    const user = await pin()
    const db = await openDb(indexedDb, PREFIX + user)
    try {
      await check(user)
      const result = await work(db, user)
      // A user switch must NEVER return the earlier user's data.
      await check(user)
      return result
    } finally { db.close() }
  }
  return Object.freeze({
    async read(id) {
      requireId(id)
      return withDb((db, user) => new Promise((resolve, reject) => {
        const tx = db.transaction(COLLECTION, 'readonly')
        const req = tx.objectStore(COLLECTION).get(id)
        let result
        req.onsuccess = () => {
          try { result = verifiedRow(req.result, user, id) }
          catch (error) { tx.abort(); reject(error) }
        }
        tx.oncomplete = () => resolve(result ?? null)
        tx.onabort = () => reject(tx.error || new GrapesLocalOwnerError('A helyi rekord olvasása leállt.'))
        req.onerror = () => reject(req.error || new Error('A helyi rekord nem olvasható.'))
      }))
    },
    async list() {
      return withDb((db, user) => new Promise((resolve, reject) => {
        const tx = db.transaction(COLLECTION, 'readonly')
        const req = tx.objectStore(COLLECTION).getAll()
        let records
        req.onsuccess = () => {
          try { records = req.result.map(item => verifiedRow(item, user, item?.id)) }
          catch (error) { tx.abort(); reject(error) }
        }
        tx.oncomplete = () => resolve(records || [])
        tx.onabort = () => reject(tx.error || new GrapesLocalOwnerError('A helyi fióklista nem ellenőrizhető.'))
        req.onerror = () => reject(req.error || new Error('A helyi rekordlista nem olvasható.'))
      }))
    },
    async save({ id, data, expectedRevision = 0 }) {
      requireId(id)
      const candidate = clone(data)
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new GrapesLocalOwnerError('Érvénytelen várt helyi revízió.')
      }
      return withDb((db, user) => new Promise((resolve, reject) => {
        let result
        const tx = db.transaction(COLLECTION, 'readwrite')
        const store = tx.objectStore(COLLECTION)
        const req = store.get(id)
        req.onsuccess = () => {
          try {
            const prior = verifiedRow(req.result, user, id)
            if ((prior?.revision || 0) !== expectedRevision) {
              throw new GrapesLocalOwnerError('Helyi ütközés: a korábbi felhasználói adat nem írható felül.')
            }
            result = { id, ownerId: user, revision: expectedRevision + 1,
              schemaVersion: VERSION, data: candidate }
            store.put(result)
          } catch (error) { tx.abort(); reject(error) }
        }
        tx.oncomplete = () => resolve({ id, revision: result.revision })
        tx.onabort = () => reject(tx.error || new GrapesLocalOwnerError('A helyi mentés megszakadt.'))
        req.onerror = () => reject(req.error || new Error('A helyi rekord nem ellenőrizhető.'))
      }))
    },
  })
}
