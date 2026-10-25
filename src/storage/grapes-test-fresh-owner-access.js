import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from './grapes-test-local-owner-store.js'

// TEST-only opt-in routing gate for NEW empty owner partitions. This never
// imports legacy project rows, never claims ownership, never touches PROD.
const SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createGrapesTestFreshOwnerAccess({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  async function verifiedSubject() {
    if (enabled !== true || !isAndroid() || !(await authEnabled())) {
      throw new Error('A külön fiókos Grapes TEST-tárhely nem aktív.')
    }
    const subject = await getSubject()
    if (typeof subject !== 'string' || !SUBJECT.test(subject)) {
      throw new Error('A Grapes TEST-fiókazonosító nem ellenőrizhető.')
    }
    return subject.toLowerCase()
  }
  function store() {
    return createGrapesTestLocalOwnerStore({
      enabled: true, indexedDb, getVerifiedSubject: verifiedSubject,
    })
  }
  return Object.freeze({
    verifiedSubject,
    async listOwnedProjects() {
      // Native login and subject are rechecked inside owner store, before
      // and after querying IndexedDB. Unknown and QA records are NOT
      // presented as ordinary user projects.
      const rows = await store().list()
      return rows.filter(row =>
        row.id === 'finance-current' && row.data?.module === 'Pénzügyi Napló')
        .map(row => ({
          id: row.id, module: 'finance', folder: 'Pénzügyi Napló',
          name: row.data.name || 'Pénzügyi napló', icon: 'finance',
          updatedAt: row.data.updatedAt || '', ownerId: row.ownerId,
        }))
    },
    async ownedUsage() {
      const rows = await store().list()
      const projects = rows.filter(row => !row.id.startsWith('qa-') &&
        row.id === 'finance-current' && row.data?.module === 'Pénzügyi Napló')
      return {
        projects: projects.length,
        // Estimate only this owner's partition. navigator.storage.estimate()
        // counts all same-origin data (including other users/legacy).
        bytes: new TextEncoder().encode(JSON.stringify(projects)).byteLength,
        pending: projects.filter(row => row.data?.syncState?.localDirty).length,
      }
    },
  })
}
