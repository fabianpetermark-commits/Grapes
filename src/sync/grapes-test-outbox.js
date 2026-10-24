// Isolated TEST outbox. No app module imports this until the local durability
// and authenticated native transport gates are reviewed. Candidate bytes stay
// in IndexedDB on every network failure and on conflict.
const DB = 'grapes-test-supabase-outbox-v1'
const STORE = 'operations'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE = /^grapes:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function open(indexedDb) {
  if (!indexedDb?.open) throw new Error('A tartós TEST-mentéstár nem érhető el.')
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB, 1)
    request.onupgradeneeded = () => {
      const rows = request.result.createObjectStore(STORE, { keyPath: 'operationId' })
      rows.createIndex('ownerProfile', ['userId', 'profileId'])
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error || new Error('A TEST-mentéstár nem nyitható meg.'))
    request.onblocked = () => reject(new Error('A TEST-mentéstár megnyitása blokkolva van.'))
  })
}

function transaction(indexedDb, mode, action) {
  return open(indexedDb).then(db => new Promise((resolve, reject) => {
    let tx, result, failure
    try {
      tx = db.transaction(STORE, mode)
      action(tx.objectStore(STORE), value => { result = value }, error => {
        failure = error
        tx.abort()
      })
    } catch (error) { db.close(); reject(error); return }
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('A tartós TEST-művelet megszakadt.')) }
    tx.onerror = () => { /* onabort is the sole failure result. */ }
  }))
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function canonicalJob(userId, input) {
  if (!UUID.test(userId || '') || !PROFILE.test(input?.profileId || '') ||
      !UUID.test(input?.operationId || '') ||
      !['food_diary', 'food_custom', 'food_recipe', 'food_recipe_ingredient',
        'water_entry', 'yazio_import', 'nutrient_goal', 'health_record'].includes(input?.kind) ||
      typeof input?.recordId !== 'string' || input.recordId.length < 1 || input.recordId.length > 200 ||
      !Number.isSafeInteger(input?.expectedRevision) || input.expectedRevision < 0 ||
      !Number.isSafeInteger(input?.schemaVersion) || input.schemaVersion < 1 ||
      !input.candidate || typeof input.candidate !== 'object' || Array.isArray(input.candidate)) {
    throw new Error('Érvénytelen tartós TEST-mentési művelet.')
  }
  let candidateJson
  try { candidateJson = stableJson(JSON.parse(JSON.stringify(input.candidate))) } catch { /* handled below */ }
  if (!candidateJson || new TextEncoder().encode(candidateJson).length > 1048576) {
    throw new Error('A TEST-mentés tartalma nem tárolható.')
  }
  return {
    userId: userId.toLowerCase(), profileId: input.profileId, kind: input.kind,
    recordId: input.recordId, operationId: input.operationId.toLowerCase(),
    expectedRevision: input.expectedRevision, schemaVersion: input.schemaVersion,
    candidateJson,
  }
}

function sameJob(a, b) {
  return ['userId', 'profileId', 'kind', 'recordId', 'operationId',
    'expectedRevision', 'schemaVersion', 'candidateJson'].every(key => a[key] === b[key])
}

export function createGrapesTestOutbox({ indexedDb = globalThis.indexedDB, userId, gateway } = {}) {
  if (!UUID.test(userId || '') || !gateway?.compareAndSwap || !gateway?.readAttempt) {
    throw new Error('A TEST-fiók vagy a biztonságos adatkapu hiányzik.')
  }
  const owner = userId.toLowerCase()
  async function list(profileId) {
    if (!PROFILE.test(profileId || '')) throw new Error('Érvénytelen TEST-profil.')
    return transaction(indexedDb, 'readonly', (rows, setResult) => {
      const request = rows.index('ownerProfile').getAll([owner, profileId])
      request.onsuccess = () => setResult(request.result.map(({ candidateJson, ...item }) => ({
        ...item, candidate: JSON.parse(candidateJson),
      })))
    })
  }
  return Object.freeze({
    async enqueue(input) {
      const job = canonicalJob(owner, input)
      let mismatched = false
      const saved = await transaction(indexedDb, 'readwrite', (rows, setResult) => {
        const request = rows.get(job.operationId)
        request.onsuccess = () => {
          const existing = request.result
          if (existing) {
            if (!sameJob(existing, job)) { mismatched = true; return }
            setResult(existing)
          } else {
            rows.add({ ...job, status: 'pending', createdAt: new Date().toISOString() })
            setResult({ ...job, status: 'pending' })
          }
        }
      })
      if (mismatched) throw new Error('A műveletazonosító már másik mentéshez tartozik.')
      return { operationId: saved.operationId, status: saved.status }
    },
    list,
    async retry(profileId) {
      const pending = (await list(profileId)).filter(item => item.status === 'pending')
      const results = []
      for (const item of pending) {
        const { candidate, candidateJson, ...job } = item
        const result = await gateway.compareAndSwap({ ...job, candidate })
        // Even a valid CAS response is only recorded as settled after the
        // immutable server attempt can be read back for this exact candidate.
        const attempt = await gateway.readAttempt(item.operationId)
        if (!attempt || attempt.profileId !== item.profileId || attempt.kind !== item.kind ||
            attempt.recordId !== item.recordId || attempt.status !== result.status ||
            attempt.expectedRevision !== item.expectedRevision ||
            attempt.schemaVersion !== item.schemaVersion ||
            attempt.revision !== result.revision ||
            (result.status === 'committed' && attempt.revision !== item.expectedRevision + 1) ||
            stableJson(attempt.candidate) !== stableJson(candidate)) {
          // A matching payload alone is not proof of the exact CAS attempt:
          // stale/altered revision or schema must leave the candidate pending.
          throw new Error('A szerveroldali mentés visszaolvasása nem igazolható.')
        }
        await transaction(indexedDb, 'readwrite', (rows, _setResult, fail) => {
          const request = rows.get(item.operationId)
          request.onsuccess = () => {
            const current = request.result
            if (!current || !sameJob(current, { ...job, candidateJson: stableJson(candidate) }))
              return fail(new Error('A helyi TEST-művelet időközben megváltozott.'))
            rows.put({ ...current, status: result.status,
              serverRevision: result.revision, snapshotId: result.snapshotId || null,
              settledAt: new Date().toISOString() })
          }
        })
        results.push({ operationId: item.operationId, ...result })
      }
      return results
    },
  })
}
