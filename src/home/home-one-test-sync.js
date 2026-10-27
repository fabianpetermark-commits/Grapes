import { createFamilyHomeGateway } from './home-family-gateway.js'
import { createHomeFamilyOutbox } from './home-family-outbox.js'
import { HOME_SUPABASE_TEST_REF } from './home-supabase-test-readonly.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_URL = 'https://' + HOME_SUPABASE_TEST_REF + '.supabase.co'
const READ_RPC = new Set([
  'home_m3b_list_households', 'home_m3b_read_household',
  'home_m3b_read_attempt',
])
const WRITE_RPC = 'home_m3b_compare_and_swap'
const fail = message => { throw new Error(message) }

/**
 * Isolated Grapes TEST family CAS capability.
 *
 * This module is deliberately NEVER imported by the PROD Home UI.
 * Existing local v1 data is never migrated, erased or auto-merged.
 * The separate shared v2 model and durable IndexedDB outbox are reused
 * from tested M3/B, without the deprecated personal/shared UI switch.
 *
 * caller provides a real Supabase JS session-bound client, not an
 * Android UUID as authentication. Production WebView cannot pass bearer
 * tokens to this module; a separate audited native token gateway must
 * be supplied before the release flag can ever be enabled.
 */
export function createOneHomeTestSync({
  client,
  expectedUserId,
  getActiveOwner,
  indexedDb = globalThis.indexedDB,
  testGateEnabled = false,
  testCasWritesEnabled = false,
} = {}) {
  if (!testGateEnabled || client?.supabaseUrl !== TEST_URL)
    fail('A családi Otthon CAS-kapu kizárólag a Grapes TEST projekten engedélyezett.')
  if (typeof client?.auth?.getUser !== 'function' ||
      typeof client?.schema !== 'function' ||
      typeof getActiveOwner !== 'function')
    fail('Hiányzó hitelesített TEST kliens vagy natív tulajdonosellenőrzés.')
  if (!UUID.test(expectedUserId || '')) fail('Hiányzó biztonságos Grapes-fiókazonosító.')
  const owner = expectedUserId.toLowerCase()

  // Explicit allowlist; no silent household creation, invite, role change,
  // member deletion, or personal document RPC from the sync layer.
  const scopedClient = Object.freeze({
    auth: client.auth,
    rpc(name, params) {
      if (!READ_RPC.has(name) && name !== WRITE_RPC)
        fail('Nem engedélyezett Home RPC.')
      if (name === WRITE_RPC && !testCasWritesEnabled)
        fail('A TEST családi írás külön engedélyezése szükséges.')
      return client.schema('api').rpc(name, params)
    },
  })
  const gateway = createFamilyHomeGateway(scopedClient, owner)
  const activeOwner = async () => {
    const id = await getActiveOwner()
    if (typeof id !== 'string' || id.toLowerCase() !== owner)
      fail('Fiókváltás történt: a régi Otthon-javaslat nem használható.')
    return owner
  }
  const outbox = createHomeFamilyOutbox({
    ownerId: owner, getActiveOwner: activeOwner, gateway, indexedDb,
  })
  const enabledForWrite = () => {
    if (!testCasWritesEnabled)
      fail('A családi TEST módosítások külön engedély nélkül tiltottak.')
  }
  return Object.freeze({
    ownerId: owner,
    list: () => gateway.list(),
    read: householdId => gateway.read(householdId),
    cached: householdId => outbox.cached(householdId),
    pending: householdId => outbox.list(householdId),
    refresh: householdId => outbox.refresh(householdId),
    async queue(householdId, command) {
      enabledForWrite()
      await activeOwner()
      // The durable outbox requires a previously authenticated, owner-bound
      // snapshot from refresh(). Its native owner pin is checked locally so
      // queuing can work OFFLINE. No remote write occurs until retry(), when
      // gateway.verify() revalidates the authenticated user with Supabase.
      return outbox.enqueue(householdId, command)
    },
    async retry(householdId) {
      enabledForWrite()
      await activeOwner()
      // Outbox retains the SAME operationId/candidate when network is lost,
      // and verifies read_attempt before marking a commit.
      return outbox.retry(householdId)
    },
  })
}
