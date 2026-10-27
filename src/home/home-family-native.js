import { getAndroidTestAuthSubject, isGrapesAndroidApp, requestAndroidTestSupabase } from '../android-test-home-bridge.js'
import { createFamilyHomeGateway } from './home-family-gateway.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FAMILY_RPC = new Set([
  'home_m3b_create_household', 'home_m3b_list_households', 'home_m3b_read_household',
  'home_m3b_create_invite', 'home_m3b_accept_invite', 'home_m3b_revoke_invite',
  'home_m3b_remove_member', 'home_m3b_leave_household',
  'home_m3b_compare_and_swap', 'home_m3b_read_attempt',
])

/**
 * The APP WebView never receives, persists, parses or refreshes a bearer JWT.
 * Only the isolated native Auth page may authorize the Kotlin proxy.
 * A QA build explicitly enabled at BOTH native and JS gates may call this.
 */
export async function openHomeFamilyNativeGateway({
  enabled = false,
  isAndroid = isGrapesAndroidApp(),
  getSubject = getAndroidTestAuthSubject,
  nativeRpc = requestAndroidTestSupabase,
} = {}) {
  if (!enabled || !isAndroid) throw new Error('A családi felhőkapcsolat csak a külön engedélyezett Android TEST buildben érhető el.')
  const subject = await getSubject()
  if (!UUID.test(subject || '')) throw new Error('A natív Grapes-fiókazonosító hiányzik.')
  const owner = subject.toLowerCase()
  const client = {
    auth: {
      // The native proxy rechecks the short-lived bearer against Supabase
      // /auth/v1/user. The app receives ONLY its authenticated UUID.
      async getUser() {
        const verified = await nativeRpc('supabaseTestWhoAmI')
        if (!UUID.test(verified || '')) throw new Error('A natív fiók nem hitelesíthető.')
        return { data: { user: { id: verified.toLowerCase(), is_anonymous: false } } }
      },
    },
    async rpc(name, params) {
      if (!FAMILY_RPC.has(name)) throw new Error('Nem engedélyezett családi Supabase-művelet.')
      const response = await nativeRpc('supabaseTestRpc', name, params)
      // Native proxy returns RPC JSON. Never interpret an error as successful
      // output; malformed responses fail closed.
      if (typeof response !== 'string' || response.length > 1100000)
        throw new Error('Érvénytelen natív családi válasz.')
      return { data: JSON.parse(response) }
    },
  }
  const gateway = createFamilyHomeGateway(client, owner)
  await gateway.verify()
  return Object.freeze({
    ownerId: owner,
    gateway,
    // Local native gate identity works offline after a previously verified
    // login; never substitute it for a remotely authenticated RPC.
    async assertActiveOwner() {
      const local = await getSubject()
      if (local?.toLowerCase() !== owner) throw new Error('A Grapes-fiók megváltozott.')
      return owner
    },
  })
}
