// TEST-only document gateway. The caller must supply the existing Supabase Auth
// client from the isolated login origin. Nothing in the Health app imports this.
// A user UUID from the Android bridge is an identifier, never a credential.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE = /^grapes:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = new Set([
  'food', 'water', 'health', 'yazio', 'food_diary', 'food_custom',
  'food_recipe', 'food_recipe_ingredient', 'water_entry', 'yazio_import',
  'nutrient_goal', 'health_record',
])

export class GrapesTestSyncError extends Error {
  constructor(message) { super(message); this.name = 'GrapesTestSyncError' }
}

export function createGrapesTestDocumentGateway(client, expectedUserId) {
  if (!client?.auth?.getUser || !client?.rpc || !UUID.test(expectedUserId || '')) {
    throw new GrapesTestSyncError('Érvénytelen TEST-fiók vagy Supabase-kliens.')
  }
  const owner = expectedUserId.toLowerCase()
  async function verified() {
    let result
    try { result = await client.auth.getUser() }
    catch { throw new GrapesTestSyncError('A TEST-munkamenet nem ellenőrizhető.') }
    if (result?.error || !UUID.test(result?.data?.user?.id || '') ||
        result.data.user.id.toLowerCase() !== owner || result.data.user.is_anonymous) {
      throw new GrapesTestSyncError('A TEST-fiók megváltozott vagy kijelentkezett.')
    }
  }
  async function rpc(name, params) {
    await verified()
    let result
    try { result = await client.rpc(name, params, { head: false }) }
    catch { throw new GrapesTestSyncError('A Supabase-művelet eredménye nem ellenőrizhető; próbáld újra ugyanazzal a műveletazonosítóval.') }
    if (result?.error || result?.status >= 400) {
      throw new GrapesTestSyncError('A Supabase-művelet sikertelen; az eredeti helyi adatot őrizd meg.')
    }
    // A logout/account switch while the network call is pending invalidates
    // even a successful response for this gateway's original account.
    await verified()
    return result?.data
  }
  function recordKey(profileId, kind, recordId) {
    if (!PROFILE.test(profileId || '') || !KINDS.has(kind) ||
        typeof recordId !== 'string' || recordId.length < 1 || recordId.length > 200) {
      throw new GrapesTestSyncError('Érvénytelen profil vagy rekordazonosító.')
    }
    return { p_profile_id: profileId, p_kind: kind, p_record_id: recordId }
  }
  return Object.freeze({
    async createProfile() {
      const id = await rpc('create_profile', {})
      if (!PROFILE.test(id || '')) throw new GrapesTestSyncError('A profil létrehozása nem igazolható.')
      return id
    },
    async listProfiles() {
      const profiles = await rpc('list_profiles', {})
      if (!Array.isArray(profiles)) throw new GrapesTestSyncError('A profillista nem ellenőrizhető.')
      return profiles
    },
    async read(profileId, kind, recordId) {
      const data = await rpc('read_document', recordKey(profileId, kind, recordId))
      if (data !== null && (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
          data.profileId !== profileId || data.kind !== kind || data.recordId !== recordId)) {
        throw new GrapesTestSyncError('A rekordválasz nem ellenőrizhető.')
      }
      return data
    },
    async compareAndSwap({ profileId, kind, recordId, operationId, expectedRevision, schemaVersion, candidate }) {
      const key = recordKey(profileId, kind, recordId)
      if (!UUID.test(operationId || '') || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
          !Number.isSafeInteger(schemaVersion) || schemaVersion < 1 ||
          !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new GrapesTestSyncError('Érvénytelen CAS-művelet.')
      }
      const result = await rpc('compare_and_swap', {
        ...key, p_operation_id: operationId, p_expected_revision: expectedRevision,
        p_schema_version: schemaVersion, p_candidate: candidate,
      })
      if (!result || !['committed', 'conflict'].includes(result.status) ||
          !Number.isSafeInteger(result.revision) || result.revision < 0 ||
          (result.status === 'committed' && result.revision !== expectedRevision + 1) ||
          (result.status === 'conflict' && result.snapshotId !== operationId)) {
        throw new GrapesTestSyncError('A mentés eredménye nem igazolható; próbáld újra ugyanazzal a műveletazonosítóval.')
      }
      return result
    },
    async readAttempt(operationId) {
      if (!UUID.test(operationId || '')) throw new GrapesTestSyncError('Érvénytelen műveletazonosító.')
      return rpc('read_attempt', { p_operation_id: operationId })
    },
  })
}
