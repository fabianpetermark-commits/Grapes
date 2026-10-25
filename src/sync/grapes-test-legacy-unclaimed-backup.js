// TEST migration staging only. Do NOT import from normal modules.
// This captures UNOWNED legacy data without deleting, mutating, assigning or
// exposing it in account-switched UI. Caller controls access to raw capture.
// No Android bridge, cloud, Drive, import or owner write path in this module.
const DB = 'grapes-projects'
const STORE = 'projects'
const MAX_BYTES = 80 * 1024 * 1024

const KEYS = new Set([
  'grapes-water-v1',
  'grapes-ebook-reading-progress-v1',
  'grapes-ebook-library-cache-v1',
  'grapes-food-inbox-seen-v1',
  'grapes-food-health-auto-v1',
])
const PREFIXES = [
  'grapes-water-v2:', 'grapes-water-recovery-v1:',
  'grapes-food-pending-v1:', 'grapes-food-yazio-auto-v1:',
  'grapes-ebook-library-cache-v2:',
]
// Runtime settings and synthetic TEST keys are deliberately NOT backed up
// with users' data. New unknown grapes-* keys must be reviewed first.
const EXCLUDED = new Set([
  'grapes-drive-account', 'grapes-drive-full-read', 'grapes-drive-full-write',
  'grapes-local-mode', 'grapes-sync-last-check-v1', 'grapes-update-read-v1',
  'grapes-reader-library-enabled',
])
const isDataKey = key => KEYS.has(key) || PREFIXES.some(prefix => key.startsWith(prefix))
const isExcluded = key => EXCLUDED.has(key) || key.startsWith('grapes-test-')

function strictlyJsonValue(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object' ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
    throw new Error('Unsupported non-JSON legacy value at ' + path)
  }
  if (ancestors.has(value)) throw new Error('Cyclic legacy record at ' + path)
  ancestors.add(value)
  for (const [key, item] of Object.entries(value)) {
    strictlyJsonValue(item, path + '.' + key, ancestors)
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) {
    throw new Error('Sparse or decorated legacy array at ' + path)
  }
  ancestors.delete(value)
}

function exactJson(value) {
  strictlyJsonValue(value)
  const json = JSON.stringify(value)
  if (typeof json !== 'string') throw new Error('Cannot serialize legacy source')
  return json
}

function readExistingProjects(indexedDb) {
  if (!indexedDb?.open) throw new Error('IndexedDB is unavailable')
  return new Promise((resolve, reject) => {
    const req = indexedDb.open(DB)
    let absent = false
    req.onupgradeneeded = () => {
      absent = true
      req.transaction.abort() // NEVER create an absent legacy database.
    }
    req.onerror = () => absent ? resolve([]) : reject(req.error || new Error('Cannot read existing legacy DB'))
    req.onblocked = () => reject(new Error('Legacy DB is blocked'))
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.close()
        reject(new Error('Legacy projects object store is absent'))
        return
      }
      const tx = db.transaction(STORE, 'readonly')
      const cursor = tx.objectStore(STORE).getAll()
      let rows
      cursor.onsuccess = () => { rows = cursor.result }
      cursor.onerror = () => { /* aborted transaction owns the error */ }
      tx.oncomplete = () => { db.close(); resolve(rows || []) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Legacy DB read aborted')) }
      tx.onerror = () => { /* abort owns the error */ }
    }
  })
}

function readLegacyKeyList(storage) {
  if (!storage || typeof storage.key !== 'function' ||
      !Number.isSafeInteger(storage.length) || storage.length < 0 ||
      typeof storage.getItem !== 'function') {
    throw new Error('Cannot enumerate localStorage completely')
  }
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (typeof key !== 'string') throw new Error('Incomplete localStorage enumeration')
    keys.push(key)
  }
  return keys
}

/**
 * ONLY call from a trusted user-initiated backup screen in a future build.
 * Does not contain an access-control UI; don't expose this raw capture to B
 * simply because B logged in on a shared phone.
 */
export async function captureUnclaimedLegacySources({
  indexedDb = globalThis.indexedDB,
  storage = globalThis.localStorage,
} = {}) {
  const rows = await readExistingProjects(indexedDb)
  const sources = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id ||
        seen.has('project/' + row.id)) {
      throw new Error('Duplicate or invalid legacy project')
    }
    seen.add('project/' + row.id)
    // Do NOT normalize data: including unknown project fields / recovery rows
    // is essential for a lossless migration staging snapshot.
    sources.push({
      provider: 'indexeddb', sourceId: row.id,
      raw: exactJson(row),
    })
  }
  const keys = readLegacyKeyList(storage)
  const unknownKeys = keys.filter(k =>
    k.startsWith('grapes-') && !isDataKey(k) && !isExcluded(k)).sort()
  if (unknownKeys.length) {
    // Avoid a false "complete backup": unknown records need separate review.
    throw new Error('Unmapped Grapes local keys: ' + unknownKeys.join(', '))
  }
  for (const key of keys.filter(isDataKey).sort()) {
    const raw = storage.getItem(key)
    if (typeof raw !== 'string') throw new Error('A helyi forrás időközben eltűnt: ' + key)
    sources.push({ provider: 'localStorage', sourceId: key, raw })
  }
  sources.sort((a, b) => (a.provider + ':' + a.sourceId)
    .localeCompare(b.provider + ':' + b.sourceId, 'en'))
  return Object.freeze({
    ownership: 'unclaimed',
    // A capture is NOT yet an externally persisted backup.
    sources,
    total: sources.length,
  })
}

async function sha256(text, subtle) {
  if (!subtle?.digest) throw new Error('SHA-256 unavailable')
  const hash = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...hash].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function manifestFor(capture, subtle) {
  if (capture?.ownership !== 'unclaimed' || !Array.isArray(capture.sources)) {
    throw new Error('A régi helyi források tulajdonosa nem ellenőrzött.')
  }
  const seen = new Set()
  const manifest = []
  for (const source of capture.sources) {
    if (!['indexeddb', 'localStorage'].includes(source?.provider) ||
        typeof source.sourceId !== 'string' || !source.sourceId ||
        typeof source.raw !== 'string') throw new Error('Invalid legacy source')
    const key = source.provider + ':' + source.sourceId
    if (seen.has(key)) throw new Error('Duplicate legacy source')
    seen.add(key)
    if (source.provider === 'indexeddb') {
      const json = exactJson(JSON.parse(source.raw))
      if (json !== source.raw || JSON.parse(json)?.id !== source.sourceId) {
        throw new Error('Legacy IndexedDB content mismatches identity')
      }
    }
    manifest.push({
      provider: source.provider, sourceId: source.sourceId,
      sha256: await sha256(source.raw, subtle),
      bytes: new TextEncoder().encode(source.raw).byteLength,
    })
  }
  manifest.sort((a, b) => (a.provider + ':' + a.sourceId)
    .localeCompare(b.provider + ':' + b.sourceId, 'en'))
  return manifest
}

/** Prepare export envelope. Caller MUST save and independently read back. */
export async function prepareUnclaimedLegacyBackup(capture, {
  exportedAt = new Date().toISOString(), subtle = globalThis.crypto?.subtle,
} = {}) {
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    throw new Error('Invalid backup timestamp')
  }
  const manifest = await manifestFor(capture, subtle)
  if (!manifest.length) throw new Error('No legacy data to back up')
  const json = JSON.stringify({
    grapesLocalMigrationBackup: true, version: 1, ownership: 'unclaimed',
    exportedAt, manifest, sources: capture.sources,
  })
  const bytes = new TextEncoder().encode(json).byteLength
  if (bytes > MAX_BYTES) throw new Error('Legacy backup exceeds 80 MB limit')
  return Object.freeze({
    filename: 'grapes-helyi-adatok-' + exportedAt.slice(0, 10) + '.json',
    bytes, sha256: await sha256(json, subtle), json, manifest,
  })
}

/**
 * Verify an INDEPENDENTLY read-back native file receipt and a FRESH source
 * capture. This is NOT a migration permission, nor a source owner proof.
 */
export async function verifyUnclaimedLegacyBackup(prepared, receipt, currentCapture, {
  subtle = globalThis.crypto?.subtle,
} = {}) {
  if (!prepared || typeof prepared.json !== 'string' ||
      !/^[a-f0-9]{64}$/.test(prepared.sha256 || '') ||
      !Number.isSafeInteger(prepared.bytes) || prepared.bytes <= 0 ||
      prepared.bytes !== new TextEncoder().encode(prepared.json).byteLength ||
      (await sha256(prepared.json, subtle)) !== prepared.sha256 ||
      receipt?.sha256 !== prepared.sha256 || receipt?.bytes !== prepared.bytes) {
    throw new Error('A mentés független visszaolvasása nem igazolható.')
  }
  const envelope = JSON.parse(prepared.json)
  if (envelope?.grapesLocalMigrationBackup !== true || envelope.version !== 1 ||
      envelope.ownership !== 'unclaimed' ||
      JSON.stringify(envelope.manifest) !== JSON.stringify(prepared.manifest)) {
    throw new Error('A korábbi adatmentés tartalma eltér.')
  }
  const actual = await manifestFor(currentCapture, subtle)
  if (JSON.stringify(actual) !== JSON.stringify(prepared.manifest)) {
    throw new Error('A korábbi helyi adatok megváltoztak a mentés óta.')
  }
  return Object.freeze({
    verified: true, ownership: 'unclaimed',
    sourceCount: actual.length, sha256: prepared.sha256, bytes: prepared.bytes,
    // Explicit consent and a new owner-bound copy are still REQUIRED.
    migrationAuthorized: false,
  })
}
