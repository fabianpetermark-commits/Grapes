import { searchFoods } from './food-search.js'

const identity = food => food?.barcode ? 'barcode:' + food.barcode
  : (food?.source?.type || 'manual') + ':' + (food?.source?.id || food?.id)

/**
 * Keep saved foods first; then verified offline and online catalog results.
 * Searching never persists external products. Only an explicit ingredient add
 * can materialize a selected catalog item in the current Food project.
 */
export function recipeIngredientMatches(localFoods, query, {
  offlineFoods = [], remoteFoods = [], favorites = [], entries = [],
} = {}) {
  const term = String(query ?? '').trim()
  if (!term) return []
  const seen = new Set()
  const matches = []
  const add = (food, external) => {
    if (!food?.name || food.kind === 'recipe') return
    const key = identity(food)
    if (seen.has(key)) return
    seen.add(key)
    matches.push({ food, external, value: external ? 'catalog:' + matches.length : food.id })
  }
  for (const food of searchFoods(localFoods.filter(food => food.kind !== 'recipe'), term, {
    favorites, entries,
  }).slice(0, 25)) add(food, false)
  for (const food of offlineFoods.slice(0, 20)) add(food, true)
  for (const food of remoteFoods.slice(0, 30)) add(food, true)
  return matches.slice(0, 60)
}
