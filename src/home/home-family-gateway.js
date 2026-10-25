import {
  createEmptyFamilyHome, stageFamilyHomeCommand,
  validateFamilyHome, inspectFamilyConflict,
} from './home-family-data.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (value, label = 'azonosító') => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Érvénytelen ${label}.`)
  return value.toLowerCase()
}
const codePattern = /^[0-9a-f]{64}$/
const roles = new Set(['owner', 'editor', 'viewer'])

/**
 * TEST ONLY; authenticated Supabase client injection, no Android UUID-as-token.
 * The hosted SQL and the Android short-lived Supabase Auth handoff are NOT
 * activated here. Individual Home and Food/Finance stay untouched.
 */
export function createFamilyHomeGateway(client, expectedUserId) {
  if (!client?.auth?.getUser || typeof client.rpc !== 'function')
    throw new Error('Supabase Auth munkamenet nem áll rendelkezésre.')
  const actor = uuid(expectedUserId, 'felhasználóazonosító')
  let stale = false
  async function verify() {
    if (stale) throw new Error('Ez a családi Home-munkamenet már érvénytelen.')
    let response
    try { response = await client.auth.getUser() }
    catch { stale = true; throw new Error('A családi Home-hitelesítés nem ellenőrizhető.') }
    const subject = response?.data?.user?.id
    if (response?.error || !subject || subject.toLowerCase() !== actor ||
        response.data.user.is_anonymous === true) {
      stale = true
      throw new Error('A Grapes-fiók megváltozott; a megosztott Home hozzáférése megszakadt.')
    }
    return actor
  }
  async function rpc(name, params) {
    await verify()
    let response
    try { response = await client.rpc(name, params) }
    catch { throw new Error('A hálózati művelet eredménye bizonytalan. Ugyanazzal az azonosítóval próbáld újra; ne írj felül semmit.') }
    // Never expose A's response after a switch to B during a pending RPC.
    await verify()
    if (response?.error || response?.status >= 400)
      throw new Error('A közös Home művelete sikertelen; az eredeti helyi javaslat megmarad.')
    return response?.data
  }
  const expectedHousehold = id => uuid(id, 'háztartásazonosító')
  return Object.freeze({
    get actorId() { return actor },
    verify,
    async create(name) {
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100)
        throw new Error('A háztartás neve 1–100 karakter lehet.')
      const data = await rpc('home_m3b_create_household', {p_name:name.trim()})
      if (!data || !UUID.test(data.householdId || '') || data.role !== 'owner' || data.revision !== 0)
        throw new Error('A családi háztartás létrehozása nem igazolható.')
      const initial = createEmptyFamilyHome(data.householdId, actor)
      return { ...data, initial }
    },
    async createInvite(householdId, role = 'editor', hours = 48) {
      const id = expectedHousehold(householdId)
      if (!['editor','viewer'].includes(role) || !Number.isSafeInteger(hours) || hours < 1 || hours > 168)
        throw new Error('Érvénytelen családi meghívó.')
      const data = await rpc('home_m3b_create_invite',
        {p_household_id:id,p_role:role,p_hours:hours})
      if (!data || !codePattern.test(data.inviteCode || '') ||
          !UUID.test(data.inviteId || '')) throw new Error('A meghívó nem igazolható.')
      return data
    },
    async acceptInvite(inviteCode) {
      if (!codePattern.test(inviteCode || '')) throw new Error('Érvénytelen meghívókód.')
      const data = await rpc('home_m3b_accept_invite',{p_code:inviteCode})
      if (!data || !UUID.test(data.householdId || '') ||
          !['editor','viewer'].includes(data.role)) throw new Error('A családi meghívás nem igazolható.')
      return data
    },
    async list() {
      const data = await rpc('home_m3b_list_households', {})
      if (!Array.isArray(data) || data.some(x => !UUID.test(x.householdId || '') ||
          !roles.has(x.role) || !Number.isSafeInteger(x.revision)))
        throw new Error('A háztartáslista nem igazolható.')
      return data
    },
    async read(householdId) {
      const id=expectedHousehold(householdId)
      const result=await rpc('home_m3b_read_household',{p_household_id:id})
      if (!result || result.householdId !== id ||
          !roles.has(result.role) || !Number.isSafeInteger(result.revision) ||
          result.revision < 0) throw new Error('A közös Home-állapot nem ellenőrizhető.')
      const state=validateFamilyHome(result.state,id)
      if (state.revision !== result.revision)
        throw new Error('A közös Home-revízió és az események eltérnek.')
      return {householdId:id,role:result.role,revision:result.revision,state}
    },
    stage({current,command}) {
      if (!current || !roles.has(current.role) || current.state?.revision !== current.revision)
        throw new Error('A háztartás ellenőrzött helyi pillanatképe hiányzik.')
      return stageFamilyHomeCommand({state:current.state,householdId:current.householdId,
        actorId:actor,role:current.role,command})
    },
    async compareAndSwap(staged) {
      const id=expectedHousehold(staged?.householdId)
      uuid(staged?.operationId, 'műveletazonosító')
      if (!Number.isSafeInteger(staged.expectedRevision) || staged.expectedRevision < 0 ||
          staged.schemaVersion !== 2 || staged.candidate?.revision !== staged.expectedRevision+1)
        throw new Error('Sérült vagy ismételt szinkronjavaslat.')
      validateFamilyHome(staged.candidate,id)
      const data=await rpc('home_m3b_compare_and_swap',{p_household_id:id,
        p_operation_id:staged.operationId,p_expected_revision:staged.expectedRevision,
        p_candidate:staged.candidate})
      return inspectFamilyConflict(staged,data)
    },
    async removeMember(householdId, memberId) {
      return rpc('home_m3b_remove_member',{p_household_id:expectedHousehold(householdId),
        p_user_id:uuid(memberId,'családtagazonosító')})
    },
    async revokeInvite(householdId, inviteId) {
      return rpc('home_m3b_revoke_invite',{p_household_id:expectedHousehold(householdId),
        p_invite_id:uuid(inviteId,'meghívóazonosító')})
    },
    async leave(householdId) {
      return rpc('home_m3b_leave_household',{p_household_id:expectedHousehold(householdId)})
    },
  })
}
