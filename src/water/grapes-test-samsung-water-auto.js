import {
  readAndroidSamsungHealthExportSilent, getAndroidSamsungWaterStatus,
} from '../android-bridge.js'
import { prepareFreshOwnerWaterHydration, confirmFreshOwnerWaterHydration } from './grapes-test-fresh-water-health.js'

// Only a deliberate per-Grapes-owner opt-in activates foreground Samsung
// Health auto-import. The source is a distinct OS-level health account; we
// NEVER claim it matches a Grapes account or copy settings to another owner.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIX = 'grapes-test-samsung-water-auto-v1:'
export const samsungAutoWaterKey = owner => {
  if (!UUID.test(owner || '')) throw new Error('A Grapes-fiók nincs ellenőrizve.')
  return PREFIX + owner.toLowerCase()
}

export function isSamsungAutoWaterEnabled(storage, owner) {
  return storage.getItem(samsungAutoWaterKey(owner)) === '1'
}

export function setSamsungAutoWaterEnabled(storage, owner, enabled) {
  const key = samsungAutoWaterKey(owner)
  if (enabled === true) storage.setItem(key, '1')
  else storage.removeItem(key)
}

/** One fully awaited, fail-closed, never-prompting read+CAS on the pinned owner.
 * This stage deliberately handles NEW water events only, not deletion/update
 * reconciliation. It never alters manually entered or old imported entries.
 */
export async function refreshFreshOwnerSamsungWater({
  session,
  fromDate,
  getStatus = getAndroidSamsungWaterStatus,
  read = readAndroidSamsungHealthExportSilent,
} = {}) {
  if (!session || typeof session.assertOwner !== 'function' ||
      typeof session.read !== 'function' || typeof session.save !== 'function') {
    throw new Error('A Samsung vízfrissítéshez saját Water-fiók szükséges.')
  }
  await session.assertOwner()
  // Fresh Water assertOwner validates native auth but intentionally returns
  // void. The pinned owner is the session.ownerId, never a returned value.
  const owner = session.ownerId
  if (!UUID.test(owner || '')) {
    throw new Error('Megváltozott a Grapes-fiók.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || '') ||
      !Number.isFinite(Date.parse(fromDate + 'T12:00:00'))) {
    throw new Error('Érvénytelen Samsung kezdődátum.')
  }
  const status = await getStatus()
  await session.assertOwner()
  if (!status?.available || !status?.permitted) {
    throw new Error('A Samsung Health vízhozzáférés nincs engedélyezve.')
  }
  const source = await read(fromDate)
  await session.assertOwner()
  const current = await session.read()
  const preview = prepareFreshOwnerWaterHydration(source, {
    ownerId: owner, existingDays: current.data,
  })
  // SDK should return only hydration. A malformed response cannot silently
  // turn into a partial automatic import.
  if (preview.counts.invalid || preview.counts.blocked) {
    throw new Error('Nem ellenőrizhető Samsung Health vízadat érkezett.')
  }
  const chosen = preview.records.filter(item => item.status === 'ready')
    .map(item => item.index)
  if (!chosen.length) {
    await session.assertOwner()
    return { imported: 0, duplicates: preview.counts.duplicate }
  }
  const result = await confirmFreshOwnerWaterHydration({
    session, preview, selectedIndexes: chosen,
  })
  await session.assertOwner()
  return { imported: result.imported, duplicates: preview.counts.duplicate }
}
