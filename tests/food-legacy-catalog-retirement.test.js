import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createEmptyFoodProject, normalizeFoodItem, normalizeFoodProject, foodBackupToJson, foodBackupFromJson } from '../src/food/food-data.js'

test('the retired 20-item pantry is not bundled into the mobile Food search', () => {
  assert.equal(existsSync(new URL('../src/food/food-offline-catalog.js', import.meta.url)), false)
  const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
  assert.doesNotMatch(mobile, /searchOfflineBasicFoods|food-offline-catalog|offlineFoods/)
  assert.match(mobile, /searchFoodCatalog\(query\)/)
})

test('previously saved legacy USDA foods and user favorites survive project reload and backup', () => {
  const profile = { id: 'google-user-1', name: 'Food Test', email: 'food@example.com' }
  const project = createEmptyFoodProject(profile)
  const food = normalizeFoodItem({
    id: 'food-saved-usda-oats',
    kind: 'generic',
    name: 'Zabpehely',
    baseUnit: 'g',
    source: { type: 'usda', id: 'usda-oats', attribution: 'USDA FoodData Central · SR Legacy' },
    nutrients: { energyKcal: 389, protein: 16.89, carbohydrate: 66.27, fat: 6.9 },
  })
  project.customFoods.push(food)
  project.favorites.push(food.id)
  const reloaded = normalizeFoodProject(project, profile.id)
  assert.equal(reloaded.customFoods[0].source.id, 'usda-oats')
  assert.equal(reloaded.customFoods[0].nutrients.energyKcal, 389)
  assert.deepEqual(reloaded.favorites, [food.id])
  const restored = foodBackupFromJson(foodBackupToJson(reloaded), profile.id)
  assert.equal(restored.customFoods[0].name, 'Zabpehely')
  assert.deepEqual(restored.favorites, [food.id])
})
