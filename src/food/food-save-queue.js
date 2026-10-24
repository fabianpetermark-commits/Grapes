// Food writes are ordered per profile. The synchronous journal covers the gap
// between an edit and the end of its IndexedDB transaction when storage allows.
const PREFIX = 'grapes-food-pending-v1:'
const keyFor = profileId => PREFIX + encodeURIComponent(profileId)
const writeKeyFor = (profileId, token) => `${keyFor(profileId)}:write:${encodeURIComponent(token)}`

export function createFoodSaveQueue({ save, storage = globalThis.localStorage, onStatus = () => {}, now = Date.now, randomId = () => crypto.randomUUID() }) {
  const tails = new Map()
  const latest = new Map()
  const committed = new Map()
  const queued = new Map()

  function conflict() {
    const error = new Error('A Food helyreállító naplója eltér a tartós helyi mentéstől; mindkét példány megmaradt. Exportáld a naplót a kézi helyreállításhoz.')
    error.code = 'FOOD_LOCAL_RECOVERY_CONFLICT'
    return error
  }

  function observe(profileId, stored) {
    committed.set(profileId, { token: stored?.saveToken || null, revision: Number.isSafeInteger(stored?.saveRevision) ? stored.saveRevision : 0 })
  }

  function journalEntries(profileId) {
    const primary = keyFor(profileId)
    const keys = [primary]
    if (typeof storage?.key === 'function') {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(primary + ':write:')) keys.push(key)
      }
    }
    return keys.map(key => ({ key, raw: storage?.getItem(key) })).filter(entry => entry.raw)
  }

  function pending(profileId, stored = null) {
    const entries = journalEntries(profileId)
    if (!entries.length) return null
    const journals = new Map()
    for (const entry of entries) {
      let item
      try { item = JSON.parse(entry.raw) } catch { throw conflict() }
      if (![1, 2].includes(item?.version) || item.profileId !== profileId || item.data?.profile?.id !== profileId || !item.token) throw conflict()
      journals.set(item.token, item)
    }
    const items = [...journals.values()]
    const item = items.find(candidate => items.every(other => other.token === candidate.token || candidate.ancestorTokens?.includes(other.token)))
    if (!item) throw conflict()
    if (stored?.saveToken === item.token) {
      for (const entry of entries) try { storage.removeItem(entry.key) } catch {}
      return null
    }
    // A timestamp cannot order writes in the same millisecond or across tabs.
    // Old journals have no ancestry, so a different committed record requires
    // manual recovery. New journals can only follow a known committed token.
    if (stored && (item.version === 1 || !stored.saveToken ||
      !item.ancestorTokens?.includes(stored.saveToken) ||
      (Number.isSafeInteger(stored.saveRevision) && stored.saveRevision >= item.revision))) throw conflict()
    queued.set(profileId, { token: item.token, revision: item.revision || 0, ancestorTokens: item.ancestorTokens || [] })
    return item
  }

  function enqueue({ data, fileId = null, driveVersion = null, driveWriteId = null, module = 'Ételnapló', name = 'Ételnapló' }) {
    const snapshot = structuredClone(data)
    const profileId = snapshot?.profile?.id
    if (!profileId) throw new Error('A Food mentéséhez profilazonosító szükséges.')
    const token = randomId()
    const baseline = committed.get(profileId) || { token: null, revision: 0 }
    const preceding = queued.get(profileId)
    const ancestorTokens = [...new Set([...(preceding?.ancestorTokens || []), preceding?.token, baseline.token].filter(Boolean))]
    const revision = Math.max(baseline.revision, preceding?.revision || 0) + 1
    const record = { id: `food-tracker-${profileId}`, module, name, data: snapshot, driveFileId: fileId, driveVersion, driveWriteId, saveToken: token, saveRevision: revision }
    const item = { version: 2, profileId, token, revision, ancestorTokens, recordedAt: now(), fileId, driveVersion, driveWriteId, data: snapshot }
    latest.set(profileId, token)
    let existing
    try { existing = storage?.getItem(keyFor(profileId)) }
    catch (error) { onStatus(profileId, 'failed', error); throw error }
    let replacePrimary = true
    if (existing) {
      let old
      try { old = JSON.parse(existing) } catch { const error = conflict(); onStatus(profileId, 'failed', error); throw error }
      if (old?.profileId !== profileId || !old.token || (old.token !== preceding?.token && old.token !== baseline.token)) {
        if (old?.version !== 2 || !Number.isSafeInteger(old.revision) || old.revision <= baseline.revision) {
          const error = conflict(); onStatus(profileId, 'failed', error); throw error
        }
        replacePrimary = false
      }
    }
    queued.set(profileId, { token, revision, ancestorTokens })
    onStatus(profileId, 'pending')
    try {
      storage?.setItem(writeKeyFor(profileId, token), JSON.stringify(item))
      if (replacePrimary) storage?.setItem(keyFor(profileId), JSON.stringify(item))
    }
    catch (error) {
      latest.delete(profileId)
      queued.delete(profileId)
      onStatus(profileId, 'journal-failed', error)
      throw error
    }
    const task = (tails.get(profileId) || Promise.resolve()).catch(() => {}).then(async () => {
      await save({ ...record, expectedSaveToken: committed.get(profileId)?.token || null })
      committed.set(profileId, { token, revision })
      try {
        storage?.removeItem(writeKeyFor(profileId, token))
        // A restarted queue may have replayed an earlier pending journal.
        // Retire only the exact ancestor tokens proved by this successful CAS.
        for (const ancestor of ancestorTokens) {
          const key = writeKeyFor(profileId, ancestor)
          const raw = storage?.getItem(key)
          if (raw && JSON.parse(raw)?.token === ancestor) storage?.removeItem(key)
        }
        const primary = storage?.getItem(keyFor(profileId))
        if (primary && [token, ...ancestorTokens].includes(JSON.parse(primary)?.token)) {
          storage?.removeItem(keyFor(profileId))
        }
      } catch { /* Keep damaged journal bytes for manual recovery. */ }
      if (latest.get(profileId) === token) onStatus(profileId, 'saved')
      if (latest.get(profileId) === token) queued.delete(profileId)
      return record
    }).catch(error => {
      if (latest.get(profileId) === token) onStatus(profileId, 'failed', error)
      throw error
    })
    tails.set(profileId, task)
    return task
  }

  function flush(profileId) { return tails.get(profileId) || Promise.resolve() }
  function raw(profileId) { return storage?.getItem(keyFor(profileId)) || null }
  function allRaw(profileId) { return journalEntries(profileId).map(entry => entry.raw) }
  return { enqueue, flush, pending, observe, raw, allRaw, keyFor }
}
