// Read-only TEST migration planning. Inventory collection and authentication
// happen outside this module. Never use its output as authorization for writes.
const kinds = new Set([
  'food_diary', 'food_custom', 'food_recipe', 'food_recipe_ingredient',
  'water_entry', 'yazio_import', 'nutrient_goal', 'health_record'
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const providers = new Set(['indexeddb', 'localStorage', 'google-drive'])
const identity = row => [row.profileId, row.kind, row.recordId]
  .map(value => encodeURIComponent(value)).join('/')

export function previewHealthMigrationForOwner({
  verifiedOwnerId, sources, targetHeads = []
}) {
  if (!uuid.test(verifiedOwnerId || '') ||
      !Array.isArray(sources) || !Array.isArray(targetHeads)) {
    throw new Error('Verified owner and inventories are required')
  }
  const plan = [], duplicates = [], conflicts = [], invalid = [], claimsRequired = []
  const heads = new Map()
  for (const head of targetHeads) {
    if (!head || head.ownerId !== verifiedOwnerId ||
        typeof head.profileId !== 'string' || !head.profileId ||
        !kinds.has(head.kind) || typeof head.recordId !== 'string' || !head.recordId ||
        !Number.isSafeInteger(head.revision) || head.revision < 1) {
      throw new Error('Invalid or foreign target inventory')
    }
    const id = identity(head)
    if (heads.has(id)) throw new Error('Duplicate target head')
    heads.set(id, head)
  }
  const seen = new Map()
  for (const source of sources) {
    if (!source || !providers.has(source.provider) ||
        typeof source.sourceId !== 'string' || !source.sourceId ||
        typeof source.version !== 'string' || !source.version ||
        typeof source.profileId !== 'string' || !source.profileId ||
        !Array.isArray(source.records)) {
      invalid.push({ sourceId: source?.sourceId ?? null, reason: 'invalid source' })
      continue
    }
    if (source.ownerId == null) {
      claimsRequired.push({ sourceId: source.sourceId, profileId: source.profileId,
        reason: 'legacy source has no verified owner' })
      continue
    }
    if (source.ownerId !== verifiedOwnerId) {
      conflicts.push({ sourceId: source.sourceId, reason: 'source belongs to another owner' })
      continue
    }
    for (const record of source.records) {
      if (!record || record.profileId !== source.profileId ||
          !kinds.has(record.kind) ||
          typeof record.recordId !== 'string' || !record.recordId ||
          !Number.isSafeInteger(record.schemaVersion) || record.schemaVersion < 1 ||
          record.payload === null || record.payload === undefined) {
        invalid.push({ sourceId: source.sourceId, recordId: record?.recordId ?? null,
          reason: 'invalid record, profile, kind or schema' })
        continue
      }
      let candidate
      try { candidate = JSON.stringify(record.payload) } catch {
        invalid.push({ sourceId: source.sourceId, recordId: record.recordId,
          reason: 'payload is not serializable' })
        continue
      }
      if (candidate === undefined) {
        invalid.push({ sourceId: source.sourceId, recordId: record.recordId,
          reason: 'payload is not serializable' })
        continue
      }
      const id = identity(record)
      const prior = seen.get(id)
      if (prior) {
        if (prior.candidate === candidate && prior.sourceId === source.sourceId &&
            prior.version === source.version && prior.provider === source.provider) {
          duplicates.push({ identity: id, sourceId: source.sourceId })
        } else {
          conflicts.push({ identity: id, sourceId: source.sourceId,
            priorSourceId: prior.sourceId, reason: 'distinct provenance or bytes' })
        }
        continue
      }
      seen.set(id, { candidate, sourceId: source.sourceId,
        version: source.version, provider: source.provider })
      const target = heads.get(id)
      if (target) {
        conflicts.push({ identity: id, sourceId: source.sourceId,
          targetRevision: target.revision, reason: 'target already exists' })
        continue
      }
      plan.push({ identity: id, ownerId: verifiedOwnerId,
        profileId: source.profileId, kind: record.kind, recordId: record.recordId,
        schemaVersion: record.schemaVersion, payload: JSON.parse(candidate),
        sourceId: source.sourceId, sourceVersion: source.version, provider: source.provider })
    }
  }
  return { plan, duplicates, conflicts, invalid, claimsRequired,
    canImport: conflicts.length === 0 && invalid.length === 0 && claimsRequired.length === 0,
    originalSourcesUntouched: true }
}
