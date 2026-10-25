import { createGrapesTestOwnerFinanceRepository } from './grapes-test-native-owner-qa.js'

const MODULE = 'Pénzügyi Napló'
const NAME = 'Pénzügyi napló'
const safeCopy = value => structuredClone(value)

/**
 * Real Finance UI adapter (TEST-only, default OFF in the app).
 * Its native-Auth-pinned repository never accesses finance-tracker-current,
 * never associates a Google Drive user with Grapes Auth, and never merges
 * the old shared local project. Revision CAS serializes all local writes;
 * an error poisons the session instead of silently overwriting new data.
 */
export async function openGrapesTestLiveFinance({
  enabled = false,
  repositoryFactory = createGrapesTestOwnerFinanceRepository,
  ...dependencies
} = {}) {
  if (!enabled) throw new Error('A fiókhoz kötött Finance TEST-mód nem aktív.')
  const repository = await repositoryFactory({ enabled: true, ...dependencies })
  let revision = null
  let pending = Promise.resolve()
  const safetyRevisions = new Map()
  let failed = null

  async function read() {
    await pending
    const row = await repository.load()
    if (row && (row.id !== 'finance-current' || row.data?.module !== MODULE ||
        !row.data?.data || typeof row.data.data !== 'object')) {
      throw new Error('A fiókhoz kötött Finance-rekord nem megfelelő.')
    }
    revision = row?.revision || 0
    return row ? safeCopy(row.data.data) : null
  }

  function save(data) {
    // Snapshot at the instant a user action requests save, not later when
    // an async queue happens to run (e.g. after account switching).
    const snapshot = safeCopy(data)
    if (revision === null) return Promise.reject(new Error('A Finance-fiók még nem töltődött be.'))
    if (failed) return Promise.reject(failed)
    pending = pending.then(async () => {
      if (failed) throw failed
      try {
        const response = await repository.save({
          module: MODULE, name: NAME, data: snapshot,
          updatedAt: new Date().toISOString(),
        }, revision)
        revision = response.revision
        return response
      } catch (error) {
        failed = error
        throw error
      }
    })
    return pending
  }

  async function assertOwner() {
    if (failed) throw failed
    await pending
    // This check is performed using the pinned, validated native subject
    // even when there is no current Finance document yet.
    await repository.load()
  }

  async function saveSafety(kind, snapshot) {
    await assertOwner()
    if (!['last-delete', 'before-restore'].includes(kind)) {
      throw new Error('Érvénytelen Finance-mentési cél.')
    }
    const old = await repository.loadSafety(kind)
    const result = await repository.saveSafety(kind, {
      module: MODULE, name: NAME, data: safeCopy(snapshot),
    }, old?.revision || 0)
    safetyRevisions.set(kind, result.revision)
    return result
  }

  async function loadSafety(kind) {
    await assertOwner()
    const row = await repository.loadSafety(kind)
    if (row && (row.data?.module !== MODULE || !row.data?.data)) {
      throw new Error('A Finance biztonsági mentése nem ellenőrizhető.')
    }
    return row ? safeCopy(row.data.data) : null
  }

  return Object.freeze({ read, save, saveSafety, loadSafety, assertOwner })
}
