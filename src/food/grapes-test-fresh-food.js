import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from '../storage/grapes-test-local-owner-store.js'
import { createEmptyFoodProject, normalizeFoodProject } from './food-data.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = 'food-current'
const MODULE = 'Ételnapló'

/**
 * New-account Food storage, TEST-only, OFF in installed v28.
 *
 * Explicitly does NOT access global grapes-projects, profile IDs derived
 * from the unrelated Drive account, legacy Food backups or pending YAZIO
 * journals. External Health, YAZIO, Drive, shares and family libraries are
 * NOT routed through this adapter and must stay gated by callers.
 */
export async function openGrapesTestFreshFood({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  if (!enabled || !isAndroid() || !(await authEnabled())) {
    throw new Error('Az új Food-fióktárhely TEST-kapuja nem aktív.')
  }
  const subject = await getSubject()
  if (typeof subject !== 'string' || !UUID.test(subject)) {
    throw new Error('A natív Food TEST-fiók nem ellenőrizhető.')
  }
  const owner = subject.toLowerCase()
  let invalid = false
  let poisoned = null
  let revision = null
  let pending = Promise.resolve()

  async function verify() {
    if (invalid) throw new Error('A korábbi Food-munkamenet lejárt.')
    try {
      if (!(await authEnabled()) || (await getSubject())?.toLowerCase() !== owner) {
        throw new Error('A Grapes TEST-fiók megváltozott: a Food-művelet leállt.')
      }
    } catch (error) {
      invalid = true
      throw error
    }
    return owner
  }

  const store = createGrapesTestLocalOwnerStore({
    enabled: true, indexedDb, getVerifiedSubject: verify,
  })

  function ownedProject(data) {
    const safe = normalizeFoodProject(data, owner)
    if (safe.diaryEntries.some(entry => entry.profileId !== owner) ||
        safe.recipes.some(recipe => recipe.ownerProfileId && recipe.ownerProfileId !== owner)) {
      throw new Error('A Food-projekt idegen fiókbejegyzést tartalmaz.')
    }
    // Only explicit native-owner YAZIO file import batches are permitted.
    // Unrelated Drive shares, legacy claims and other batch sources stay blocked.
    if (safe.recipeLibraries.length || safe.sharingContacts.length ||
        safe.processedShareIds.length) {
      throw new Error('A Food-megosztások továbbra is zároltak a TEST-fiókban.')
    }
    const batchIds = new Set()
    for (const batch of safe.importBatches) {
      if (!batch || batch.source !== 'yazio' || batch.profileId !== owner ||
          typeof batch.id !== 'string' || !batch.id.startsWith('yazio-batch-') ||
          batchIds.has(batch.id) || !['completed', 'undone', 'partial-undo'].includes(batch.status) ||
          !Array.isArray(batch.recordIds) || !batch.entryFingerprints ||
          typeof batch.entryFingerprints !== 'object' ||
          Object.keys(batch.entryFingerprints).some(id => !batch.recordIds.includes(id))) {
        throw new Error('Idegen vagy érvénytelen Food importköteg a saját fiókban.')
      }
      batchIds.add(batch.id)
    }
    if (safe.diaryEntries.some(entry =>
      (entry.origin?.source === 'yazio' &&
        (entry.origin.profileId !== owner ||
         !batchIds.has(entry.origin.importBatchId))) ||
      (entry.origin?.profileId && entry.origin.profileId !== owner))) {
      throw new Error('A Food YAZIO-forrás vagy étkezés másik Grapes-fiókhoz tartozik.')
    }
    return safe
  }

  async function load() {
    if (poisoned) throw poisoned
    await pending
    await verify()
    const row = await store.read(ID)
    const profile = { id: owner, name: 'Grapes-felhasználó', email: '', photo: '' }
    const data = row ? ownedProject(row.data?.data) : createEmptyFoodProject(profile)
    if (row && (row.data?.module !== MODULE || row.id !== ID)) {
      throw new Error('A Food-fiók mentése nem megfelelő.')
    }
    revision = row?.revision || 0
    await verify()
    return structuredClone(data)
  }

  function save(data) {
    // Clone+validate before queuing, preventing stale screen mutation and
    // accidental insertion of imported foreign-profile records.
    if (poisoned) return Promise.reject(poisoned)
    if (revision === null) return Promise.reject(
      new Error('A Food-projektet mentés előtt be kell tölteni.'))
    let snapshot
    try { snapshot = ownedProject(structuredClone(data)) }
    catch (error) { return Promise.reject(error) }

    const operation = pending.then(async () => {
      if (poisoned) throw poisoned
      try {
        await verify()
        const result = await store.save({
          id: ID,
          data: { module: MODULE, name: 'Ételnapló', data: snapshot,
            updatedAt: new Date().toISOString() },
          expectedRevision: revision,
        })
        revision = result.revision
        await verify()
        return result
      } catch (error) {
        poisoned = error
        throw error
      }
    })
    // Keep the internal queue usable only when writes succeed, and don't
    // manufacture a recovered state on rejection.
    pending = operation
    return operation
  }

  async function flush() {
    if (poisoned) throw poisoned
    await pending
    return verify()
  }

  return Object.freeze({
    ownerId: owner,
    load, save, flush,
    async assertOwner() { await flush(); return verify() },
    async status() {
      await flush()
      return { ownerId: owner, revision: revision ?? 0, migrationAuthorized: false,
        cloudSyncEnabled: false }
    },
  })
}
