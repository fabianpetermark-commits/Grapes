import { prepareHealthBridgeImport } from './food-health-import.js'
import { normalizeFoodProject } from './food-data.js'

// Separate opt-in TEST path: only Nutrition -> own Food diary.
// Hydration stays out of scope until the Water owner transaction is designed.
// The original Android Health export is held in memory for preview only.
export function prepareFreshOwnerHealthNutrition(source, {
  ownerId, existingEntries = [],
} = {}) {
  if (typeof ownerId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error('A natív Health-import tulajdonosa nem ellenőrizhető.')
  }
  const preview = prepareHealthBridgeImport(source, {
    profileId: ownerId.toLowerCase(), existingEntries,
  })
  const records = preview.records.map(item => {
    if (item.record?.type !== 'hydration') return item
    // Not a food diary entry: never silently divert Health water into Food.
    return { ...item, status: 'blocked', entry: null,
      error: 'Vízadat: a fiókonkénti Water-import külön jóváhagyást igényel.' }
  })
  return {
    ...preview, profileId: ownerId.toLowerCase(), records,
    counts: {
      ready: records.filter(x => x.status === 'ready').length,
      duplicate: records.filter(x => x.status === 'duplicate').length,
      invalid: records.filter(x => x.status === 'invalid').length,
      blocked: records.filter(x => x.status === 'blocked').length,
    },
  }
}

/**
 * Explicit confirmation only. No native export is owned by an account;
 * native Grapes Auth must still match the pinned target immediately before
 * and after the owner-partitioned CAS Food write.
 */
export async function confirmFreshOwnerHealthNutrition({
  session, project, preview, selectedIndexes,
} = {}) {
  if (!session || typeof session.assertOwner !== 'function' ||
      typeof session.save !== 'function') {
    throw new Error('A Health-mentéshez ellenőrzött Grapes-fiók szükséges.')
  }
  const ownerId = await session.assertOwner()
  if (!preview || preview.profileId !== ownerId ||
      project?.profile?.id !== ownerId) {
    throw new Error('A Health előnézete másik fiókhoz tartozik. Olvasd be újra.')
  }
  if (!Array.isArray(selectedIndexes) || selectedIndexes.some(x => !Number.isSafeInteger(x))) {
    throw new Error('Érvénytelen Health-kijelölés.')
  }
  const selected = new Set(selectedIndexes)
  if (selected.size !== selectedIndexes.length) throw new Error('Ismételt Health-kijelölés.')
  if (preview.records.some(item => selected.has(item.index) && item.status !== 'ready')) {
    throw new Error('Csak jóváhagyható, új étkezési sor importálható.')
  }
  const candidate = normalizeFoodProject(structuredClone(project), ownerId)
  const keys = new Set(candidate.diaryEntries.map(item => item.externalKey).filter(Boolean))
  let added = 0
  for (const item of preview.records) {
    if (!selected.has(item.index)) continue
    if (item.entry?.profileId !== ownerId ||
        item.entry?.snapshot?.category === 'Folyadék' ||
        item.record?.type !== 'nutrition' || !item.entry?.externalKey) {
      throw new Error('Nem importálható idegen vagy vízbejegyzés.')
    }
    if (keys.has(item.entry.externalKey)) continue
    keys.add(item.entry.externalKey)
    candidate.diaryEntries.push(structuredClone(item.entry))
    added++
  }
  if (!added) return { imported: 0, project: structuredClone(candidate) }
  candidate.syncState = {
    ...candidate.syncState, localDirty: true,
    imports: {
      ...(candidate.syncState?.imports || {}),
      health: { lastSuccessfulAt: new Date().toISOString(), imported: added, lastError: '' },
    },
  }
  await session.assertOwner()
  await session.save(candidate)
  await session.assertOwner()
  return { imported: added, project: candidate }
}
