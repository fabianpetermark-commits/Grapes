// Isolated reference model. It has no app imports, network calls, or credentials.
const clone = value => structuredClone(value)
const keyOf = ({ userId, profileId, kind, recordId }) => JSON.stringify([userId, profileId, kind, recordId])

export class MemorySyncServer {
  #profiles = new Map()
  #heads = new Map()
  #history = new Map()
  #attempts = new Map()
  #locks = new Map()

  addProfile(userId, profileId) {
    const owners = this.#profiles.get(profileId) || new Set()
    owners.add(userId)
    this.#profiles.set(profileId, owners)
  }

  #assertOwner(userId, profileId) {
    if (!userId || !this.#profiles.get(profileId)?.has(userId)) throw Object.assign(new Error('Access denied'), { code: 'FORBIDDEN' })
  }

  async #locked(key, task) {
    const previous = this.#locks.get(key) || Promise.resolve()
    let release
    const next = new Promise(resolve => { release = resolve })
    this.#locks.set(key, next)
    await previous
    try { return await task() } finally { release(); if (this.#locks.get(key) === next) this.#locks.delete(key) }
  }

  async write({ userId, profileId, kind, recordId, operationId, expectedRevision, payload, schemaVersion = 1 }, { failBeforeCommit = false, loseResponse = false } = {}) {
    this.#assertOwner(userId, profileId)
    if (!['food', 'water', 'health', 'yazio'].includes(kind) || !recordId || !operationId ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      !Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || payload === undefined) throw new Error('Invalid write')
    const key = keyOf({ userId, profileId, kind, recordId })
    const opKey = JSON.stringify([userId, operationId])
    const fingerprint = JSON.stringify([key, expectedRevision, schemaVersion, payload])
    return this.#locked(key, async () => {
      const old = this.#attempts.get(opKey)
      if (old) {
        if (old.fingerprint !== fingerprint) throw Object.assign(new Error('Operation ID reused'), { code: 'OPERATION_MISMATCH' })
        return clone(old.result)
      }
      const current = this.#heads.get(key)
      const actualRevision = current?.revision || 0
      const result = actualRevision === expectedRevision
        ? { status: 'committed', revision: actualRevision + 1 }
        : { status: 'conflict', revision: actualRevision, snapshotId: operationId }
      if (failBeforeCommit) throw new Error('Transaction aborted')
      // This block models one database transaction: head, history and attempt
      // become visible together. A conflict retains the rejected candidate.
      if (result.status === 'committed') {
        const head = { revision: result.revision, schemaVersion, payload: clone(payload) }
        this.#heads.set(key, head)
        this.#history.set(key, [...(this.#history.get(key) || []), clone(head)])
      }
      this.#attempts.set(opKey, { fingerprint, result: clone(result), key, payload: clone(payload) })
      if (loseResponse) throw Object.assign(new Error('Response lost after commit'), { code: 'UNKNOWN_RESULT' })
      return result
    })
  }

  read({ userId, profileId, kind, recordId }) {
    this.#assertOwner(userId, profileId)
    return clone(this.#heads.get(keyOf({ userId, profileId, kind, recordId })) || null)
  }

  history({ userId, profileId, kind, recordId }) {
    this.#assertOwner(userId, profileId)
    return clone(this.#history.get(keyOf({ userId, profileId, kind, recordId })) || [])
  }

  conflict({ userId, operationId }) {
    const attempt = this.#attempts.get(JSON.stringify([userId, operationId]))
    if (!attempt || attempt.result.status !== 'conflict') return null
    return clone({ ...attempt.result, payload: attempt.payload })
  }
}

// A caller supplies a durable, profile-scoped adapter in the eventual app.
// This test adapter deliberately makes persistence explicit and can fail.
export class MemoryOutbox {
  items = new Map()
  put(item) { this.items.set(item.operationId, clone(item)) }
  remove(operationId) { this.items.delete(operationId) }
  list() { return [...this.items.values()].map(clone) }
}

export async function retryOutbox(outbox, server) {
  const results = []
  for (const item of outbox.list()) {
    try {
      const result = await server.write(item)
      if (result.status === 'committed') outbox.remove(item.operationId)
      results.push(result)
    } catch (error) { results.push({ status: 'pending', code: error.code || 'WRITE_FAILED' }) }
  }
  return results
}
