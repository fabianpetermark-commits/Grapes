import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import {
  waterProfileKey, readProfileWater, writeProfileWater,
} from './water-profile-store.js'

// Fresh-account Water. Empty owner partition only: NEVER consults legacy
// 'grapes-water-v1' or invokes claimLegacyWater. Old shared bytes remain
// untouched. Pins owner at open time, rejects stale A -> B controllers.
export async function openGrapesTestFreshWater({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  storage = globalThis.localStorage,
} = {}) {
  if (enabled !== true || !isAndroid() || !(await authEnabled())) {
    throw new Error('A fiókonkénti Water TEST-tárhely nincs engedélyezve.')
  }
  const ownerId = await getSubject()
  const key = waterProfileKey(ownerId)
  let invalidated = false
  async function assertOwner() {
    if (invalidated) throw new Error('A korábbi Water-munkamenet már érvénytelen.')
    try {
      if (!(await authEnabled()) || (await getSubject())?.toLowerCase() !== ownerId.toLowerCase()) {
        throw new Error('A Grapes TEST-fiók megváltozott. A Water-adatok nem nyithatók meg.')
      }
    } catch (error) {
      invalidated = true
      throw error
    }
  }
  return Object.freeze({
    ownerId: ownerId.toLowerCase(),
    key,
    assertOwner,
    async read() {
      await assertOwner()
      const raw = storage.getItem(key)
      const data = readProfileWater(storage, ownerId)
      await assertOwner()
      return { raw, data }
    },
    async save(data, expectedRaw) {
      await assertOwner()
      const previous = storage.getItem(key)
      if (previous !== expectedRaw) {
        throw new Error('A saját Water-napló másik műveletben megváltozott.')
      }
      const raw = writeProfileWater(storage, ownerId, data, expectedRaw)
      // Native account can only switch after JS yields again.
      await assertOwner()
      return raw
    },
  })
}
