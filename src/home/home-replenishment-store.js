import { getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp } from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from '../storage/grapes-test-local-owner-store.js'
import { DEFAULT_SHOPPING_LIST_ID } from './home-replenishment.js'

const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_ID = /^[a-z0-9][a-z0-9-]{0,80}$/
const RECORD = 'home-replenishment-current'
const MODULE = 'HomeReplenishment'
const empty = ownerId => ({ module: MODULE, schemaVersion: 1, ownerId,
  lists: [{ id: DEFAULT_SHOPPING_LIST_ID, name: 'Bevásárlólista' }], dismissed: [] })
function check(state, ownerId) {
  if (!state || state.module !== MODULE || state.schemaVersion !== 1 ||
      state.ownerId !== ownerId || !Array.isArray(state.lists) ||
      !Array.isArray(state.dismissed) || state.lists.length < 1 ||
      state.lists.length > 100 || state.dismissed.length > 2000 ||
      state.lists[0].id !== DEFAULT_SHOPPING_LIST_ID ||
      new Set(state.lists.map(v=>v.id)).size !== state.lists.length ||
      state.lists.some(v=>!LIST_ID.test(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80) ||
      state.dismissed.some(v=>typeof v.key!=='string'||v.key.length>300||
        typeof v.cycleId!=='string'||v.cycleId.length>3000||
        !Number.isFinite(Date.parse(v.dismissedAt)))) {
    throw new Error('A Home javaslatok vagy listák tulajdonosi adatai sérültek. Nem írunk felül semmit.')
  }
  return structuredClone(state)
}

/** Independent owner-pinned IndexedDB metadata. No migration or modification
 * of personal Home, family Supabase, Food, Finance or Google Drive records. */
export async function openHomeReplenishmentStore({
  enabled = false, isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled, getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  if (!enabled || !isAndroid() || !(await authEnabled()))
    throw new Error('A személyes Home-javaslatok csak Android TEST alatt használhatók.')
  const subject = await getSubject()
  if (!OWNER.test(subject || '')) throw new Error('A Home tulajdonosa nem azonosítható.')
  const ownerId = subject.toLowerCase()
  let invalid = false
  async function verify() {
    if (invalid) throw new Error('A Home-javaslatok munkamenete érvénytelen.')
    if (!(await authEnabled()) || (await getSubject())?.toLowerCase() !== ownerId) {
      invalid = true
      throw new Error('Fiókváltás: a korábbi Home-javaslatok többé nem érhetők el.')
    }
    return ownerId
  }
  const store = createGrapesTestLocalOwnerStore({ enabled: true, indexedDb,
    getVerifiedSubject: verify })
  let revision = 0
  let state = empty(ownerId)
  let queue = Promise.resolve()
  let poisoned = null
  async function read() {
    await verify()
    const row = await store.read(RECORD)
    state = row ? check(row.data, ownerId) : empty(ownerId)
    revision = row?.revision || 0
    await verify()
    return structuredClone(state)
  }
  await read()
  async function mutate(callback) {
    const operation = queue.then(async () => {
      if (poisoned) throw poisoned
      await verify()
      const previous = await read()
      const updated = callback(previous)
      const validated = check(updated, ownerId)
      if (JSON.stringify(validated) === JSON.stringify(state)) return structuredClone(state)
      try {
        const saved = await store.save({ id: RECORD, expectedRevision: revision,
          data: validated })
        await verify()
        state = validated
        revision = saved.revision
        return structuredClone(state)
      } catch (error) { poisoned = error; throw error }
    })
    queue = operation.catch(() => {})
    return operation
  }
  return Object.freeze({
    ownerId,
    getState: () => structuredClone(state),
    async load() { await queue; return read() },
    async assertOwner() { await queue; await verify(); return ownerId },
    createList(name) {
      const label = String(name ?? '').trim().replace(/\\s+/g,' ')
      if (!label || label.length>80) throw new Error('Adj meg legfeljebb 80 karakteres listanevet.')
      return mutate(meta => {
        if(meta.lists.length>=100) throw new Error('Legfeljebb 100 lista hozható létre.')
        if(meta.lists.some(v=>v.name.toLocaleLowerCase('hu-HU')===label.toLocaleLowerCase('hu-HU')))
          throw new Error('Már van ilyen nevű bevásárlólista.')
        meta.lists.push({ id: 'list-'+globalThis.crypto.randomUUID().toLowerCase(), name: label })
        return meta
      })
    },
    dismiss({key,cycleId}) {
      if (typeof key !== 'string' || !key || key.length>300 ||
          typeof cycleId !== 'string' || !cycleId || cycleId.length>3000)
        throw new Error('Érvénytelen javaslat.')
      return mutate(meta => {
        if (!meta.dismissed.some(x=>x.key===key && x.cycleId===cycleId))
          meta.dismissed.push({key,cycleId,dismissedAt:new Date().toISOString()})
        return meta
      })
    },
    restore({key,cycleId}) {
      return mutate(meta => { meta.dismissed = meta.dismissed.filter(
        x=>!(x.key===key&&x.cycleId===cycleId)); return meta })
    }
  })
}
