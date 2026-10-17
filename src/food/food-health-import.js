import { createFoodId, normalizeDiaryEntry } from './food-data.js'

export const HEALTH_BRIDGE_VERSION = 1
export const HEALTH_BRIDGE_PRODUCER = 'hu.grapes.healthconnect'
export const MAX_HEALTH_IMPORT_RECORDS = 50000

const MEAL_TYPES = new Set(['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner', 'snack'])
const EXTERNAL_ID_PATTERN = /^(healthconnect|samsunghealth):[^:]+:.+$/

function finiteNonNegative(value, label) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} nem lehet negatív vagy érvénytelen.`)
  return number
}

function requiredText(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} hiányzik.`)
  return text
}

function requiredIso(value, label) {
  const text = requiredText(value, label)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} érvénytelen.`)
  return date.toISOString()
}

export function parseHealthBridgeExport(source) {
  let payload
  try { payload = typeof source === 'string' ? JSON.parse(source) : source } catch { throw new Error('A Health-import nem érvényes JSON-fájl.') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('A Health-import gyökéreleme érvénytelen.')
  if (payload.schemaVersion !== HEALTH_BRIDGE_VERSION) throw new Error(`Nem támogatott Health-import verzió: ${payload.schemaVersion ?? 'hiányzik'}.`)
  if (payload.producer !== HEALTH_BRIDGE_PRODUCER) throw new Error('A fájlt nem a Grapes Health Connect összekötő készítette.')
  const generatedAt = requiredIso(payload.generatedAt, 'Exportálási idő')
  if (!Array.isArray(payload.records)) throw new Error('A Health-import rekordlistája hiányzik.')
  if (payload.records.length > MAX_HEALTH_IMPORT_RECORDS) throw new Error(`Egy import legfeljebb ${MAX_HEALTH_IMPORT_RECORDS} rekordot tartalmazhat.`)
  return { schemaVersion: HEALTH_BRIDGE_VERSION, producer: HEALTH_BRIDGE_PRODUCER, generatedAt, records: payload.records }
}

function mapBridgeRecord(record, profileId) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('A rekord formátuma érvénytelen.')
  if (!['nutrition', 'hydration'].includes(record.type)) throw new Error('Ismeretlen rekordtípus.')
  const externalKey = requiredText(record.externalId, 'Külső azonosító')
  if (!EXTERNAL_ID_PATTERN.test(externalKey)) throw new Error('A külső azonosító formátuma érvénytelen.')
  const sourcePackage = requiredText(record.sourcePackage, 'Forráscsomag')
  const occurredAt = requiredIso(record.startTime, 'Kezdési idő')
  const endTime = requiredIso(record.endTime, 'Befejezési idő')
  if (new Date(endTime) < new Date(occurredAt)) throw new Error('A befejezési idő megelőzi a kezdési időt.')
  const mealType = MEAL_TYPES.has(record.mealType) ? record.mealType : 'afternoonSnack'
  const source = { type: 'manual', id: externalKey, revision: '', attribution: sourcePackage }

  if (record.type === 'hydration') {
    const volume = finiteNonNegative(record.volumeMilliliters, 'Folyadékmennyiség')
    if (!volume) throw new Error('A folyadékmennyiségnek nullánál nagyobbnak kell lennie.')
    return normalizeDiaryEntry({
      id: createFoodId('entry'), profileId, mealType, occurredAt, amount: volume, unit: 'ml', externalKey,
      note: `Health-import · ${sourcePackage}`,
      snapshot: { foodId: '', name: String(record.name || 'Víz').trim() || 'Víz', category: 'Folyadék', source, baseAmount: volume, baseUnit: 'ml', nutrients: {} },
      createdAt: new Date().toISOString(),
    })
  }

  const nutrients = {
    energyKcal: finiteNonNegative(record.energyKcal, 'Energia'),
    protein: finiteNonNegative(record.proteinGrams, 'Fehérje'),
    carbohydrate: finiteNonNegative(record.carbohydrateGrams, 'Szénhidrát'),
    fat: finiteNonNegative(record.fatGrams, 'Zsír'),
  }
  if (Object.values(nutrients).every(value => value === null)) throw new Error('A táplálkozási rekord nem tartalmaz importálható tápértéket.')
  return normalizeDiaryEntry({
    id: createFoodId('entry'), profileId, mealType, occurredAt, amount: 1, unit: 'serving', externalKey,
    note: `Health-import · ${sourcePackage}`,
    snapshot: { foodId: '', name: String(record.name || 'Importált étkezés').trim() || 'Importált étkezés', category: 'Health Connect', source, baseAmount: 1, baseUnit: 'serving', nutrients },
    createdAt: new Date().toISOString(),
  })
}

export function prepareHealthBridgeImport(source, { profileId, existingEntries = [] } = {}) {
  const payload = parseHealthBridgeExport(source)
  const existingKeys = new Set(existingEntries.map(entry => entry.externalKey).filter(Boolean))
  const seenKeys = new Set()
  const records = payload.records.map((record, index) => {
    try {
      const entry = mapBridgeRecord(record, profileId)
      const duplicate = existingKeys.has(entry.externalKey) || seenKeys.has(entry.externalKey)
      seenKeys.add(entry.externalKey)
      return { index, status: duplicate ? 'duplicate' : 'ready', record, entry, error: '' }
    } catch (error) {
      return { index, status: 'invalid', record, entry: null, error: error.message }
    }
  })
  return {
    schemaVersion: payload.schemaVersion,
    producer: payload.producer,
    generatedAt: payload.generatedAt,
    records,
    counts: {
      ready: records.filter(item => item.status === 'ready').length,
      duplicate: records.filter(item => item.status === 'duplicate').length,
      invalid: records.filter(item => item.status === 'invalid').length,
    },
  }
}

export function healthImportEntries(preview, selectedIndexes = null) {
  const selected = selectedIndexes ? new Set(selectedIndexes.map(Number)) : null
  return preview.records
    .filter(item => item.status === 'ready' && (!selected || selected.has(item.index)))
    .map(item => item.entry)
}
