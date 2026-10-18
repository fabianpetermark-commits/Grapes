import { CORE_NUTRIENTS } from './food-data.js'
import { normalizeSearchText } from './food-search.js'

/**
 * A recipe-local nutrient override and a manually added food may be different
 * records on purpose. Never delete, merge or rewrite saved IDs or diary data.
 * Reuse only an EXACT manual definition (including any serving conversions).
 */
export function manualFoodFingerprint(food) {
  if (!food || food.kind !== 'manual' || food.source?.type !== 'manual' || food.barcode) return null
  const nutrients = food.nutrients || {}
  const servingShapes = (food.servings || []).map(item => ({
    unit: item.unit,
    grams: item.grams ?? null,
    milliliters: item.milliliters ?? null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const extras = Object.entries(nutrients.extras || {})
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({
    name: normalizeSearchText(food.name),
    category: normalizeSearchText(food.category),
    baseUnit: food.baseUnit,
    nutrients: CORE_NUTRIENTS.map(key => nutrients[key] ?? null),
    extras, servings: servingShapes,
  })
}

export function reusableManualFood(foods = [], candidate) {
  const key = manualFoodFingerprint(candidate)
  if (!key) return null
  return foods.find(food => manualFoodFingerprint(food) === key) || null
}

/**
 * Group same-named MANUAL entries in the search UI while keeping every
 * distinct nutrient variant selectable by expanding the group. Branded foods,
 * USDA records and recipes must remain independent rows.
 */
export function groupFoodSearchResults(foods = []) {
  const result = []
  const groups = new Map()
  for (const food of foods) {
    if (manualFoodFingerprint(food) === null) {
      result.push({ key: 'id:' + food.id, food, variants: [] })
      continue
    }
    const key = 'manual:' + normalizeSearchText(food.name) + ':' + food.baseUnit
    let group = groups.get(key)
    if (!group) {
      group = { key, food, variants: [] }
      groups.set(key, group)
      result.push(group)
    } else group.variants.push(food)
  }
  // Prefer the more useful complete food over an older empty manual entry.
  // Keep all historical variants in the expanded list, including favorites.
  const completeness = food => CORE_NUTRIENTS.slice(0, 4)
    .reduce((total, key) => total + (food?.nutrients?.[key] == null ? 0 : 1), 0)
  for (const group of result) {
    if (!group.variants.length) continue
    const all = [group.food, ...group.variants]
    const preferred = all.reduce((best, food) =>
      completeness(food) > completeness(best) ? food : best, all[0])
    group.food = preferred
    group.variants = all.filter(food => food !== preferred)
  }
  return result
}
