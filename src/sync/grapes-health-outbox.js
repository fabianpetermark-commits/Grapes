// Isolated Phase 2 Health outbox. No application module imports this while the
// TEST Health sync gate is off. A caller must first complete its local save.
const databaseName = 'grapes-supabase-phase2-v1'
const testProjectUrl = 'https://aighqtqjlzirlokxwupt.supabase.co'
const healthGateEnabled = () => import.meta.env.VITE_GRAPES_TEST_HEALTH_SYNC_ENABLED === 'true'
const storeName = 'operations'
const kinds = new Set(['food', 'water', 'health', 'yazio', 'food_diary', 'food_custom',
  'food_recipe', 'food_recipe_ingredient', 'water_entry', 'yazio_import', 'nutrient_goal'])

function requestDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
  })
}
function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: 'operationId' })
      store.createIndex('byOwnerProfile', ['ownerId', 'profileId'])
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'))
  })
}
function validate(input) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.ownerId || '') ||
      typeof input.profileId !== 'string' || !input.profileId || input.profileId.length > 200 ||
      !kinds.has(input.kind) || typeof input.recordId !== 'string' ||
      !input.recordId || input.recordId.length > 200 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      !Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1 ||
      typeof input.localSaveToken !== 'string' || !input.localSaveToken ||
      !/^[0-9a-f-]{36}$/i.test(input.operationId || '')) {
    throw new Error('Invalid profile-scoped Health operation')
  }
  const candidateJson = JSON.stringify(input.payload)
  if (!candidateJson || new TextEncoder().encode(candidateJson).length > 1048576) {
    throw new Error('Invalid or oversized Health payload')
  }
  return candidateJson
}
export async function enqueueHealthOperation(input) {
  if (!healthGateEnabled()) throw new Error('TEST Health sync is disabled')
  const operationId = input.operationId || crypto.randomUUID()
  const candidateJson = validate({ ...input, operationId })
  const db = await openOutbox()
  try {
    const transaction = db.transaction(storeName, 'readwrite')
    const done = transactionDone(transaction)
    transaction.objectStore(storeName).add({
      operationId, ownerId: input.ownerId, profileId: input.profileId,
      kind: input.kind, recordId: input.recordId,
      expectedRevision: input.expectedRevision, schemaVersion: input.schemaVersion,
      candidateJson, localSaveToken: input.localSaveToken, state: 'pending',
      createdAt: new Date().toISOString()
    })
    await done
    return operationId
  } finally { db.close() }
}
export async function listHealthOperations(ownerId, profileId) {
  const db = await openOutbox()
  try {
    const transaction = db.transaction(storeName, 'readonly')
    const done = transactionDone(transaction)
    const rows = await requestDone(transaction.objectStore(storeName)
      .index('byOwnerProfile').getAll([ownerId, profileId]))
    await done
    return rows
  } finally { db.close() }
}
async function setOutcome(operation, state, result) {
  const db = await openOutbox()
  try {
    const transaction = db.transaction(storeName, 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(storeName)
    const current = await requestDone(store.get(operation.operationId))
    if (!current || current.ownerId !== operation.ownerId ||
        current.profileId !== operation.profileId || current.candidateJson !== operation.candidateJson) {
      throw new Error('Outbox operation changed during sync')
    }
    store.put({ ...current, state, result })
    await done
  } finally { db.close() }
}
async function verifiedOwner(client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id) return null
  return data.user.id
}
export async function retryHealthOperations({ client, ownerId, profileId }) {
  if (!healthGateEnabled() || client?.supabaseUrl !== testProjectUrl ||
      !client?.auth?.getUser || !client?.schema || await verifiedOwner(client) !== ownerId) {
    return { status: 'paused', attempted: 0 }
  }
  const operations = (await listHealthOperations(ownerId, profileId))
    .filter(row => row.state === 'pending')
  let committed = 0, conflicted = 0, unknown = 0
  for (const operation of operations) {
    if (await verifiedOwner(client) !== ownerId) {
      return { status: 'paused', attempted: committed + conflicted + unknown, committed, conflicted, unknown }
    }
    let response
    try {
      response = await client.schema('api').rpc('compare_and_swap', {
        p_profile_id: operation.profileId, p_kind: operation.kind,
        p_record_id: operation.recordId, p_operation_id: operation.operationId,
        p_expected_revision: operation.expectedRevision,
        p_schema_version: operation.schemaVersion,
        p_candidate: JSON.parse(operation.candidateJson)
      })
    } catch { unknown++; continue }
    if (response?.error || !['committed', 'conflict'].includes(response?.data?.status)) {
      unknown++; continue
    }
    // A late response from the previous account must not update its local state.
    if (await verifiedOwner(client) !== ownerId) {
      return { status: 'paused', attempted: committed + conflicted + unknown, committed, conflicted, unknown }
    }
    if (response.data.status === 'conflict') {
      if (!response.data.snapshotId) { unknown++; continue }
      await setOutcome(operation, 'conflict', response.data)
      conflicted++
    } else {
      if (!Number.isSafeInteger(response.data.revision) || response.data.revision < 1) {
        unknown++; continue
      }
      await setOutcome(operation, 'synced', response.data)
      committed++
    }
  }
  return { status: unknown ? 'pending' : conflicted ? 'conflict' : 'synced',
    attempted: operations.length, committed, conflicted, unknown }
}
