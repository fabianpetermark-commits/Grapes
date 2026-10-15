import { CORE_NUTRIENTS, createFoodId, normalizeDiaryEntry, normalizeFoodProject, summarizeEntries } from './food-data.js'

// Supported upstream layout: 1zun4/yazio-exporter JSON bundle (table-name -> array of rows).
export const YAZIO_IMPORT_SCHEMA_VERSION = 1
export const MAX_YAZIO_JSON_BYTES = 40 * 1024 * 1024
export const MAX_YAZIO_ROWS = 120000
const text = value => String(value ?? '').trim()
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const fieldMap = {
  energy_kcal: 'energyKcal', protein_g: 'protein', carbs_g: 'carbohydrate',
  fat_g: 'fat', fiber_g: 'fiber', sugar_g: 'sugar', saturated_fat_g: 'saturatedFat', salt_g: 'salt',
}
const mealMap = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack', snacks: 'snack' }

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

// Deterministic non-cryptographic key for collision-resistant *comparison* with payload verification.
function hash(value) {
  const input = canonical(value)
  let a = 2166136261, b = 0x9e3779b9
  for (let i = 0; i < input.length; i++) {
    const n = input.charCodeAt(i)
    a = Math.imul(a ^ n, 16777619)
    b = Math.imul(b ^ n, 2246822519)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
const validRow = row => row && typeof row === 'object' && !Array.isArray(row)
function iso(value, date) {
  const source = text(value) || date + ' 12:00:00'
  const local = /^\d{4}-\d{2}-\d{2} \d\d:\d\d(?::\d\d)?$/.test(source) ? source.replace(' ', 'T') : source
  const parsed = new Date(local)
  if (Number.isNaN(parsed.getTime())) throw new Error('Érvénytelen naplózási időpont.')
  return parsed.toISOString()
}
function numberOrNull(value, name) {
  if (value === null || value === undefined || value === '') return null
  const valueNumber = Number(value)
  if (!Number.isFinite(valueNumber) || valueNumber < 0) throw new Error('Érvénytelen tápanyag: ' + name)
  return valueNumber
}
function nutrientsFromRow(row) {
  const value = {}, extras = {}
  for (const name of CORE_NUTRIENTS) value[name] = null
  for (const [column, input] of Object.entries(row)) {
    if (!/^(energy|[a-z][a-z0-9_]*)_(kcal|g|mg|ug)$/.test(column)) continue
    const amount = numberOrNull(input, column)
    if (column in fieldMap) value[fieldMap[column]] = amount
    else if (amount !== null) {
      const suffix = column.match(/_(kcal|mg|ug|g)$/)[1]
      extras[column.replace(/_(kcal|mg|ug|g)$/, '')] = { amount, unit: suffix === 'ug' ? 'µg' : suffix }
    }
  }
  value.extras = extras
  return value
}
function collectTables(value) {
  if (!validRow(value)) throw new Error('A YAZIO-export gyökéreleme nem objektum.')
  if (!Array.isArray(value.meta) || !value.meta.length || !validRow(value.meta[0]) ||
      !Array.isArray(value.tables) || !Array.isArray(value.nutrition_log) ||
      !Array.isArray(value.daily_summary)) throw new Error('Ismeretlen YAZIO JSON-formátum; nincs adatírás.')
  const meta = value.meta[0]
  if (!/^\d+\.\d+/.test(text(meta.tool_version))) throw new Error('Hiányzó vagy ismeretlen YAZIO-exportáló verzió.')
  const major = Number(text(meta.tool_version).split('.')[0])
  if (major !== 0 && major !== 1) throw new Error('Nem támogatott YAZIO-exportáló verzió: ' + meta.tool_version)
  if (!datePattern.test(meta.from) || !datePattern.test(meta.to) || meta.from > meta.to) throw new Error('Hibás exportidőszak.')
  for (const [name, rows] of Object.entries(value)) {
    if (!Array.isArray(rows) || rows.length > MAX_YAZIO_ROWS || !rows.every(validRow)) throw new Error('Hibás vagy túl nagy YAZIO-tábla: ' + name)
  }
  if (value.nutrition_log.length > MAX_YAZIO_ROWS) throw new Error('Túl sok étkezési rekord.')
  return meta
}
export function parseYazioExport(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > MAX_YAZIO_JSON_BYTES)
    throw new Error('A YAZIO-import legfeljebb 40 MB méretű JSON lehet.')
  let data
  try { data = JSON.parse(source) } catch { throw new Error('Hibás YAZIO JSON-fájl.') }
  const meta = collectTables(data)
  // Explicit errors/warnings stay visible instead of implying completeness.
  return { data, meta, schemaVersion: YAZIO_IMPORT_SCHEMA_VERSION }
}
function linkedSources(row, data) {
  const sourceId = text(row.source_id)
  if (!sourceId) return {}
  const product = (data.products || []).find(item => text(item.product_id) === sourceId)
  const recipe = (data.recipes || []).find(item => text(item.recipe_id) === sourceId)
  return { ...(product ? { product } : {}), ...(recipe ? {
    recipe, ingredients: (data.recipe_ingredients || []).filter(item => text(item.recipe_id) === sourceId),
    instructions: (data.recipe_instructions || []).filter(item => text(item.recipe_id) === sourceId),
  } : {}) }
}
function entryForRow(row, profileId, externalKey, sourceRecordId, sourcePayload) {
  const date = text(row.date)
  if (!datePattern.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) throw new Error('Hiányzó vagy hibás étkezési dátum.')
  const sourceTimestamp = text(row.logged_at)
  const occurredAt = iso(sourceTimestamp, date)
  const amount = numberOrNull(row.amount, 'amount')
  if (amount !== null && amount <= 0) throw new Error('Az elfogyasztott mennyiség nem lehet nulla.')
  const kind = text(row.type)
  const sourceUnit = kind === 'recipe_portion' ? 'serving' : text(sourcePayload.linked.product?.base_unit) === 'ml' ? 'ml' : 'g'
  const unit = amount === null || kind === 'recipe_portion' ? 'serving' : sourceUnit
  const actualAmount = amount === null ? 1 : amount
  const name = text(row.product) || 'Névtelen YAZIO-étel'
  const nutrients = nutrientsFromRow(row)
  return normalizeDiaryEntry({
    id: createFoodId('entry'), profileId,
    occurredAt, mealType: mealMap[text(row.meal).toLowerCase()] || 'snack',
    amount: actualAmount, unit, externalKey,
    note: 'YAZIO-import', snapshot: {
      foodId: '', name, category: 'YAZIO', source: { type: 'yazio', id: text(row.source_id), revision: '', attribution: 'YAZIO export' },
      baseAmount: actualAmount, baseUnit: unit, nutrients,
    },
    origin: { profileId, source: 'yazio', sourceRecordId, externalKey,
      importBatchId: '', sourceDate: date, sourceTimestamp, sourcePayload,
      importedAt: '', schemaVersion: YAZIO_IMPORT_SCHEMA_VERSION },
  })
}
function similar(a, b) {
  if (a.profileId !== b.profileId) return false
  if (a.occurredAt !== b.occurredAt) return false
  const sameName = a.snapshot?.name?.toLocaleLowerCase() === b.snapshot?.name?.toLocaleLowerCase()
  const left = a.snapshot?.nutrients || {}, right = b.snapshot?.nutrients || {}
  const sameMacros = ['energyKcal', 'protein', 'carbohydrate', 'fat'].every(key => left[key] == null || right[key] == null || Math.abs(left[key] - right[key]) < 0.1)
  return sameName || ((b.externalKey || '').startsWith('healthconnect:') && sameMacros)
}
function dailyWarnings(data, records) {
  const rowsByDate = new Map()
  for (const item of records) {
    if (!item.entry) continue
    const date = item.record.date
    if (!rowsByDate.has(date)) rowsByDate.set(date, [])
    rowsByDate.get(date).push(item.entry)
  }
  const result = []
  for (const row of data.daily_summary) {
    if (!rowsByDate.has(row.date)) continue
    const total = summarizeEntries(rowsByDate.get(row.date))
    for (const [src, dest] of [['energy_kcal', 'energyKcal'], ['protein_g', 'protein'], ['carbs_g', 'carbohydrate'], ['fat_g', 'fat']]) {
      if (row[src] == null || total[dest] == null) continue
      const expected = Number(row[src]), actual = total[dest]
      if (!Number.isFinite(expected)) continue
      if (Math.abs(expected - actual) > Math.max(1, Math.abs(expected) * 0.005))
        result.push({ date: row.date, nutrient: dest, expected, actual })
    }
  }
  return result
}
export function prepareYazioImport(source, { profileId, existingEntries = [] } = {}) {
  if (!text(profileId)) throw new Error('Import előtt válassz célprofilt.')
  const parsed = typeof source === 'string' ? parseYazioExport(source) : source
  const { data, meta } = parsed
  const seenKeys = new Map(), occurrence = new Map()
  const existing = existingEntries.filter(item => item.profileId === profileId)
  const byExternal = new Map(existing.map(item => [item.externalKey, item]).filter(([key]) => key))
  const records = data.nutrition_log.map((record, index) => {
    try {
      const stableId = text(record.entry_id)
      // Every id-less occurrence gets its own key; do not collapse repeated identical meals.
      const signature = hash(record)
      const ordinal = occurrence.get(signature) || 0
      occurrence.set(signature, ordinal + 1)
      const externalKey = 'yazio:' + profileId + ':' + (stableId ? 'id:' + stableId : 'row:' + signature + ':' + ordinal)
      const sourcePayload = { log: record, linked: linkedSources(record, data) }
      const entry = entryForRow(record, profileId, externalKey, stableId, sourcePayload)
      const old = byExternal.get(externalKey)
      let status = seenKeys.has(externalKey) || old ? 'duplicate' : 'ready'
      if (old && (!old.origin?.sourcePayload?.log || canonical(old.origin.sourcePayload.log) !== canonical(record))) status = 'uncertain'
      if (seenKeys.has(externalKey) && seenKeys.get(externalKey) !== canonical(record)) status = 'uncertain'
      if (status === 'ready' && existing.some(item => similar(item, entry))) status = 'uncertain'
      seenKeys.set(externalKey, canonical(record))
      return { index, status, entry, record, error: '' }
    } catch (error) { return { index, status: 'invalid', entry: null, record, error: error.message } }
  })
  const statuses = ['ready', 'duplicate', 'uncertain', 'invalid']
  const counts = Object.fromEntries(statuses.map(status => [status, records.filter(item => item.status === status).length]))
  const dates = records.filter(item => item.entry).map(item => item.record.date).sort()
  const warnings = (data.warnings || []).map(row => JSON.stringify(row))
  const discrepancies = dailyWarnings(data, records)
  return { meta, records, counts, days: new Set(dates).size, from: dates[0] || meta.from,
    to: dates[dates.length - 1] || meta.to, warnings, discrepancies, recipes: (data.recipes || []).length,
    products: (data.products || []).length, nutrients: summarizeEntries(records.filter(item => item.entry).map(item => item.entry)),
    // Unmodified source bundle preserves unreferenced products, recipes, relations and warnings.
    sourceArchive: data, profileId, schemaVersion: YAZIO_IMPORT_SCHEMA_VERSION }
}
export function applyYazioBatch(projectValue, preview, selectedIndexes, batchId = createFoodId('yazio-batch')) {
  const project = normalizeFoodProject(projectValue, preview.profileId)
  if (project.profile.id !== preview.profileId) throw new Error('Profilütközés.')
  const selections = new Set(selectedIndexes.map(Number))
  const keys = new Set(project.diaryEntries.map(entry => entry.externalKey).filter(Boolean))
  const now = new Date().toISOString(), added = []
  for (const item of preview.records) {
    if (!selections.has(item.index) || !['ready', 'uncertain'].includes(item.status)) continue
    if (keys.has(item.entry.externalKey)) continue
    const entry = normalizeDiaryEntry({ ...item.entry,
      origin: { ...item.entry.origin, importBatchId: batchId, importedAt: now },
    })
    project.diaryEntries.push(entry)
    added.push(entry.id)
    keys.add(entry.externalKey)
  }
  if (added.length) {
    const batch = project.importBatches.find(item => item.id === batchId)
    if (batch) {
      if (batch.profileId !== preview.profileId || batch.source !== 'yazio') throw new Error('Importköteg profilütközés.')
      batch.recordIds.push(...added)
      batch.status = 'in-progress'
    } else project.importBatches.push({
      id: batchId, profileId: preview.profileId, source: 'yazio', importedAt: now,
      recordIds: added, status: 'in-progress', schemaVersion: YAZIO_IMPORT_SCHEMA_VERSION,
      sourceArchive: preview.sourceArchive,
    })
  }
  return { project, batchId, added: added.length }
}
export function markYazioBatchComplete(projectValue, batchId) {
  const project = normalizeFoodProject(projectValue)
  const batch = project.importBatches.find(item => item.id === batchId && item.source === 'yazio')
  if (!batch || batch.profileId !== project.profile.id) throw new Error('A köteg nem található.')
  batch.status = 'completed'
  return project
}
export function undoYazioBatch(projectValue, batchId) {
  const project = normalizeFoodProject(projectValue)
  const batch = project.importBatches.find(item => item.id === batchId && item.source === 'yazio')
  if (!batch || batch.profileId !== project.profile.id) throw new Error('A köteg nem található ennél a profilnál.')
  const ids = new Set(batch.recordIds)
  const modified = project.diaryEntries.filter(item => ids.has(item.id) && item.origin?.importBatchId === batchId &&
    item.updatedAt !== item.createdAt).map(item => item.id)
  const protectedIds = new Set(modified)
  const before = project.diaryEntries.length
  project.diaryEntries = project.diaryEntries.filter(item => !ids.has(item.id) || protectedIds.has(item.id) ||
    item.origin?.importBatchId !== batchId)
  batch.status = modified.length ? 'partial-undo' : 'undone'
  return { project, removed: before - project.diaryEntries.length, modified }
}
