import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestedRecipeYield } from '../src/food/recipe-yield-preview.js'
import { calculateRecipeFood, normalizeRecipe, normalizeFoodItem } from '../src/food/food-data.js'

const flour = normalizeFoodItem({
  id: 'flour', name: 'Liszt', baseUnit: 'g',
  nutrients: { energyKcal: 360, protein: 10, carbohydrate: 73, fat: 1 },
})

test('750 g kész tömeg / 25 g egységtömeg azonnal 30 szelet', () => {
  assert.equal(suggestedRecipeYield('750', '25'), 30)
  assert.equal(suggestedRecipeYield(750, 25), 30)
  const recipe = normalizeRecipe({
    id: 'bread-1', foodId: 'bread-food', ownerProfileId: 'local-food-profile', name: 'Puha kenyér',
    ingredients: [{ id: 'ingredient-1', foodId: flour.id, amount: 400, unit: 'g' }],
    preparedWeight: 750, averageUnitWeight: 25, yieldUnit: 'slice',
  })
  assert.equal(recipe.yieldCount, 30)
  const computed = calculateRecipeFood(recipe, [flour])
  assert.equal(computed.food.servings[0].unit, 'slice')
  assert.equal(computed.food.servings[0].grams, 25)
  assert.equal(computed.totalNutrients.energyKcal / recipe.yieldCount, 48)
})

test('hiányzó, nulla és érvénytelen adat nem okoz hamis vagy végtelen hozamot', () => {
  for (const [weight, unit] of [
    ['', '25'], ['750', ''], ['0', '25'], ['750', '0'],
    ['-750', '25'], ['750', '-25'], ['abc', '25'],
    ['750', 'abc'], [Infinity, '25'], ['750', NaN],
  ]) assert.equal(suggestedRecipeYield(weight, unit), null, String(weight) + '/' + String(unit))
})

test('nem egész darabszámot két tizedesre kerekít, a kézzel megadott hozam elsőbbséget élvez', () => {
  assert.equal(suggestedRecipeYield('750', '27'), 27.78)
  const recipe = normalizeRecipe({
    id: 'bread-manual-1', foodId: 'bread-manual-food', ownerProfileId: 'local-food-profile',
    name: 'Puha kenyér', ingredients: [{ id: 'i-2', foodId: 'flour', amount: 200, unit: 'g' }],
    preparedWeight: 750, averageUnitWeight: 25, yieldCount: 20,
  })
  assert.equal(recipe.yieldCount, 20)
  assert.equal(recipe.averageUnitWeight, 37.5)
})
