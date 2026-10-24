import { openGrapesTestNativeFoundation } from './grapes-test-native-client.js'
import { requestAndroidTestSupabase } from '../android-bridge.js'

// Read-only TEST QA gate. Deliberately inspects just the prior synthetic
// pointer; never reads the normal local Food diary, Health, Water or Drive.
const PREFIX = 'grapes-test-synthetic-food-trial-v1:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE = /^grapes:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_DENIAL = /\bHTTP (401|403)\b/

function foreignPointer(storage, currentUser) {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function' ||
      typeof storage.getItem !== 'function') {
    throw new Error('A helyi TEST-próbaazonosítók nem olvashatók.')
  }
  const found = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(PREFIX) || key === PREFIX + currentUser) continue
    let candidate
    try { candidate = JSON.parse(storage.getItem(key)) } catch {
      throw new Error('Sérült szintetikus TEST-próbaazonosító.')
    }
    if (!candidate || candidate.version !== 1 ||
        !UUID.test(candidate.userId || '') || candidate.userId.toLowerCase() === currentUser ||
        key !== PREFIX + candidate.userId.toLowerCase() ||
        !PROFILE.test(candidate.profileId || '') || !UUID.test(candidate.operationId || '') ||
        candidate.recordId !== 'qa-food-' + candidate.operationId) {
      throw new Error('Sérült vagy nem elkülöníthető TEST-próbaazonosító.')
    }
    found.push(candidate)
  }
  if (found.length !== 1) {
    throw new Error('Pontosan egy másik, korábban kipróbált TEST-fiók szükséges.')
  }
  return found[0]
}

export function createGrapesTestOnePhoneIsolationProbe({
  enabled = false,
  storage = globalThis.localStorage,
  openFoundation = openGrapesTestNativeFoundation,
  request = requestAndroidTestSupabase,
} = {}) {
  return Object.freeze({
    async verify() {
      if (enabled !== true) throw new Error('A külön kétfiókos TEST-ellenőrzés ki van kapcsolva.')
      const foundation = await openFoundation()
      const currentUser = foundation?.subject?.toLowerCase()
      if (!UUID.test(currentUser || '') || !foundation.gateway?.listProfiles ||
          !foundation.gateway?.readAttempt || typeof request !== 'function') {
        throw new Error('A hitelesített natív TEST-adatkapu nem ellenőrizhető.')
      }
      const foreign = foreignPointer(storage, currentUser)
      const profiles = await foundation.gateway.listProfiles()
      if (!Array.isArray(profiles) ||
          profiles.some(profile => profile.profileId === foreign.profileId)) {
        throw new Error('Az idegen TEST-profil megjelent a saját fióklistában.')
      }
      // The separate immutable attempt API returns NULL for a foreign user.
      // This is a successful authenticated roundtrip, not a network exception.
      const foreignAttempt = await foundation.gateway.readAttempt(foreign.operationId)
      if (foreignAttempt !== null) {
        throw new Error('Az idegen TEST-fiók mentési előzménye olvasható!')
      }
      async function mustDeny(rpc, params) {
        try {
          await request('supabaseTestRpc', rpc, params)
        } catch (error) {
          // A network failure, expired login or timeout MUST NOT count as
          // evidence of RLS denial. The native transport includes HTTP status.
          if (VALID_DENIAL.test(error?.message || '')) return
          throw new Error('A szerveroldali elutasítás nem bizonyított.')
        }
        throw new Error('Idegen TEST-adat lekérése engedélyezett!')
      }
      const key = { p_profile_id: foreign.profileId,
        p_kind: 'food_diary', p_record_id: foreign.recordId }
      await mustDeny('read_document', key)
      await mustDeny('read_revision', { ...key, p_revision: 1 })
      // A successful second authenticated read rules out a trivial offline
      // false positive between the two denied foreign profile requests.
      const after = await foundation.gateway.listProfiles()
      if (!Array.isArray(after) ||
          after.some(profile => profile.profileId === foreign.profileId)) {
        throw new Error('A fiókhatár utólag nem ellenőrizhető.')
      }
      return { phase: 'read-only-isolation-verified',
        checks: ['foreign-profile-hidden', 'foreign-attempt-hidden',
          'foreign-document-denied', 'foreign-revision-denied'] }
    },
  })
}
