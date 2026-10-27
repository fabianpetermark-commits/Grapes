import { openHomeFamilyNativeGateway } from './home-family-native.js'
import { createHomeFamilyOutbox } from './home-family-outbox.js'

/**
 * Native TEST Supabase Home transport. Never constructs a JS bearer or uses
 * the live PROD project. Android's QA-gated TestSupabaseProxy authenticates
 * before and after every RPC; the app origin sees only verified user UUIDs.
 *
 * This bridges the already proved v2 CAS and owner-bound IndexedDB outbox
 * to the approved ONE Home widgets. It never touches local personal v1.
 */
export async function openOneHomeNativeTestSync({
  enabled = false,
  nativeGatewayFactory = openHomeFamilyNativeGateway,
  outboxFactory = createHomeFamilyOutbox,
} = {}) {
  if (!enabled) throw new Error('A külön natív TEST Home-kapu nincs engedélyezve.')
  const native = await nativeGatewayFactory({ enabled:true })
  if (!native?.ownerId || !native?.gateway?.list ||
      typeof native?.assertActiveOwner !== 'function')
    throw new Error('A családi TEST-fiók nem igazolható.')
  const owner = native.ownerId
  const gate = native.gateway
  const outbox = outboxFactory({
    ownerId:owner,
    getActiveOwner:native.assertActiveOwner,
    gateway:gate,
  })
  return Object.freeze({
    ownerId:owner,
    assertActiveOwner:native.assertActiveOwner,
    async households() {
      await native.assertActiveOwner()
      const rows = await gate.list()
      await native.assertActiveOwner()
      return rows
    },
    sync:Object.freeze({
      ownerId:owner,
      pending:householdId => outbox.list(householdId),
      cached:householdId => outbox.cached(householdId),
      refresh:householdId => outbox.refresh(householdId),
      async queue(householdId,command) {
        // IndexedDB persists a stable operationId BEFORE any network request.
        // No speculative writes to local v1.
        await native.assertActiveOwner()
        return outbox.enqueue(householdId,command)
      },
      async retry(householdId) {
        await native.assertActiveOwner()
        return outbox.retry(householdId)
      },
    }),
  })
}
