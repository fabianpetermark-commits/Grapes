import { getAndroidTestAuthSubject, requestAndroidTestSupabase } from '../android-bridge.js'
import { createGrapesTestDocumentGateway } from './grapes-supabase-test-gateway.js'
import { createGrapesTestOutbox } from './grapes-test-outbox.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RPC = new Set(['create_profile', 'list_profiles', 'read_document', 'list_documents',
  'read_revision', 'list_revisions', 'read_attempt', 'compare_and_swap'])

/** Minimal SDK-compatible interface backed by native, memory-only Auth. */
export function createGrapesTestNativeClient({ subject, request = requestAndroidTestSupabase } = {}) {
  if (!UUID.test(subject || '') || typeof request !== 'function') throw new Error('Érvénytelen TEST-fiók.')
  const owner = subject.toLowerCase()
  return Object.freeze({
    auth: Object.freeze({
      async getUser() {
        const id = await request('supabaseTestWhoAmI')
        if (!UUID.test(id || '') || id.toLowerCase() !== owner) {
          throw new Error('A TEST-fiók időközben megváltozott.')
        }
        return { data: { user: { id: owner, is_anonymous: false } }, error: null }
      },
    }),
    async rpc(name, params) {
      if (!RPC.has(name) || !params || typeof params !== 'object') {
        throw new Error('Nem engedélyezett TEST-adatművelet.')
      }
      const raw = await request('supabaseTestRpc', name, params)
      return { data: JSON.parse(raw), error: null, status: 200 }
    },
  })
}

// Not imported by the current Food/Water/Health UI. A future QA action can
// explicitly call this after a verified native login and feature flag check.
export async function openGrapesTestNativeFoundation({
  getSubject = getAndroidTestAuthSubject, request = requestAndroidTestSupabase,
  indexedDb = globalThis.indexedDB,
} = {}) {
  const subject = await getSubject()
  const client = createGrapesTestNativeClient({ subject, request })
  const { data } = await client.auth.getUser()
  const gateway = createGrapesTestDocumentGateway(client, data.user.id)
  const outbox = createGrapesTestOutbox({ indexedDb, userId: data.user.id, gateway })
  return Object.freeze({ subject: data.user.id, gateway, outbox })
}
