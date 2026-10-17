import { createFoodId, normalizeDiaryEntry } from './food-data.js'

export const MAX_YAZIO_IMPORT_ROWS = 50000

function parseCsvRows(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ','
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === delimiter && !quoted) {
      row.push(value); value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value); value = ''
      if (row.some(cell => cell.trim())) rows.push(row)
      row = []
    } else value += character
  }
  if (quoted) throw new Error('A Yazio CSV-ben lezáratlan idézőjel található.')
  row.push(value)
  if (row.some(cell => cell.trim())) rows.push(row)
  return rows
}

const headerKey = value => String(value ?? '').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '')
const numberValue = value => {
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function dateTime(dateValue, timeValue) {
  const time = String(timeValue || '').trim()
  const direct = new Date(time)
  if (time && !Number.isNaN(direct.getTime())) return direct.toISOString()
  const date = String(dateValue || '').trim()
  const combined = new Date(`${date}T${/^\d{1,2}:\d{2}/.test(time) ? time : '12:00'}:00`)
  if (Number.isNaN(combined.getTime())) throw new Error('Érvénytelen Yazio dátum vagy időpont.')
  return combined.toISOString()
}

function mealType(value, occurredAt) {
  const meal = headerKey(value)
  if (['breakfast', 'reggeli'].includes(meal)) return 'breakfast'
  if (['lunch', 'ebed'].includes(meal)) return 'lunch'
  if (['dinner', 'vacsora'].includes(meal)) return 'dinner'
  if (['morningsnack', 'tizorai'].includes(meal)) return 'morningSnack'
  if (['afternoonsnack', 'uzsonna'].includes(meal)) return 'afternoonSnack'
  return new Date(occurredAt).getHours() < 13 ? 'morningSnack' : 'afternoonSnack'
}

function stableKey(parts) {
  let hash = 14695981039346656037n
  for (const character of parts.join('\u001f')) {
    hash ^= BigInt(character.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 1099511628211n)
  }
  return `yazio:${hash.toString(16).padStart(16, '0')}`
}

function legacyStableKey(parts) {
  let hash = 2166136261
  for (const character of parts.join('\u001f')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `yazio:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

const sameNutrients = (entry, nutrients) => ['energyKcal', 'protein', 'fat', 'carbohydrate']
  .every(key => (entry?.snapshot?.nutrients?.[key] ?? null) === (nutrients[key] ?? null))

export function prepareYazioCsvImport(source, { profileId, existingEntries = [] } = {}) {
  const rows = parseCsvRows(source)
  if (rows.length < 2) throw new Error('A Yazio CSV nem tartalmaz importálható étkezéseket.')
  if (rows.length - 1 > MAX_YAZIO_IMPORT_ROWS) throw new Error(`Egy import legfeljebb ${MAX_YAZIO_IMPORT_ROWS} sort tartalmazhat.`)
  const headers = rows[0].map(headerKey)
  const column = (...names) => names.map(headerKey).map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1
  const columns = {
    date: column('Date', 'Dátum'), time: column('Time', 'Idő'), meal: column('Meal', 'Étkezés'), product: column('Product', 'Termék'),
    amount: column('Amount', 'Mennyiség'), unit: column('Unit', 'Egység'), energy: column('Calories total', 'Kalória összesen'),
    protein: column('Protein total', 'Fehérje összesen'), fat: column('Fat total', 'Zsír összesen'), carbohydrate: column('Carbs total', 'Szénhidrát összesen'),
  }
  for (const required of ['date', 'meal', 'product', 'energy']) if (columns[required] < 0) throw new Error('Nem a támogatott Yazio nutrition_log.csv fájlt választottad.')
  const existingByKey = new Map(existingEntries.filter(entry => entry.externalKey).map(entry => [entry.externalKey, entry]))
  const seen = new Set()
  const records = rows.slice(1).map((row, index) => {
    try {
      const get = key => columns[key] < 0 ? '' : row[columns[key]]
      const occurredAt = dateTime(get('date'), get('time'))
      const name = String(get('product') || '').trim()
      if (!name) throw new Error('Hiányzó terméknév.')
      const nutrients = {
        energyKcal: numberValue(get('energy')),
        protein: numberValue(get('protein')),
        carbohydrate: numberValue(get('carbohydrate')),
        fat: numberValue(get('fat')),
      }
      if (nutrients.energyKcal === null) throw new Error('Hiányzó kalóriaérték.')
      const externalKey = stableKey([
        get('date'), get('time'), get('meal'), name, get('amount'), get('unit'), get('energy'),
        get('protein'), get('fat'), get('carbohydrate'),
      ])
      const legacyKey = legacyStableKey([get('date'), get('time'), get('meal'), name, get('amount'), get('unit'), get('energy')])
      const entry = normalizeDiaryEntry({
        id: createFoodId('entry'), profileId, mealType: mealType(get('meal'), occurredAt), occurredAt, amount: 1, unit: 'serving', externalKey,
        note: `Yazio import · ${String(get('amount') || '').trim()} ${String(get('unit') || '').trim()}`.trim(),
        snapshot: { foodId: '', name, category: 'Yazio', source: { type: 'manual', id: externalKey, attribution: 'YAZIO' }, baseAmount: 1, baseUnit: 'serving', nutrients },
      })
      const legacyEntry = existingByKey.get(legacyKey)
      const duplicate = existingByKey.has(externalKey) || (legacyEntry && sameNutrients(legacyEntry, nutrients)) || seen.has(externalKey)
      seen.add(externalKey)
      return { index, status: duplicate ? 'duplicate' : 'ready', entry, error: '' }
    } catch (error) { return { index, status: 'invalid', entry: null, error: error.message } }
  })
  return {
    records,
    counts: {
      ready: records.filter(item => item.status === 'ready').length,
      duplicate: records.filter(item => item.status === 'duplicate').length,
      invalid: records.filter(item => item.status === 'invalid').length,
    },
  }
}

export function yazioImportEntries(preview) {
  return preview.records.filter(item => item.status === 'ready').map(item => item.entry)
}
