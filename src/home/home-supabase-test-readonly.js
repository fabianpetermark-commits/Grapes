// Grapes Supabase TEST – authenticated One Home read-only gate.
// No local data migration; no RPC writes; not imported by PROD runtime.
// The caller must provide an *actual* Supabase session-bound client.
// A native user UUID by itself must never authorize network operations.

const TEST_REF = 'aighqtqjlzirlokxwupt'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validRole = new Set(['owner', 'editor', 'viewer'])
const cleanUuid = (id, label) => {
  if (!UUID.test(id || '')) throw new Error('Érvénytelen ' + label + '.')
  return id.toLowerCase()
}
const fail = text => { throw new Error(text) }

/**
 * The TEST remote projection is a separate versioned data model (v2).
 * Do not feed v2 directly to the PROD v1 event store or infer a shared
 * household from a localStorage key.
 */
export function createHomeTestReadOnlyGate({
  client, expectedUserId, projectRef, testGateEnabled = false,
} = {}) {
  if (!testGateEnabled || projectRef !== TEST_REF)
    fail('A családi Supabase-felderítés csak külön Grapes TEST-kapuban engedélyezett.')
  if (typeof client?.auth?.getUser !== 'function' || typeof client?.rpc !== 'function')
    fail('Hiányzó hitelesített Supabase TEST kliens.')
  // Do not trust only a caller-provided TEST label. Verify the real
  // Supabase JS client's own backend URL and prohibit redirected hosts.
  if (client?.supabaseUrl !== 'https://' + TEST_REF + '.supabase.co')
    fail('A Supabase kliens tényleges projektje nem a Grapes TEST.')
  const owner = cleanUuid(expectedUserId, 'Grapes-fiókazonosító')
  let invalid = false

  async function assertUser() {
    if (invalid) fail('A Grapes-fiók munkamenete már érvénytelen.')
    let response
    try { response = await client.auth.getUser() }
    catch { invalid = true; fail('A Grapes-fiók ellenőrzése sikertelen.') }
    const user = response?.data?.user
    if (response?.error || !user?.id || !UUID.test(user.id) ||
        user.id.toLowerCase() !== owner || user.is_anonymous === true) {
      invalid = true
      fail('Fiókváltás történt; a korábbi családi Home-adatokat nem adjuk vissza.')
    }
    return owner
  }
  async function readRpc(name, params) {
    await assertUser()
    let result
    try { result = await client.rpc(name, params) }
    catch { fail('A családi Home-visszaolvasás sikertelen; nem használható helyi másolat.') }
    // A response from user A must never be rendered after a switch to B.
    await assertUser()
    if (result?.error || !Object.hasOwn(result || {}, 'data'))
      fail('A családi Home-válasz nem igazolható.')
    return result.data
  }
  return Object.freeze({
    async list() {
      const data = await readRpc('home_m3b_list_households', {})
      if (!Array.isArray(data)) fail('Érvénytelen családi Otthon-lista.')
      return data.map(home => {
        if (!home || !UUID.test(home.householdId || '') ||
            !validRole.has(home.role) || !Number.isSafeInteger(home.revision) ||
            home.revision < 0 || typeof home.name !== 'string')
          fail('Érvénytelen családi Otthon-hivatkozás.')
        return Object.freeze({
          householdId: home.householdId.toLowerCase(),
          name: home.name,
          role: home.role,
          revision: home.revision,
        })
      })
    },
    async read(householdId) {
      const id = cleanUuid(householdId, 'Otthonazonosító')
      const data = await readRpc('home_m3b_read_household', {p_household_id:id})
      if (!data || data.householdId !== id ||
          !validRole.has(data.role) || !Number.isSafeInteger(data.revision))
        fail('A családi Otthon tulajdonosi és verzióadata nem igazolható.')
      const state = data.state
      if (!state || state.schemaVersion !== 2 ||
          state.householdId !== id || state.revision !== data.revision ||
          !Array.isArray(state.inventory) || !Array.isArray(state.shopping) ||
          !Array.isArray(state.events) || !Array.isArray(state.prepared) ||
          state.prepared.length || state.revision !== state.events.length ||
          !UUID.test(state.actorId || ''))
        fail('A távoli családi Home-séma eltér; automatikus összefésülés tilos.')
      if (state.inventory.some(x => x.householdId !== id ||
          x.sourceType !== 'manual' || x.sourceId != null) ||
          state.shopping.some(x => x.householdId !== id ||
          x.sourceType !== 'manual'))
        fail('Nem igazolt vagy idegen eredetű távoli Home-tétel.')
      // Read-only projection, not a direct reference to mutable RPC data.
      return Object.freeze({
        householdId:id,role:data.role,revision:data.revision,
        inventory:structuredClone(state.inventory),
        shopping:structuredClone(state.shopping),
      })
    },
    // Deliberately no create, invite, modify, merge or CAS methods.
  })
}

export const HOME_SUPABASE_TEST_REF = TEST_REF
