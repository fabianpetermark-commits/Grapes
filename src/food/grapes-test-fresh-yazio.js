import {
  createFoodId, localDateKey, normalizeDiaryEntry, normalizeFoodProject,
} from './food-data.js'
import {
  prepareYazioImport, applyYazioBatch, markYazioBatchComplete,
  undoYazioBatch, yazioEntryFingerprint,
} from './food-yazio-import.js'
import { prepareYazioCsvImport } from './yazio-import.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 40 * 1024 * 1024

export function prepareFreshOwnerYazio(source, {
  ownerId, existingEntries = [], filename = '',
} = {}) {
  if (!UUID.test(ownerId || '')) throw new Error('A natív Grapes-fiók nem ellenőrizhető.')
  if (typeof source !== 'string' ||
      new TextEncoder().encode(source).byteLength > MAX_BYTES) {
    throw new Error('Legfeljebb 40 MB-os YAZIO-export importálható.')
  }
  const profileId = ownerId.toLowerCase()
  const format = filename.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
  const preview = format === 'csv'
    ? prepareYazioCsvImport(source, { profileId, existingEntries })
    : prepareYazioImport(source, { profileId, existingEntries })
  const records = preview.records
  return {
    ...preview, format, profileId, records,
    counts: {
      ready: records.filter(item => item.status === 'ready').length,
      duplicate: records.filter(item => item.status === 'duplicate').length,
      uncertain: records.filter(item => item.status === 'uncertain').length,
      invalid: records.filter(item => item.status === 'invalid').length,
    },
  }
}

export async function confirmFreshOwnerYazio({
  session, preview, selectedIndexes,
} = {}) {
  if (!session || typeof session.assertOwner !== 'function' ||
      typeof session.load !== 'function' || typeof session.save !== 'function') {
    throw new Error('A YAZIO-importhoz natív Grapes-fiók szükséges.')
  }
  const owner = await session.assertOwner()
  if (!preview || preview.profileId !== owner ||
      !['json', 'csv'].includes(preview.format)) {
    throw new Error('A YAZIO-előnézet nem ehhez a fiókhoz tartozik.')
  }
  if (!Array.isArray(selectedIndexes) || selectedIndexes.some(index =>
    !Number.isSafeInteger(index) || index < 0) ||
    new Set(selectedIndexes).size !== selectedIndexes.length) {
    throw new Error('Érvénytelen YAZIO-kijelölés.')
  }
  const selected = new Set(selectedIndexes)
  if (preview.records.some(item => selected.has(item.index) &&
      !['ready', 'uncertain'].includes(item.status)) ||
      [...selected].some(index => !preview.records.some(item => item.index === index))) {
    throw new Error('Duplikált vagy hibás YAZIO-sor nem jelölhető ki.')
  }

  // Readback after preview and before CAS catches edits from another page,
  // account and previously imported batches without allowing silent overwrite.
  const current = await session.load()
  const project = normalizeFoodProject(current, owner)
  if (project.profile.id !== owner) throw new Error('Idegen Food-profil.')
  const existingKeys = new Set(project.diaryEntries.map(entry => entry.externalKey).filter(Boolean))
  let added = 0
  const batchId = createFoodId('yazio-batch')
  let candidate = project
  if (preview.format === 'json') {
    // Original exporter source archive and lossless imported nutrient precision.
    const safeIndexes = selectedIndexes.filter(index =>
      !existingKeys.has(preview.records.find(item => item.index === index)?.entry?.externalKey))
    const result = applyYazioBatch(project, preview, safeIndexes, batchId)
    candidate = result.added
      ? markYazioBatchComplete(result.project, batchId)
      : project
    added = result.added
  } else {
    // CSV keeps the same reversible batch/provenance contract as JSON. Never
    // use an origin-wide import journal or the unrelated Drive account.
    const ids = []
    for (const item of preview.records) {
      if (!selected.has(item.index) || existingKeys.has(item.entry.externalKey)) continue
      const timestamp = new Date().toISOString()
      const entry = normalizeDiaryEntry({
        ...item.entry,
        origin: {
          profileId: owner, source: 'yazio', sourceRecordId: item.entry.externalKey,
          externalKey: item.entry.externalKey, importBatchId: batchId,
          sourceDate: localDateKey(item.entry.occurredAt),
          sourceTimestamp: item.entry.occurredAt,
          sourcePayload: { csv: true, name: item.entry.snapshot.name },
          importedAt: timestamp, schemaVersion: 1,
        },
      })
      candidate.diaryEntries.push(entry)
      existingKeys.add(entry.externalKey)
      ids.push(entry.id)
      added++
    }
    if (added) {
      candidate.importBatches.push({
        id: batchId, profileId: owner, source: 'yazio',
        importedAt: new Date().toISOString(), recordIds: ids,
        entryFingerprints: Object.fromEntries(candidate.diaryEntries
          .filter(item => ids.includes(item.id))
          .map(item => [item.id, yazioEntryFingerprint(item)])),
        status: 'completed', schemaVersion: 1,
        exportFingerprint: 'csv:' + ids.length, sourceArchive: {
          format: 'nutrition_log.csv', rowCount: preview.records.length,
        },
      })
    }
  }
  if (!added) { await session.assertOwner(); return { imported: 0, project, batchId: null } }
  candidate.syncState = { ...candidate.syncState, localDirty: true,
    imports: { ...candidate.syncState?.imports,
      yazio: { lastSuccessfulAt: new Date().toISOString(), imported: added,
        lastError: '' } } }
  await session.assertOwner()
  await session.save(candidate)
  await session.assertOwner()
  return { imported: added, project: candidate, batchId }
}

export async function undoFreshOwnerYazio({ session, batchId = null } = {}) {
  if (!session || typeof session.assertOwner !== 'function' ||
      typeof session.load !== 'function' || typeof session.save !== 'function') {
    throw new Error('A YAZIO visszavonásához natív Grapes-fiók szükséges.')
  }
  const owner = await session.assertOwner()
  const current = normalizeFoodProject(await session.load(), owner)
  const batch = batchId
    ? current.importBatches.find(item => item.id === batchId)
    : [...current.importBatches].reverse().find(item =>
      item.source === 'yazio' && ['completed', 'partial-undo'].includes(item.status))
  if (!batch || batch.source !== 'yazio' || batch.profileId !== owner) {
    throw new Error('Nincs visszavonható saját YAZIO-import.')
  }
  const result = undoYazioBatch(current, batch.id)
  await session.assertOwner()
  await session.save(result.project)
  await session.assertOwner()
  return { ...result, batchId: batch.id }
}
