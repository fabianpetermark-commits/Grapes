import { normalizeFoodProject } from './food-data.js'
import { yazioEntryFingerprint } from './food-yazio-import.js'

// A *dry-run* migration for a local diary already wholly represented in a
// verified, same-account remote diary. It never talks to Drive or writes data.
// Remote-only meals, saved foods, settings and YAZIO batch history are retained.
const emailOf = project => String(project?.profile?.email || '').trim().toLocaleLowerCase('hu-HU')
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const mealSnapshot = item => ({
  mealType: item.mealType, occurredAt: item.occurredAt,
  amount: item.amount, unit: item.unit, servingId: item.servingId,
  note: item.note, snapshot: item.snapshot,
  sourceLog: item.origin?.source === 'yazio' ? item.origin?.sourcePayload?.log : null,
})

function logicalMealKey(entry) {
  if (entry.origin?.source === 'yazio') {
    const id = String(entry.origin.sourceRecordId || '').trim()
    if (!id) throw new Error('YAZIO-bejegyzés stabil rekordazonosító nélkül: automatikus egyesítés nem végezhető.')
    return 'yazio:' + id
  }
  if (entry.externalKey) return 'source:' + entry.externalKey
  return 'manual:' + entry.id
}
function indexedMeals(project) {
  const result = new Map()
  for (const entry of project.diaryEntries) {
    const key = logicalMealKey(entry)
    if (result.has(key)) throw new Error('Ismétlődő külső étkezésazonosító. Kézi ellenőrzés szükséges.')
    result.set(key, entry)
  }
  return result
}
function guardLocalCollections(local, remote) {
  for (const key of ['customFoods', 'recipes', 'favorites', 'recipeLibraries',
    'sharingContacts', 'processedShareIds']) {
    const remoteIds = new Set(remote[key].map(item => typeof item === 'string' ? item : item.id ?? item.email))
    for (const item of local[key]) {
      const id = typeof item === 'string' ? item : item.id ?? item.email
      const equivalent = remote[key].find(existing => (typeof existing === 'string' ? existing : existing.id ?? existing.email) === id)
      if (!remoteIds.has(id) || !same(item, equivalent)) {
        throw new Error('A telefonon különálló ' + key + ' adatok vannak; automatikus egyesítés nem végezhető.')
      }
    }
  }
  if (local.settings && Object.keys(local.settings).length &&
      !Object.entries(local.settings).every(([key, value]) => same(remote.settings?.[key], value))) {
    throw new Error('A telefonon eltérő Food-beállítások vannak; kézi ellenőrzés szükséges.')
  }
  const remoteTargets = remote.targets
  const localDefined = local.targets.some(t => Object.values(t.values).some(v => v != null))
  if (localDefined && !local.targets.every(t => remoteTargets.some(r => same(r.values, t.values) && r.effectiveFrom === t.effectiveFrom))) {
    throw new Error('A telefonon eltérő napi célértékek vannak; kézi ellenőrzés szükséges.')
  }
  if (local.importBatches.some(batch => batch.source !== 'yazio')) {
    throw new Error('A telefonon külön importelőzmény található; kézi ellenőrzés szükséges.')
  }
}

export function previewFoodSameAccountAdoption(localInput, remoteInput, verifiedAccountEmail) {
  const local = normalizeFoodProject(localInput)
  const remote = normalizeFoodProject(remoteInput)
  const verified = String(verifiedAccountEmail || '').trim().toLocaleLowerCase('hu-HU')
  if (!verified || !emailOf(local) || !emailOf(remote) ||
      verified !== emailOf(local) || verified !== emailOf(remote)) {
    throw new Error('A két Food-napló nem ugyanahhoz az igazolt Google-fiókhoz tartozik.')
  }
  if (local.profile.id === remote.profile.id) {
    throw new Error('Az azonos Food-profilok összehangolása nem profilmigráció.')
  }
  guardLocalCollections(local, remote)
  const remoteEntries = indexedMeals(remote)
  const localEntries = indexedMeals(local)
  let matched = 0
  for (const [key, entry] of localEntries) {
    const candidate = remoteEntries.get(key)
    if (!candidate || !same(mealSnapshot(entry), mealSnapshot(candidate))) {
      throw new Error('Van a telefonon egy különálló vagy eltérő étkezés. Nem írunk felül és nem hagyunk el adatot.')
    }
    matched++
  }
  for (const batch of local.importBatches) {
    const batchEntries = local.diaryEntries.filter(e => batch.recordIds?.includes(e.id))
    if (!Array.isArray(batch.recordIds) || batchEntries.length !== batch.recordIds.length ||
        batchEntries.some(e => e.origin?.source !== 'yazio' || !remoteEntries.has(logicalMealKey(e)))) {
      throw new Error('A helyi YAZIO-importköteg nem egyezik a mentett rekordokkal.')
    }
  }
  const oldId = remote.profile.id, newId = local.profile.id
  const migrated = structuredClone(remote)
  migrated.profile = { ...migrated.profile, id: newId }
  migrated.diaryEntries = migrated.diaryEntries.map(entry => {
    const next = { ...entry, profileId: newId }
    if (next.origin?.source === 'yazio') {
      const previousPrefix = 'yazio:' + oldId + ':'
      if (!next.externalKey.startsWith(previousPrefix) ||
          next.origin.externalKey !== next.externalKey) {
        throw new Error('A régi YAZIO-külső azonosító nem alakítható át biztonságosan.')
      }
      const newKey = 'yazio:' + newId + ':' + next.externalKey.slice(previousPrefix.length)
      next.externalKey = newKey
      next.origin = { ...next.origin, profileId: newId, externalKey: newKey }
    } else if (next.origin) {
      next.origin = { ...next.origin, profileId: newId }
    }
    return next
  })
  migrated.recipes = migrated.recipes.map(recipe => ({
    ...recipe, ownerProfileId: recipe.ownerProfileId === oldId ? newId : recipe.ownerProfileId,
  }))
  migrated.importBatches = migrated.importBatches.map(batch => {
    if (batch.profileId !== oldId) throw new Error('Idegen profilhoz tartozó importköteg.')
    const result = { ...batch, profileId: newId }
    if (batch.source === 'yazio') {
      const entriesById = new Map(migrated.diaryEntries.map(item => [item.id, item]))
      if (!Array.isArray(batch.recordIds) ||
          batch.recordIds.some(id => !entriesById.has(id))) {
        throw new Error('Hiányzó YAZIO-importbejegyzés; a visszavonási előzmény nem módosítható.')
      }
      result.entryFingerprints = Object.fromEntries(
        batch.recordIds.map(id => [id, yazioEntryFingerprint(entriesById.get(id))])
      )
    }
    return result
  })
  migrated.syncState = { ...migrated.syncState, localDirty: true }
  const project = normalizeFoodProject(migrated, newId)
  // This projection intentionally preserves the Drive record set and its IDs.
  if (project.diaryEntries.length !== remote.diaryEntries.length ||
      project.customFoods.length !== remote.customFoods.length ||
      project.importBatches.length !== remote.importBatches.length) {
    throw new Error('A profilmigráció adatvesztést okozna.')
  }
  return {
    project,
    summary: {
      matchedLocalMeals: matched,
      retainedDriveMeals: remote.diaryEntries.length,
      driveOnlyMeals: remote.diaryEntries.length - matched,
      retainedSavedFoods: remote.customFoods.length,
      retainedYazioBatches: project.importBatches.filter(batch => batch.source === 'yazio').length,
    },
  }
}
