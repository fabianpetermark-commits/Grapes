import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyFoodProject } from '../src/food/food-data.js'
import { createHomeState, applyHomeCommand } from '../src/home/home-data.js'
import { readLocalFoodRecipes, reviewRecipeAgainstInventory } from '../src/home/home-food-recipes.js'

const profile = { id: 'local-food-profile', name: 'Helyi profil', email: '', photo: '' }
function savedFoodProject() {
  const data = createEmptyFoodProject(profile)
  data.customFoods.push({ id: 'chicken', name: 'Csirkemell', baseUnit: 'g' })
  data.recipes.push({
    id: 'recipe-1', foodId: 'prepared-chicken', ownerProfileId: profile.id,
    name: 'Csirkés étel', category: 'Ebéd', ingredients: [{ id: 'ingredient-1', foodId: 'chicken', amount: 500, unit: 'g' }],
    yieldCount: 4, yieldUnit: 'serving', revision: 1,
    createdAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z',
  })
  return { id: `food-tracker-${profile.id}`, data, updatedAt: '2026-10-19T11:00:00.000Z' }
}

test('M2 Food híd: csak az aktív profil helyi receptjét vetíti ki, írás nélkül', async () => {
  const saved = savedFoodProject()
  const original = JSON.stringify(saved)
  const result = await readLocalFoodRecipes(profile.id, async id => {
    assert.equal(id, saved.id)
    return saved
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.recipes.length, 1)
  assert.equal(result.recipes[0].ingredients[0].name, 'Csirkemell')
  assert.equal(result.recipes[0].yieldCount, 4)
  assert.equal(JSON.stringify(saved), original)
  assert.equal('diaryEntries' in result, false)
})

test('M2 Food híd: más profil mentése és hiányzó mentés nem lesz receptforrás', async () => {
  await assert.rejects(readLocalFoodRecipes('other-profile', async () => savedFoodProject()), /másik Google-fiókhoz/)
  assert.deepEqual(await readLocalFoodRecipes(profile.id, async () => null), { status: 'empty', recipes: [], savedAt: null })
})

test('H-18/H-19: recept megtekintése és névegyezés nem mozgat készletet és nem igazol főzhetőséget', async () => {
  const { recipes } = await readLocalFoodRecipes(profile.id, async () => savedFoodProject())
  let home = createHomeState({ householdId: 'household-test' })
  home = applyHomeCommand(home, { type: 'StockCountConfirmed', payload: { name: 'Csirkemell', quantity: '600', unit: 'g', storageLocation: 'fridge' } }).state
  const before = JSON.stringify(home)
  const review = reviewRecipeAgainstInventory(recipes[0], home.inventory)
  assert.equal(review.status, 'review')
  assert.equal(review.ingredients[0].possibleNameMatch, true)
  assert.equal(JSON.stringify(home), before)
  assert.equal(home.events.length, 1)
  assert.equal(reviewRecipeAgainstInventory(recipes[0], []).ingredients[0].possibleNameMatch, false)
})
