// Food writes are ordered per profile. The synchronous journal covers the gap
// between an edit and the end of its IndexedDB transaction when storage allows.
const PREFIX = 'grapes-food-pending-v1:'
const keyFor = profileId => PREFIX + encodeURIComponent(profileId)

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

  function pending(profileId, stored = null) {
    const raw = storage?.getItem(keyFor(profileId))
    if (!raw) return null
    let item
    try { item = JSON.parse(raw) } catch { throw new Error('A Food függő mentése sérült; az eredeti adatot nem töröltük.') }
    if (![1, 2].includes(item?.version) || item.profileId !== profileId || item.data?.profile?.id !== profileId || !item.token) {
      throw new Error('A Food függő mentése nem ehhez a profilhoz tartozik; az eredeti adatot nem töröltük.')
    }
    if (stored?.saveToken === item.token) {
      try { storage.removeItem(keyFor(profileId)) } catch {}
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
    const existing = storage?.getItem(keyFor(profileId))
    if (existing) {
      let old
      try { old = JSON.parse(existing) } catch { throw conflict() }
      if (old?.profileId !== profileId || !old.token || (old.token !== preceding?.token && old.token !== baseline.token)) throw conflict()
    }
    queued.set(profileId, { token, revision, ancestorTokens })
    latest.set(profileId, token)
    onStatus(profileId, 'pending')
    try { storage?.setItem(keyFor(profileId), JSON.stringify(item)) }
    catch (error) { onStatus(profileId, 'journal-failed', error) }
    const task = (tails.get(profileId) || Promise.resolve()).catch(() => {}).then(async () => {
      await save({ ...record, expectedSaveToken: committed.get(profileId)?.token || null })
      committed.set(profileId, { token, revision })
      try {
        if (pending(profileId)?.token === token) storage?.removeItem(keyFor(profileId))
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
  return { enqueue, flush, pending, observe, raw, keyFor }
}
