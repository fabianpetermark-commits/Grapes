// Food writes are ordered per profile. The synchronous journal covers the gap
// between an edit and the end of its IndexedDB transaction when storage allows.
const PREFIX = 'grapes-food-pending-v1:'
const keyFor = profileId => PREFIX + encodeURIComponent(profileId)

export function createFoodSaveQueue({ save, storage = globalThis.localStorage, onStatus = () => {}, now = Date.now, randomId = () => crypto.randomUUID() }) {
  const tails = new Map()
  const latest = new Map()

  function pending(profileId, stored = null) {
    const raw = storage?.getItem(keyFor(profileId))
    if (!raw) return null
    let item
    try { item = JSON.parse(raw) } catch { throw new Error('A Food függő mentése sérült; az eredeti adatot nem töröltük.') }
    if (item?.version !== 1 || item.profileId !== profileId || item.data?.profile?.id !== profileId || !item.token) {
      throw new Error('A Food függő mentése nem ehhez a profilhoz tartozik; az eredeti adatot nem töröltük.')
    }
    if (stored?.saveToken === item.token) {
      try { storage.removeItem(keyFor(profileId)) } catch {}
      return null
    }
    if (stored?.updatedAt && Date.parse(stored.updatedAt) > item.recordedAt) {
      throw new Error('A Food helyreállító másolata eltér egy újabb helyi mentéstől; az eredeti adatokat nem írtuk felül.')
    }
    return item
  }

  function enqueue({ data, fileId = null, driveVersion = null, driveWriteId = null, module = 'Ételnapló', name = 'Ételnapló' }) {
    const snapshot = structuredClone(data)
    const profileId = snapshot?.profile?.id
    if (!profileId) throw new Error('A Food mentéséhez profilazonosító szükséges.')
    const token = randomId()
    const record = { id: `food-tracker-${profileId}`, module, name, data: snapshot, driveFileId: fileId, driveVersion, driveWriteId, saveToken: token }
    const item = { version: 1, profileId, token, recordedAt: now(), fileId, driveVersion, driveWriteId, data: snapshot }
    latest.set(profileId, token)
    onStatus(profileId, 'pending')
    try { storage?.setItem(keyFor(profileId), JSON.stringify(item)) }
    catch (error) { onStatus(profileId, 'journal-failed', error) }
    const task = (tails.get(profileId) || Promise.resolve()).catch(() => {}).then(async () => {
      await save(record)
      try {
        if (pending(profileId)?.token === token) storage?.removeItem(keyFor(profileId))
      } catch { /* Keep damaged journal bytes for manual recovery. */ }
      if (latest.get(profileId) === token) onStatus(profileId, 'saved')
      return record
    }).catch(error => {
      if (latest.get(profileId) === token) onStatus(profileId, 'failed', error)
      throw error
    })
    tails.set(profileId, task)
    return task
  }

  function flush(profileId) { return tails.get(profileId) || Promise.resolve() }
  return { enqueue, flush, pending, keyFor }
}
