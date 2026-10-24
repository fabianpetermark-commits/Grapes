import { openGrapesTestNativeFoundation } from './grapes-test-native-client.js'

// Exactly one isolated synthetic Food row, never the user's real Food store.
// Nothing invokes the network automatically: preparation, save, and readback
// require three separate user actions on the QA-only Settings panel.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE = /^grapes:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_PREFIX = 'grapes-test-synthetic-food-trial-v1:'
const CANDIDATE = Object.freeze({
  syntheticQA: true,
  fixture: 'grapes-test-food-one-entry-v1',
  label: 'Grapes TEST – mesterséges próbaétel',
  grams: 100,
  kcal: 123,
})

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function storedPointer(row, owner) {
  if (!row || row.version !== 1 || row.userId !== owner ||
      !PROFILE.test(row.profileId || '') || !UUID.test(row.operationId || '') ||
      row.recordId !== 'qa-food-' + row.operationId) {
    throw new Error('A korábbi TEST-próba azonosítója sérült; nem hozok létre új rekordot.')
  }
  return row
}

// This local pointer is NOT the data journal. Existing IndexedDB outbox owns
// the candidate and its immutable operation ID, including after a restart.
export function createGrapesTestSyntheticFoodTrial({
  enabled = false,
  openFoundation = openGrapesTestNativeFoundation,
  storage = globalThis.localStorage,
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) {
  async function connection() {
    if (enabled !== true) throw new Error('A szintetikus Food TEST-próba ki van kapcsolva.')
    if (!storage?.getItem || !storage?.setItem) throw new Error('A TEST-próba helyi tárolója nem elérhető.')
    const api = await openFoundation()
    if (!UUID.test(api?.subject || '') || !api?.gateway?.createProfile ||
        !api.gateway.read || !api?.outbox?.enqueue || !api.outbox.list || !api.outbox.retry) {
      throw new Error('A natív TEST-adatkapu vagy az offline sor nem ellenőrizhető.')
    }
    const owner = api.subject.toLowerCase()
    return { api, owner, key: KEY_PREFIX + owner }
  }

  function pointer({ owner, key }) {
    const raw = storage.getItem(key)
    if (raw === null) return null
    let row
    try { row = JSON.parse(raw) } catch { /* corrupt pointer fails closed */ }
    return storedPointer(row, owner)
  }

  async function currentJob(api, row) {
    const entries = await api.outbox.list(row.profileId)
    const matches = entries.filter(item => item.operationId === row.operationId)
    if (entries.length !== 1 || matches.length !== 1 ||
        matches[0].userId !== row.userId || matches[0].recordId !== row.recordId ||
        matches[0].kind !== 'food_diary' || matches[0].expectedRevision !== 0 ||
        matches[0].schemaVersion !== 1 || stable(matches[0].candidate) !== stable(CANDIDATE)) {
      throw new Error('A szintetikus TEST-művelet nem egyezik a tartós offline sorral.')
    }
    return matches[0]
  }

  return Object.freeze({
    async prepare() {
      const context = await connection()
      let row = pointer(context)
      if (!row) {
        // Explicit online preparation: a new server-owned profile guarantees
        // that no preexisting Food record or profile will be touched.
        const profileId = await context.api.gateway.createProfile()
        if (!PROFILE.test(profileId || '')) throw new Error('A külön TEST-profil létrehozása nem igazolható.')
        const operationId = randomUUID().toLowerCase()
        if (!UUID.test(operationId)) throw new Error('A műveletazonosító nem ellenőrizhető.')
        row = { version: 1, userId: context.owner, profileId, operationId,
          recordId: 'qa-food-' + operationId }
        // Preserve identity before enqueue; never auto-create a second profile
        // when a subsequent IndexedDB operation fails.
        storage.setItem(context.key, JSON.stringify(row))
      }
      await context.api.outbox.enqueue({ profileId: row.profileId, kind: 'food_diary',
        recordId: row.recordId, operationId: row.operationId, expectedRevision: 0,
        schemaVersion: 1, candidate: CANDIDATE })
      const job = await currentJob(context.api, row)
      return { phase: 'prepared', status: job.status, operationId: row.operationId }
    },
    async save() {
      const context = await connection()
      const row = pointer(context)
      if (!row) throw new Error('Előbb készítsd elő az egyetlen szintetikus bejegyzést.')
      const before = await currentJob(context.api, row)
      if (before.status === 'pending') await context.api.outbox.retry(row.profileId)
      const after = await currentJob(context.api, row)
      if (after.status !== 'committed' || after.serverRevision !== 1) {
        throw new Error('A szerveroldali TEST-mentés nem igazolt; a jelölt megmaradt az offline sorban.')
      }
      // Only the immutable server attempt is verified here. Readback is separate.
      return { phase: 'saved', revision: after.serverRevision, operationId: row.operationId }
    },
    async readBack() {
      const context = await connection()
      const row = pointer(context)
      if (!row) throw new Error('Nincs előkészített szintetikus TEST-próba.')
      const job = await currentJob(context.api, row)
      if (job.status !== 'committed' || job.serverRevision !== 1) {
        throw new Error('A mentés még nincs igazolva, a visszaolvasás nem jelölhető sikeresnek.')
      }
      // Independently fetch the committed document from server, not the outbox.
      const remote = await context.api.gateway.read(row.profileId, 'food_diary', row.recordId)
      if (!remote || remote.profileId !== row.profileId || remote.kind !== 'food_diary' ||
          remote.recordId !== row.recordId || remote.revision !== job.serverRevision ||
          remote.schemaVersion !== 1 || stable(remote.payload) !== stable(CANDIDATE)) {
        throw new Error('A független szerveroldali Food-visszaolvasás eltér vagy hiányzik.')
      }
      return { phase: 'readback-verified', revision: remote.revision, operationId: row.operationId }
    },
  })
}
