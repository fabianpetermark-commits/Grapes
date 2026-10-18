import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateRecipeFood, normalizeDiaryEntry, normalizeFoodItem, normalizeFoodProject,
  createEmptyFoodProject, nutrientsForAmount,
} from '../src/food/food-data.js'
import { applyVerifiedRecipeNutrientRepairs, suggestVerifiedRecipeNutrientRepairs } from '../src/food/recipe-ingredient-draft.js'
import { searchVerifiedUsdaFoods } from '../src/food/usda-foods.js'

const profile = { id: 'staple-test-profile', name: 'Local Test' }
const manual = (id, name, nutrients = {}) => normalizeFoodItem({
  id, kind: 'manual', name, source: { type: 'manual' }, baseUnit: 'g', nutrients,
})
const flour = normalizeFoodItem({ ...searchVerifiedUsdaFoods('BL55')[0], id: 'flour-known' })
const originalFoods = [
  manual('salt-unknown', 'Só'),
  manual('sugar-unknown', 'Cukor'),
  flour,
  manual('water-unknown', 'Víz'),
]
const recipe = {
  id: 'soft-bread', foodId: 'soft-bread-food', ownerProfileId: profile.id, name: 'Puha kenyér',
  preparedWeight: 750, averageUnitWeight: 25, yieldCount: 30, yieldUnit: 'slice',
  ingredients: [
    { id: 'i-salt', foodId: 'salt-unknown', amount: 5, unit: 'g' },
    { id: 'i-sugar', foodId: 'sugar-unknown', amount: 5, unit: 'g' },
    { id: 'i-flour', foodId: 'flour-known', amount: 400, unit: 'g' },
    { id: 'i-water', foodId: 'water-unknown', amount: 350, unit: 'g' },
  ],
}

test('Puha kenyér: só, cukor és víz hiányzó USDA-tápértékei felismerhetők offline', () => {
  const missing = suggestVerifiedRecipeNutrientRepairs(recipe.ingredients, originalFoods)
  assert.deepEqual(missing.map(item => item.name), ['Só', 'Cukor', 'Víz'])
  assert.deepEqual(missing.map(item => item.fdcId), ['173468', '169655', '173647'])
  assert.ok(missing.every(item => item.fields.length === 4))
  assert.equal(calculateRecipeFood(recipe, originalFoods).totalNutrients.energyKcal, null)
  assert.equal(originalFoods[0].nutrients.energyKcal, null)
})

test('megerősített pótlás csak recepthez kapcsolt privát hozzávaló-másolatot készít, a reggeli makrókat számolja', () => {
  const counter = { n: 0 }
  const result = applyVerifiedRecipeNutrientRepairs(recipe.ingredients, originalFoods, {
    createId: () => 'recipe-private-' + ++counter.n,
  })
  assert.equal(result.repaired.length, 3)
  assert.equal(result.addedFoods.length, 3)
  assert.equal(result.ingredients[2].foodId, flour.id)
  const combined = [...originalFoods, ...result.addedFoods]
  const resolved = calculateRecipeFood({ ...recipe, ingredients: result.ingredients }, combined)
  assert.equal(resolved.totalNutrients.energyKcal, 1475.35)
  assert.equal(resolved.totalNutrients.protein, 41.2)
  assert.equal(resolved.totalNutrients.carbohydrate, 310.2)
  assert.equal(resolved.totalNutrients.fat, 3.92)
  assert.equal(resolved.food.servings[0].grams, 25)
  assert.equal(resolved.food.nutrients.energyKcal, 196.71)
  const logged = nutrientsForAmount(resolved.food, 2, 'slice', resolved.food.servings[0].id)
  assert.equal(logged.nutrients.energyKcal, 98.36)
  assert.ok(logged.nutrients.protein > 0)
  assert.ok(logged.nutrients.carbohydrate > 0)
  assert.ok(logged.nutrients.fat > 0)
  for (const old of originalFoods.filter(food => food.kind === 'manual')) {
    assert.equal(old.nutrients.energyKcal, null, 'Eredeti, megosztott ' + old.name + ' nem íródhat át.')
  }

  const project = createEmptyFoodProject(profile)
  project.customFoods = [...combined, resolved.food]
  project.recipes = [{ ...recipe, ingredients: result.ingredients }]
  assert.doesNotThrow(() => normalizeFoodProject(project))
})

test('korábban naplózott ismeretlen snapshotot nem ír át a recept javítása', () => {
  const before = calculateRecipeFood(recipe, originalFoods)
  const beforeEntry = normalizeDiaryEntry({
    id: 'old-breakfast', profileId: profile.id, mealType: 'breakfast',
    amount: 2, unit: 'slice', servingId: before.food.servings[0].id,
  }, before.food)
  const fixed = applyVerifiedRecipeNutrientRepairs(recipe.ingredients, originalFoods)
  const after = calculateRecipeFood({ ...recipe, ingredients: fixed.ingredients },
    [...originalFoods, ...fixed.addedFoods])
  assert.equal(beforeEntry.snapshot.nutrients.energyKcal, null)
  assert.equal(beforeEntry.snapshot.nutrients.energyKcal, null)
  assert.ok(after.food.nutrients.energyKcal > 0)
  const next = normalizeDiaryEntry({
    id: 'new-breakfast', profileId: profile.id, mealType: 'breakfast',
    amount: 2, unit: 'slice', servingId: after.food.servings[0].id,
  }, after.food)
  assert.ok(next.snapshot.nutrients.energyKcal > 0)
})

test('csak üres mezőket pótol, kézzel megadott 0-t vagy értéket nem ír felül', () => {
  const saved = manual('sugar-partial', 'Cukor',
    { energyKcal: 0, protein: 1, carbohydrate: null, fat: null })
  const updated = applyVerifiedRecipeNutrientRepairs([
    { id: 'one', foodId: saved.id, amount: 4, unit: 'g' },
  ], [saved])
  assert.equal(updated.addedFoods.length, 1)
  assert.equal(updated.addedFoods[0].nutrients.energyKcal, 0)
  assert.equal(updated.addedFoods[0].nutrients.protein, 1)
  assert.equal(updated.addedFoods[0].nutrients.carbohydrate, 99.98)
  assert.equal(updated.addedFoods[0].nutrients.fat, 0)
})

test('ismeretlen/egyéb cukor, jelöletlen variáns, ml-egység vagy nem saját étel nem javítható automatikusan', () => {
  const invalid = [
    manual('other', 'Cukormentes édesítőszer'),
    manual('brown', 'Barnacukor'),
    manual('mixture', 'Fűszeres sókeverék'),
    normalizeFoodItem({ id: 'off', name: 'Cukor', kind: 'product',
      source: { type: 'openfoodfacts', id: '5991234567890' } }),
    normalizeFoodItem({ id: 'water-ml', name: 'Víz', kind: 'manual',
      source: { type: 'manual' }, baseUnit: 'ml' }),
  ]
  const list = invalid.map((food, i) => ({
    id: 'invalid-' + i, foodId: food.id, amount: 100, unit: food.baseUnit,
  }))
  assert.deepEqual(suggestVerifiedRecipeNutrientRepairs(list, invalid), [])
  const result = applyVerifiedRecipeNutrientRepairs(list, invalid)
  assert.equal(result.addedFoods.length, 0)
  assert.deepEqual(result.ingredients, list)
})

test('ugyanarra a közös hozzávalóra két recept-összetevő csak egy privát másolatot készít', () => {
  const sugar = manual('shared-sugar', 'Cukor')
  const list = [
    { id: 'first', foodId: sugar.id, amount: 5, unit: 'g' },
    { id: 'second', foodId: sugar.id, amount: 3, unit: 'g' },
  ]
  const updated = applyVerifiedRecipeNutrientRepairs(list, [sugar])
  assert.equal(updated.addedFoods.length, 1)
  assert.equal(updated.ingredients[0].foodId, updated.ingredients[1].foodId)
  assert.equal(list[0].foodId, 'shared-sugar')
})
