// Pure preview only. The caller supplies copies of local/Drive inventories.
// No file, IndexedDB, Drive or Supabase writes occur here.
const allowedKinds = new Set(['food_diary', 'food_custom', 'food_recipe',
  'food_recipe_ingredient', 'water_entry', 'yazio_import', 'nutrient_goal', 'health_record'])
function key(record) {
  return [record.profileId, record.kind, record.recordId].map(encodeURIComponent).join('/')
}
export function previewHealthMigration({ sources, targetHeads = [] }) {
  if (!Array.isArray(sources) || !Array.isArray(targetHeads)) {
    throw new Error('Migration inventory is required')
  }
  const heads = new Map()
  for (const head of targetHeads) {
    if (heads.has(key(head))) throw new Error('Duplicate target head in inventory')
    heads.set(key(head), head)
  }
  const seen = new Map()
  const plan = [], duplicates = [], conflicts = [], invalid = []
  for (const source of sources) {
    if (!source || !['indexeddb', 'localStorage', 'google-drive'].includes(source.provider) ||
        typeof source.sourceId !== 'string' || !source.sourceId ||
        typeof source.version !== 'string' || !source.version ||
        typeof source.profileId !== 'string' || !source.profileId ||
        !Array.isArray(source.records)) {
      invalid.push({ sourceId: source?.sourceId ?? null, reason: 'invalid source' })
      continue
    }
    for (const record of source.records) {
      if (!record || record.profileId !== source.profileId ||
          !allowedKinds.has(record.kind) || record.kind.includes('ebook') ||
          typeof record.recordId !== 'string' || !record.recordId ||
          !Number.isSafeInteger(record.schemaVersion) || record.schemaVersion < 1 ||
          record.payload === undefined || record.payload === null) {
        invalid.push({ sourceId: source.sourceId, recordId: record?.recordId ?? null,
          reason: 'invalid record, profile, kind or schema' })
        continue
      }
      const identity = key(record)
      const candidate = JSON.stringify(record.payload)
      const prior = seen.get(identity)
      if (prior) {
        if (prior.candidate === candidate && prior.sourceId === source.sourceId &&
            prior.sourceVersion === source.version && prior.provider === source.provider) {
          duplicates.push({ identity, sourceId: source.sourceId, reason: 'same source/version/record' })
        } else {
          conflicts.push({ identity, sourceId: source.sourceId,
            priorSourceId: prior.sourceId, reason: 'same record ID has distinct provenance or bytes' })
        }
        continue
      }
      seen.set(identity, { candidate, sourceId: source.sourceId, sourceVersion: source.version, provider: source.provider })
      const remote = heads.get(identity)
      if (remote) {
        conflicts.push({ identity, sourceId: source.sourceId, reason: 'target head already exists',
          targetRevision: remote.revision })
        continue
      }
      plan.push({ identity, sourceId: source.sourceId, sourceVersion: source.version,
        provider: source.provider,
        profileId: record.profileId, kind: record.kind, recordId: record.recordId,
        schemaVersion: record.schemaVersion, payload: structuredClone(record.payload) })
    }
  }
  return { plan, duplicates, conflicts, invalid,
    canImport: conflicts.length === 0 && invalid.length === 0,
    originalSourcesUntouched: true }
}
