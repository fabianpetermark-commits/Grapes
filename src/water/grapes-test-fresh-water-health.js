import { prepareHealthBridgeImport } from '../food/food-health-import.js'

// Explicit, opt-in native Health Connect -> personal Water only.
// Read-only preview; the raw Health export is never persisted or claimed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isoDayLocal = value => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Érvénytelen Health vízidőpont.')
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-')
}
const existingExternalKeys = days => Object.values(days)
  .flatMap(day => day.entries || []).map(entry => entry.externalKey).filter(Boolean)

export function prepareFreshOwnerWaterHydration(source, {
  ownerId, existingDays = {},
} = {}) {
  if (!UUID.test(ownerId || '')) throw new Error('Nem ellenőrzött Grapes Water-fiók.')
  const profileId = ownerId.toLowerCase()
  const base = prepareHealthBridgeImport(source, {
    profileId, existingEntries: existingExternalKeys(existingDays)
      .map(externalKey => ({ externalKey })),
  })
  const records = base.records.map(item => {
    if (item.record?.type !== 'hydration') {
      return { ...item, status: 'blocked', entry: null,
        error: 'Ételadat: csak a Food saját előnézetében importálható.' }
    }
    return item
  })
  return {
    profileId, generatedAt: base.generatedAt, records,
    counts: {
      ready: records.filter(item => item.status === 'ready').length,
      duplicate: records.filter(item => item.status === 'duplicate').length,
      invalid: records.filter(item => item.status === 'invalid').length,
      blocked: records.filter(item => item.status === 'blocked').length,
    },
  }
}

/**
 * One synchronous CAS Water write for ALL selected hydration records.
 * Native owner checks before reading, before writing, and after writing.
 * Never reads/updates unowned grapes-water-v1, Food, YAZIO or Drive.
 */
export async function confirmFreshOwnerWaterHydration({
  session, preview, selectedIndexes,
} = {}) {
  if (!session || typeof session.assertOwner !== 'function' ||
      typeof session.read !== 'function' || typeof session.save !== 'function') {
    throw new Error('Nincs ellenőrzött Water-fiókmunkamenet.')
  }
  await session.assertOwner()
  if (preview?.profileId !== session.ownerId) {
    throw new Error('A vízimport előnézete másik fiókhoz tartozik.')
  }
  if (!Array.isArray(selectedIndexes) ||
      selectedIndexes.some(index => !Number.isSafeInteger(index))) {
    throw new Error('Hibás Health-rekord kijelölés.')
  }
  const selected = new Set(selectedIndexes)
  if (selected.size !== selectedIndexes.length ||
      selected.size > preview.records.length ||
      selected.size && !preview.records.every(item =>
        !selected.has(item.index) || item.status === 'ready') ||
      [...selected].some(index => !preview.records.some(item => item.index === index))) {
    throw new Error('Csak új, jóváhagyható Water-rekord választható.')
  }
  const { raw, data } = await session.read()
  const days = structuredClone(data)
  const seen = new Set(existingExternalKeys(days))
  let imported = 0
  for (const item of preview.records) {
    if (!selected.has(item.index)) continue
    const entry = item.entry
    if (item.record?.type !== 'hydration' ||
        !entry || entry.profileId !== session.ownerId ||
        !/^(healthconnect|samsunghealth):[^:]+:.+$/.test(entry.externalKey || '') ||
        entry.snapshot?.category !== 'Folyadék' ||
        !Number.isFinite(entry.amount) || entry.amount <= 0 ||
        entry.amount > 100000) {
      throw new Error('Nem importálható Health-vízrekord.')
    }
    if (seen.has(entry.externalKey)) continue
    const dayKey = isoDayLocal(entry.occurredAt)
    const day = days[dayKey] ||= { goal: 2000, entries: [] }
    day.entries.push({
      id: crypto.randomUUID(),
      amount: entry.amount,
      at: new Date(entry.occurredAt).toISOString(),
      externalKey: entry.externalKey,
      source: item.record.sourcePackage,
    })
    seen.add(entry.externalKey)
    imported++
  }
  if (!imported) {
    await session.assertOwner()
    return { imported: 0, days }
  }
  await session.assertOwner()
  await session.save(days, raw)
  await session.assertOwner()
  return { imported, days }
}
