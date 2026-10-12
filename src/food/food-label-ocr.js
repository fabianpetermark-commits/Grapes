const LABELS = {
  protein: /\b(?:feh[eé]rje|protein)\b/i,
  carbohydrate: /\b(?:sz[eé]nhidr[aá]t|carbohydrate|carbohydrates)\b/i,
  fat: /\b(?:zs[ií]r|fat)\b/i,
  fiber: /\b(?:rost|fibre|fiber)\b/i,
  sugar: /\b(?:cukrok?|sugars?)\b/i,
  saturatedFat: /(?:tel[ií]tett\s+zs[ií]r|amelyb[oő]l\s+tel[ií]tett|saturates?|saturated\s+fat)/i,
  salt: /(?:s[oó](?:\s|$)|salt\b)/i,
  sodium: /(?:n[aá]trium|sodium\b)/i,
}

function numberFrom(value) {
  const normalized = String(value || '').replace(/\s/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function amountFromLine(line, unitPattern = '(?:g|mg)') {
  const matches = [...String(line).matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})\\b`, 'ig'))]
  if (!matches.length) return null
  const match = matches.at(-1)
  const amount = numberFrom(match[1])
  if (amount === null) return null
  return match[2].toLocaleLowerCase('hu-HU') === 'mg' ? amount / 1000 : amount
}

function energyFromLine(line) {
  const kcal = String(line).match(/(\d+(?:[.,]\d+)?)\s*kcal\b/i)
  if (kcal) return numberFrom(kcal[1])
  const kj = String(line).match(/(\d+(?:[.,]\d+)?)\s*k[jj]\b/i)
  const value = kj ? numberFrom(kj[1]) : null
  return value === null ? null : Number((value / 4.184).toFixed(2))
}

export function parseNutritionLabelText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const joined = lines.join(' ')
  const per100 = /(?:100\s*(g|ml)|per\s+100\s*(g|ml))/i.exec(joined)
  const serving = /(?:adagonk[eé]nt|egy\s+adag|per\s+serving)[^\d]{0,20}(\d+(?:[.,]\d+)?)?\s*(g|ml)?/i.exec(joined)
  const basis = per100
    ? { type: 'per100', baseUnit: (per100[1] || per100[2]).toLocaleLowerCase('hu-HU'), amount: 100 }
    : { type: 'serving', baseUnit: serving?.[2]?.toLocaleLowerCase('hu-HU') || 'g', amount: numberFrom(serving?.[1]) }
  const nutrients = { energyKcal: null, protein: null, carbohydrate: null, fat: null, fiber: null, sugar: null, saturatedFat: null, salt: null }
  for (const line of lines) {
    if (/(?:energia|energy)/i.test(line)) nutrients.energyKcal ??= energyFromLine(line)
    for (const key of ['protein', 'carbohydrate', 'fiber', 'sugar', 'saturatedFat', 'fat', 'salt']) {
      if (key === 'fat' && LABELS.saturatedFat.test(line)) continue
      if (nutrients[key] === null && LABELS[key].test(line)) nutrients[key] = amountFromLine(line)
    }
    if (nutrients.salt === null && LABELS.sodium.test(line)) {
      const sodium = amountFromLine(line)
      if (sodium !== null) nutrients.salt = Number((sodium * 2.5).toFixed(3))
    }
  }
  const found = Object.values(nutrients).filter(value => value !== null).length
  const warnings = []
  if (!per100) warnings.push('A 100 g / 100 ml alap nem volt biztosan felismerhető.')
  if (!found) warnings.push('Nem sikerült tápértéket felismerni.')
  if (nutrients.energyKcal === null) warnings.push('Az energiaérték hiányzik.')
  return { basis, nutrients, found, warnings, rawText: String(text || '') }
}

export function nutritionSuggestionPer100(suggestion, { basisType = suggestion?.basis?.type, baseUnit = suggestion?.basis?.baseUnit, servingAmount = suggestion?.basis?.amount } = {}) {
  if (!suggestion?.nutrients) throw new Error('Nincs jóváhagyható OCR-javaslat.')
  const unit = ['g', 'ml'].includes(baseUnit) ? baseUnit : 'g'
  const amount = basisType === 'per100' ? 100 : Number(servingAmount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Adagonkénti címkénél add meg az adag tömegét vagy térfogatát.')
  const factor = 100 / amount
  return {
    baseUnit: unit,
    nutrients: Object.fromEntries(Object.entries(suggestion.nutrients).map(([key, value]) => [key, value === null ? null : Number((value * factor).toFixed(2))])),
  }
}

export async function recognizeNutritionLabelImage(image, onProgress = () => {}) {
  if (typeof globalThis.__GRAPES_RECEIPT_OCR_TEST__ === 'function') {
    const text = await globalThis.__GRAPES_RECEIPT_OCR_TEST__(image, onProgress)
    return parseNutritionLabelText(text)
  }
  const { recognizeReceiptImage } = await import('../receipt-ocr.js')
  const text = await recognizeReceiptImage(image, onProgress)
  return parseNutritionLabelText(text)
}
