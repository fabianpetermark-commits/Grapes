import test from 'node:test'
import assert from 'node:assert/strict'
import { HUNGARIAN_USDA_CATALOG } from '../src/food/hungarian-food-catalog.js'
import { searchVerifiedUsdaFoods, verifiedUsdaFood } from '../src/food/usda-foods.js'
import { searchFoodCatalog } from '../src/food/food-catalog-search.js'
import { createEmptyFoodProject, foodBackupFromJson, foodBackupToJson, normalizeDiaryEntry, normalizeFoodItem } from '../src/food/food-data.js'

test('mind a tíz ellenőrzött USDA-élelmiszerhez tartozik offline makró', () => {
  assert.equal(HUNGARIAN_USDA_CATALOG.length, 10)
  for (const record of HUNGARIAN_USDA_CATALOG) {
    const food = verifiedUsdaFood(record)
    assert.equal(food.name, record.nameHu)
    assert.equal(food.source.id, String(record.fdcId))
    assert.equal(food.verified, true)
    for (const key of ['energyKcal', 'protein', 'carbohydrate', 'fat'])
      assert.ok(Number.isFinite(food.nutrients[key]))
    normalizeFoodItem({ ...food, id: 'verified-' + record.id })
  }
})

test('magyar név és BL55-alakok kereshetők, vonalkódra nincs USDA-találat', () => {
  for (const query of ['BL55', 'BL 55', 'bl-55'])
    assert.deepEqual(searchVerifiedUsdaFoods(query).map(food => food.source.id), ['169761'])
  assert.deepEqual(searchVerifiedUsdaFoods('fokhagyma').map(food => food.source.id), ['1104647'])
  assert.deepEqual(searchVerifiedUsdaFoods('5991234567890'), [])
})

test('OFF hiba mellett is megmarad a megjeleníthető offline USDA', async () => {
  const result = await searchFoodCatalog('vöröshagyma', { offSearch: async () => { throw Error('offline') }, usdaSearch: async () => ({ count: 0, products: [] }) })
  assert.equal(result.partial, true)
  assert.equal(result.unavailable, false)
  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].nutrients.energyKcal, 40)
  assert.equal(result.products[0].source.id, '170000')
})

test('napló, forrás és kedvenc megmarad mentés-visszatöltés után', () => {
  const profile = { id: 'offline-usda-profile', name: 'Test' }
  const project = createEmptyFoodProject(profile)
  const food = normalizeFoodItem({ ...searchVerifiedUsdaFoods('vöröshagyma')[0], id: 'usda-170000' })
  project.customFoods.push(food)
  project.favorites.push(food.id)
  project.diaryEntries.push(normalizeDiaryEntry({
    id: 'usda-entry', profileId: profile.id, mealType: 'lunch', amount: 150,
    unit: 'g', occurredAt: '2026-10-16T12:00:00.000Z',
  }, food))
  const restored = foodBackupFromJson(foodBackupToJson(project), profile.id)
  assert.equal(restored.customFoods[0].source.id, '170000')
  assert.equal(restored.diaryEntries[0].snapshot.nutrients.energyKcal, 60)
  assert.deepEqual(restored.favorites, [food.id])
})
