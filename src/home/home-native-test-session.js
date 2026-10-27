import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject,
  isGrapesAndroidApp, requestAndroidTestSupabase,
} from '../android-bridge.js'
import { createOneHomeTestSync } from './home-one-test-sync.js'
import { HOME_SUPABASE_TEST_REF } from './home-supabase-test-readonly.js'

const URL = 'https://' + HOME_SUPABASE_TEST_REF + '.supabase.co'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const METHODS=new Set([
  'home_m3b_list_households','home_m3b_read_household',
  'home_m3b_compare_and_swap','home_m3b_read_attempt',
])
const fail = message => { throw new Error(message) }

/**
 * Real Android TEST client adapter. Supabase tokens never leave Kotlin.
 * Only an APP-owned, previously verified native Auth session can execute
 * the fixed API RPC allowlist through the pinned TEST project.
 *
 * This is not imported by the PROD Home unless all runtime/test gates match.
 */
export async function openAndroidOneHomeTestSession({
  enabled=false,
  android=isGrapesAndroidApp(),
  nativeEnabled=getAndroidTestAuthEnabled,
  getSubject=getAndroidTestAuthSubject,
  nativeRpc=requestAndroidTestSupabase,
  indexedDb=globalThis.indexedDB,
} = {}) {
  if (!enabled || !android) fail('A családi TEST mód külön Android-buildet igényel.')
  if (await nativeEnabled() !== true) fail('A natív Grapes TEST-fiók nincs aktiválva.')
  const subject = await getSubject()
  if (!UUID.test(subject || '')) fail('Érvénytelen natív Grapes-fiókazonosító.')
  const expectedUserId=subject.toLowerCase()
  const checked = async () => {
    const who=await nativeRpc('supabaseTestWhoAmI')
    if (!UUID.test(who || '') || who.toLowerCase()!==expectedUserId)
      fail('Fiókváltás történt: a TEST családi munkamenet megszakadt.')
    return expectedUserId
  }
  await checked()
  const client=Object.freeze({
    supabaseUrl:URL,
    auth: Object.freeze({
      async getUser() {
        const id=await checked()
        return {data:{user:{id,is_anonymous:false}}}
      },
    }),
    schema(schema) {
      if (schema!=='api') fail('Érvénytelen Grapes családi API-séma.')
      return Object.freeze({
        async rpc(name,args) {
          if (!METHODS.has(name)) fail('Tiltott családi adatművelet.')
          const raw=await nativeRpc('supabaseTestRpc',name,args||{})
          if (typeof raw!=='string' || raw.length>1100000)
            fail('Érvénytelen natív családi RPC-válasz.')
          let data
          try { data=JSON.parse(raw) }
          catch { fail('A családi RPC-válasz nem ellenőrizhető.') }
          await checked()
          return {data}
        },
      })
    },
  })
  const sync=createOneHomeTestSync({
    client, expectedUserId, getActiveOwner:getSubject,
    indexedDb, testGateEnabled:true,testCasWritesEnabled:true,
  })
  const households=await sync.list()
  if (!Array.isArray(households) || households.length>100)
    fail('A családi Otthonok listája nem ellenőrizhető.')
  return Object.freeze({
    expectedUserId,
    households:Object.freeze(households.map(({householdId,name,role,revision})=>
      Object.freeze({householdId,name,role,revision}))),
    getActiveOwner:getSubject,
    sync,
    // Selected ONLY after the user explicitly identifies the household
    // when more than one membership exists; never default to the first.
    chooseHousehold(householdId) {
      const home=households.find(h=>h.householdId===householdId)
      if (!home) fail('A kiválasztott családi Otthon nem hozzáférhető.')
      return Object.freeze({
        enabled:true,writesEnabled:true,
        sync,householdId:home.householdId,expectedUserId,getActiveOwner:getSubject,
      })
    },
  })
}
