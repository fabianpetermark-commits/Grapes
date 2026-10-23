// Snapshot transformer only. The caller must supply copies read from the
// existing stores. No IndexedDB, localStorage, Drive or Supabase API is called.
const validText = value => typeof value === 'string' && value.length > 0
const cloneJson = value => JSON.parse(JSON.stringify(value))
const nonEmpty = value => Array.isArray(value) ? value.length > 0 :
  value && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value)

function sourceVersion(value) {
  if (!validText(value)) throw new Error('A source snapshot version is required')
  return value
}
function entries(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`Invalid ${label} collection`)
  return value
}
function record(kind, value, profileId, recordId = value?.id, schemaVersion = 1) {
  if (!validText(recordId)) throw new Error(`Missing ${kind} record ID`)
  return { profileId, kind, recordId, schemaVersion, payload: cloneJson(value) }
}

export function inventoryV24FoodSnapshot({
  provider, sourceId, version, document
}) {
  if (!['indexeddb', 'google-drive'].includes(provider) ||
      !validText(sourceId) || !document || typeof document !== 'object' ||
      document.module !== 'food' || !document.data ||
      (provider === 'google-drive' && document.grapesProject !== true)) {
    throw new Error('Invalid v24 Food source')
  }
  const data = document.data
  const profileId = data.profile?.id
  if (!validText(profileId) || ![1, 2].includes(data.version) ||
      (provider === 'indexeddb' && sourceId !== `food-tracker-${profileId}`)) {
    throw new Error('Invalid v24 Food profile or version')
  }
  const records = [], unmapped = []
  const seen = new Set()
  const add = (kind, value, id) => {
    const row = record(kind, value, profileId, id, data.version)
    const key = kind + '/' + row.recordId
    if (seen.has(key)) throw new Error(`Duplicate v24 Food identity: ${key}`)
    seen.add(key)
    records.push(row)
  }
  for (const item of entries(data.diaryEntries, 'diaryEntries')) {
    if (item?.profileId !== profileId || item?.origin?.profileId &&
        item.origin.profileId !== profileId) throw new Error('Food diary profile mismatch')
    add('food_diary', item)
  }
  for (const item of entries(data.customFoods, 'customFoods')) add('food_custom', item)
  for (const item of entries(data.recipes, 'recipes')) {
    if (item?.ownerProfileId !== profileId) throw new Error('Recipe owner profile mismatch')
    add('food_recipe', item)
    for (const ingredient of entries(item.ingredients, 'ingredients')) {
      if (!validText(ingredient?.id)) throw new Error('Missing ingredient ID')
      add('food_recipe_ingredient', { ...ingredient, recipeId: item.id },
        `${item.id}/${ingredient.id}`)
    }
  }
  for (const item of entries(data.targets, 'targets')) add('nutrient_goal', item)
  for (const item of entries(data.importBatches, 'importBatches')) {
    if (item?.profileId !== profileId) throw new Error('Import batch profile mismatch')
    if (item.source === 'yazio') add('yazio_import', item)
    else unmapped.push({ field: 'importBatches', id: item.id || null, reason: 'unsupported batch source' })
  }
  for (const field of ['recipeLibraries', 'favorites', 'recentFoods',
    'sharingContacts', 'processedShareIds', 'settings']) {
    if (nonEmpty(data[field])) unmapped.push({ field, reason: 'no reviewed target mapping' })
  }
  if (Object.keys(data.profile).some(field => field !== 'id' && nonEmpty(data.profile[field]))) {
    unmapped.push({ field: 'profile', reason: 'profile metadata mapping pending' })
  }
  const known = new Set(['version', 'profile', 'targets', 'customFoods',
    'recipes', 'diaryEntries', 'favorites', 'recentFoods', 'recipeLibraries',
    'importBatches', 'sharingContacts', 'processedShareIds', 'syncState', 'settings'])
  for (const field of Object.keys(data)) {
    if (!known.has(field) && nonEmpty(data[field])) {
      unmapped.push({ field, reason: 'unknown v24 Food field' })
    }
  }
  return {
    source: { provider, sourceId, version: sourceVersion(version),
      ownerId: null, profileId, records },
    unmapped, complete: unmapped.length === 0,
    counts: Object.fromEntries([...new Set(records.map(row => row.kind))]
      .map(kind => [kind, records.filter(row => row.kind === kind).length]))
  }
}

export function inventoryV24WaterSnapshot({ raw, version }) {
  if (typeof raw !== 'string') throw new Error('Raw v24 Water snapshot is required')
  let days
  try { days = JSON.parse(raw) } catch { throw new Error('Damaged v24 Water snapshot') }
  if (!days || typeof days !== 'object' || Array.isArray(days)) {
    throw new Error('Invalid v24 Water diary')
  }
  const profileId = 'legacy-water-v1'
  const records = [], unmapped = []
  const ids = new Set()
  for (const [date, day] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day ||
        typeof day !== 'object' || !Array.isArray(day.entries)) {
      throw new Error('Invalid v24 Water day')
    }
    if (day.goal !== undefined) {
      unmapped.push({ field: 'waterGoal', date, reason: 'water-goal schema pending' })
    }
    for (const field of Object.keys(day)) {
      if (field !== 'goal' && field !== 'entries' && nonEmpty(day[field])) {
        unmapped.push({ field, date, reason: 'unknown v24 Water field' })
      }
    }
    for (const item of day.entries) {
      if (!validText(item?.id) || !validText(item?.at) ||
          !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) {
        throw new Error('Invalid v24 Water entry')
      }
      if (ids.has(item.id)) throw new Error('Duplicate v24 Water entry ID')
      ids.add(item.id)
      records.push(record('water_entry', { ...item, dayDate: date }, profileId))
    }
  }
  return {
    source: { provider: 'localStorage', sourceId: 'grapes-water-v1',
      version: sourceVersion(version), ownerId: null, profileId, records },
    unmapped, complete: unmapped.length === 0,
    counts: { water_entry: records.length, days: Object.keys(days).length }
  }
}
