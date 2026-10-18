import { HUNGARIAN_USDA_CATALOG } from './hungarian-food-catalog.js'
import { createHungarianFoodIndex, searchHungarianFoods } from './food-search-method.js'

// Published USDA FoodData Central data per 100 g, keyed by verified FDC identity.
// Missing nutrients are null (never guessed zeros).
// Order: kcal, protein, carbohydrate, fat, fiber, sugar, saturatedFat.
const NUTRIENTS_PER_100G = Object.freeze({
  // SR Legacy: refined white granulated sugar; not a sugar substitute.
  169655: [387, 0, 99.98, 0, 0, 99.8, 0],
  // SR Legacy: plain table salt (no calories or energy macronutrients).
  173468: [0, 0, 0, 0, 0, 0, 0],
  // SR Legacy: drinking tap water; water is not an unknown-calorie food.
  173647: [0, 0, 0, 0, 0, 0, 0],
  170000: [40, 1.1, 9.34, 0.1, 1.7, 4.24, 0.042],
  1104647: [143, 6.62, 28.2, 0.38, 2.7, null, null],
  169761: [364, 10.3, 76.3, 0.98, 2.7, 0.27, 0.155],
  170393: [41, 0.93, 9.58, 0.24, 2.8, 4.74, null],
  168448: [26, 1, 6.5, 0.1, 0.5, 2.76, null],
  2346404: [79, 1.6, 17.3, 0.4, null, 6.1, null],
  747447: [31, 2.57, 6.27, 0.34, 2.4, null, null],
  169291: [17, 1.21, 3.11, 0.32, 1, 2.5, null],
  170108: [26, 0.99, 6.03, 0.3, 2.1, 4.2, null],
  167746: [29, 1.1, 9.32, 0.3, 2.8, 2.5, 0.039],
})
const nutrientKeys = ['energyKcal', 'protein', 'carbohydrate', 'fat', 'fiber', 'sugar', 'saturatedFat']
const index = createHungarianFoodIndex(HUNGARIAN_USDA_CATALOG)

export function verifiedUsdaFood(record) {
  if (!record?.verified || !Number.isInteger(record.fdcId)) return null
  const values = NUTRIENTS_PER_100G[record.fdcId]
  if (!Array.isArray(values) || values.length !== nutrientKeys.length
    || values.slice(0, 4).some(value => !Number.isFinite(value) || value < 0)) return null
  return {
    kind: 'generic', name: record.nameHu,
    category: 'Alapanyag · ' + (record.preparation === 'raw' ? 'nyers' : 'feldolgozott'),
    baseUnit: 'g', barcode: '',
    nutrients: Object.fromEntries(nutrientKeys.map((key, i) => [key, values[i]])),
    verified: true,
    source: { type: 'usda', id: String(record.fdcId), revision: record.verification.checkedAt,
      attribution: 'USDA FoodData Central · ' + record.dataType },
  }
}

export function searchVerifiedUsdaFoods(query, options = {}) {
  return searchHungarianFoods(query, index, options).map(verifiedUsdaFood).filter(Boolean)
}
