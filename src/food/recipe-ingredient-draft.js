import { CORE_NUTRIENTS, createFoodId, normalizeFoodItem, resolveAmountInBase } from './food-data.js'
import { HUNGARIAN_USDA_CATALOG } from './hungarian-food-catalog.js'
import { createHungarianFoodIndex, resolveHungarianFood } from './food-search-method.js'
import { verifiedUsdaFood } from './usda-foods.js'

export const RECIPE_NUTRIENTS = Object.freeze([
  ['energyKcal', 'Energia (kcal)'],
  ['protein', 'Fehérje (g)'],
  ['carbohydrate', 'Szénhidrát (g)'],
  ['fat', 'Zsír (g)'],
])

// Values are exact within a dimension; cross-dimension and household measures
// must be supplied for the particular ingredient, never guessed from density.
export const RECIPE_UNITS = Object.freeze([
  ['g', 'g'], ['dkg', 'dkg'], ['kg', 'kg'],
  ['ml', 'ml'], ['dl', 'dl'], ['l', 'L'],
  ['tsp', 'teáskanál'], ['tbsp', 'evőkanál'], ['pinch', 'csipet'],
])

export function recipeUnitOptions(food) {
  const result = [...RECIPE_UNITS]
  for (const serving of food?.servings || []) {
    if (!result.some(([unit]) => unit === serving.unit)) result.push([serving.unit, serving.name || serving.unit])
  }
  return result
}

export function recipeUnitNeedsConversion(food, unit) {
  if (!food) return !['g', 'dkg', 'kg', 'ml', 'dl', 'l'].includes(unit)
  try {
    resolveAmountInBase(food, 1, unit)
    return false
  } catch {
    return true
  }
}

export function manualRecipeBaseUnit(unit) {
  return ['ml', 'dl', 'l'].includes(unit) ? 'ml' : 'g'
}

export function recipeNutrientInputs(food) {
  return Object.fromEntries(RECIPE_NUTRIENTS.map(([key]) => [key, food?.nutrients?.[key] ?? '']))
}

function normalizeNutrientInput(raw, label) {
  if (raw === '' || raw === null || raw === undefined) return null
  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(label + ' nem lehet negatív vagy érvénytelen.')
  return numeric
}

/**
 * Make one ingredient's private food record when nutrient edits or user-given
 * measures change its meaning. Do not mutate a shared catalog/custom food.
 * Empty nutrient inputs mean UNKNOWN (null), not zero.
 */
export function prepareRecipeIngredientFood({
  chosen = null, name = '', unit, nutrients = {}, conversionAmount = null,
  createId = () => createFoodId('food'),
} = {}) {
  const trimmed = String(name || chosen?.name || '').trim()
  if (!trimmed) throw new Error('Írd be a hozzávaló nevét.')
  if (!unit || !recipeUnitOptions(chosen).some(([candidate]) => candidate === unit)) {
    throw new Error('Válassz egy érvényes mértékegységet.')
  }
  const baseUnit = chosen?.baseUnit || manualRecipeBaseUnit(unit)
  const now = new Date().toISOString()
  const original = chosen
    ? normalizeFoodItem({ ...chosen, id: chosen.id || createId() })
    : normalizeFoodItem({
      id: createId(), name: trimmed, kind: 'manual', category: 'Saját hozzávaló',
      baseUnit, source: { type: 'manual' }, createdAt: now, updatedAt: now,
      nutrients: {}, servings: [],
    })
  const nextNutrients = { ...original.nutrients }
  let modified = false
  for (const [key, label] of RECIPE_NUTRIENTS) {
    const value = normalizeNutrientInput(nutrients[key], label)
    if (value !== original.nutrients[key]) modified = true
    nextNutrients[key] = value
  }
  const needsConversion = recipeUnitNeedsConversion(original, unit)
  let extraServing = null
  if (needsConversion) {
    const amount = Number(conversionAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Add meg, hogy 1 ' + (RECIPE_UNITS.find(([key]) => key === unit)?.[1] || unit) + ' hány ' + baseUnit + '.')
    }
    extraServing = {
      id: createFoodId('serving'),
      unit, name: RECIPE_UNITS.find(([key]) => key === unit)?.[1] || unit,
      grams: baseUnit === 'g' ? amount : null,
      milliliters: baseUnit === 'ml' ? amount : null,
    }
  }
  const usePrivateCopy = modified || Boolean(extraServing)
  const food = usePrivateCopy && chosen
    ? normalizeFoodItem({
        ...original,
        id: createId(),
        barcode: '',
        kind: 'manual',
        source: { type: 'manual', attribution: 'Recept saját hozzávalóadatai' },
        nutrients: nextNutrients,
        servings: [...original.servings, ...(extraServing ? [extraServing] : [])],
        createdAt: now, updatedAt: now,
      })
    : normalizeFoodItem({
        ...original,
        nutrients: nextNutrients,
        servings: [...original.servings, ...(extraServing ? [extraServing] : [])],
      })
  // Verify the exact selected quantity can be converted before persisting.
  const resolved = resolveAmountInBase(food, 1, unit, extraServing?.id || '')
  if (!Number.isFinite(resolved) || resolved <= 0) throw new Error('A kiválasztott mértékegység nem váltható át.')
  return { food, servingId: extraServing?.id || food.servings.find(item => item.unit === unit)?.id || '', isPrivateCopy: usePrivateCopy }
}


const verifiedStaplesIndex = createHungarianFoodIndex(HUNGARIAN_USDA_CATALOG)

/**
 * An explicit, recipe-local repair opportunity for legacy manually added
 * ingredients with missing nutrition. Only an exact, unique, verified USDA
 * name/alias match is accepted; partial/ambiguous names must never be used.
 * Existing non-null user values and branded/online records are immutable.
 */
export function suggestVerifiedRecipeNutrientRepairs(ingredients = [], foods = []) {
  const byId = new Map(foods.map(food => [food.id, food]))
  return ingredients.flatMap(ingredient => {
    const food = byId.get(ingredient.foodId)
    if (!food || food.kind !== 'manual' || food.source?.type !== 'manual'
      || food.barcode || food.baseUnit !== 'g') return []
    const result = resolveHungarianFood(food.name, verifiedStaplesIndex)
    if (result.status !== 'match') return []
    const verified = verifiedUsdaFood(result.match)
    if (!verified || verified.baseUnit !== food.baseUnit) return []
    const fields = RECIPE_NUTRIENTS.map(([key]) => key)
      .filter(key => food.nutrients?.[key] == null && verified.nutrients[key] != null)
    if (!fields.length) return []
    const nutrients = { ...food.nutrients }
    for (const key of CORE_NUTRIENTS) {
      if (nutrients[key] == null && verified.nutrients[key] != null) nutrients[key] = verified.nutrients[key]
    }
    return [{
      ingredientId: ingredient.id, foodId: food.id, name: food.name,
      fdcId: verified.source.id, fields, nutrients,
    }]
  })
}

/**
 * The returned records are new private copies. Call only after the user
 * confirms: existing custom foods, other recipes and logged snapshots stay
 * unchanged. The caller still must explicitly save the recipe.
 */
export function applyVerifiedRecipeNutrientRepairs(ingredients = [], foods = [], {
  createId = () => createFoodId('food'),
} = {}) {
  const suggestions = suggestVerifiedRecipeNutrientRepairs(ingredients, foods)
  const byIngredientId = new Map(suggestions.map(item => [item.ingredientId, item]))
  const byFoodId = new Map(foods.map(food => [food.id, food]))
  const copiedFoods = new Map()
  const addedFoods = []
  const revisedIngredients = ingredients.map(ingredient => {
    const suggested = byIngredientId.get(ingredient.id)
    if (!suggested) return { ...ingredient }
    let copy = copiedFoods.get(suggested.foodId)
    if (!copy) {
      const original = byFoodId.get(suggested.foodId)
      const now = new Date().toISOString()
      copy = normalizeFoodItem({
        ...original, id: createId(), barcode: '', kind: 'manual',
        nutrients: suggested.nutrients,
        source: {
          type: 'manual',
          attribution: 'Recept saját hozzávalója: a hiányzó tápértékeket ellenőrzött USDA SR Legacy FDC '
            + suggested.fdcId + ' értékekből pótoltuk',
        },
        createdAt: now, updatedAt: now,
      })
      copiedFoods.set(suggested.foodId, copy)
      addedFoods.push(copy)
    }
    return { ...ingredient, foodId: copy.id }
  })
  return { ingredients: revisedIngredients, addedFoods, repaired: suggestions }
}
