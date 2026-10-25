import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from './grapes-test-local-owner-store.js'

const QA_FOOD_ID = 'qa-food-owner-v1'
const QA_FINANCE_ID = 'qa-finance-owner-v1'
const QA_FIXTURE = 'grapes-test-local-owner-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const records = Object.freeze([
  Object.freeze({ id: QA_FOOD_ID, type: 'food' }),
  Object.freeze({ id: QA_FINANCE_ID, type: 'finance' }),
])

function identity(subject) {
  if (typeof subject !== 'string' || !UUID.test(subject)) {
    throw new Error('A TEST-fiók azonosítója nem ellenőrizhető.')
  }
  return subject.toLowerCase()
}

function expected({ id, type }, owner) {
  return { fixture: QA_FIXTURE, syntheticQA: true, type, userId: owner,
    label: 'Grapes TEST – csak mesterséges helyi adat', id }
}

function assertSynthetic(row, item, user) {
  if (!row || row.ownerId !== user || row.revision !== 1 ||
      JSON.stringify(row.data) !== JSON.stringify(expected(item, user))) {
    throw new Error('A fiók saját helyi TEST-rekordja hiányzik vagy eltér.')
  }
}

// IMPORTANT: this is deliberately separate from legacy Finance and Food.
// It never reads or writes old local project IDs and never auto-claims them.
// No real user data, Google Drive operations, remote Supabase writes or HTTP.
export function createGrapesTestNativeOwnerTrial({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  async function session() {
    if (enabled !== true || !isAndroid() || !(await authEnabled())) {
      throw new Error('A natív helyi fiók TEST-próbája nincs engedélyezve.')
    }
    const user = identity(await getSubject())
    const store = createGrapesTestLocalOwnerStore({
      enabled: true, indexedDb, getVerifiedSubject: getSubject,
    })
    return { user, store }
  }
  return Object.freeze({
    async prepare() {
      const { user, store } = await session()
      let created = 0
      for (const item of records) {
        const existing = await store.read(item.id)
        if (existing) {
          assertSynthetic(existing, item, user)
          continue
        }
        await store.save({ id: item.id, data: expected(item, user), expectedRevision: 0 })
        created++
      }
      return { phase: 'prepared', created, ownerVerified: true }
    },
    async readBack() {
      const { user, store } = await session()
      for (const item of records) {
        assertSynthetic(await store.read(item.id), item, user)
      }
      const all = await store.list()
      // A user's future legitimate owner-scoped Finance records may coexist.
      // Require exactly the two QA identifiers, without exposing other records.
      const qaRows = all.filter(row => row.id.startsWith('qa-'))
      if (qaRows.length !== records.length) {
        throw new Error('A fióktárhely mesterséges próbarekordjai nem ellenőrizhetők.')
      }
      for (const item of records) {
        const entry = qaRows.find(row => row.id === item.id)
        assertSynthetic(entry, item, user)
      }
      return { phase: 'readback-verified', records: records.length, ownerVerified: true }
    },
  })
}

// Future Finance integration entrypoint; no normal Finance module imports it.
// Never fall back to the legacy global finance-tracker-current project.
export function createGrapesTestOwnerFinanceRepository({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  const gate = async () => {
    if (enabled !== true || !isAndroid() || !(await authEnabled())) {
      throw new Error('A hitelesített Finance TEST-tárhely nincs engedélyezve.')
    }
    return createGrapesTestLocalOwnerStore({
      enabled: true, indexedDb, getVerifiedSubject: getSubject,
    })
  }
  const id = 'finance-current'
  return Object.freeze({
    async load() {
      const store = await gate()
      return store.read(id)
    },
    async save(data, expectedRevision = 0) {
      const store = await gate()
      return store.save({ id, data, expectedRevision })
    },
    async list() {
      const store = await gate()
      const finance = await store.read(id)
      return finance ? [finance] : []
    },
  })
}
