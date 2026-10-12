import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRecipeLibrary, copyLibraryRecipeToProject, libraryRole, normalizeRecipeLibrary, sharedFoodsFromLibraries } from '../src/food/food-library.js'
import { createEmptyFoodProject, normalizeFoodItem } from '../src/food/food-data.js'

const profile = { id: 'owner-id', name: 'Tulajdonos', email: 'owner@example.com' }

function projectWithRecipe() {
  const project = createEmptyFoodProject(profile)
  project.customFoods = [normalizeFoodItem({ id: 'base-food', name: 'Alapanyag', nutrients: { energyKcal: 100, protein: 10 }, createdAt: '2026-10-12T10:00:00.000Z' })]
  project.recipes = [{ id: 'recipe-1', foodId: 'recipe-food-1', ownerProfileId: profile.id, name: 'Családi recept', ingredients: [{ id: 'ingredient-1', foodId: 'base-food', amount: 200, unit: 'g' }], preparedWeight: 180, createdAt: '2026-10-12T10:00:00.000Z' }]
  return project
}

test('külön receptkönyvtárba publikál, napló és célok nélkül', () => {
  const library = buildRecipeLibrary(projectWithRecipe(), { id: 'family-1', name: 'Családi', ownerEmail: profile.email })
  assert.equal(library.recipes.length, 1)
  assert.equal(library.publishedFoods[0].nutrients.energyKcal, 111.11)
  assert.equal('diaryEntries' in library, false)
  assert.equal('targets' in library, false)
})

test('tulajdonos, szerkesztő és olvasó szerepet különböztet meg', () => {
  const library = buildRecipeLibrary(projectWithRecipe(), { ownerEmail: profile.email, members: [{ email: 'writer@example.com', role: 'writer', permissionId: 'permission-1' }, { email: 'reader@example.com', role: 'reader' }] })
  assert.equal(libraryRole(library, profile.email), 'owner')
  assert.equal(libraryRole(library, 'writer@example.com'), 'writer')
  assert.equal(libraryRole(library, 'reader@example.com'), 'reader')
  assert.equal(libraryRole(library, 'stranger@example.com'), 'none')
  assert.equal(library.members[0].permissionId, 'permission-1')
})

test('a megosztott recept névtérrel kerül a kereshető ételek közé', () => {
  const library = buildRecipeLibrary(projectWithRecipe(), { id: 'family-1', name: 'Családi', ownerEmail: profile.email })
  const foods = sharedFoodsFromLibraries([{ fileId: 'drive-1', data: library }])
  assert.equal(foods[0].id, 'shared:family-1:recipe-food-1')
  assert.equal(foods[0].source.type, 'shared-recipe')
})

test('a könyvtári recept saját, szerkeszthető másolatot készít új azonosítókkal', () => {
  const library = buildRecipeLibrary(projectWithRecipe(), { id: 'family-1', name: 'Családi', ownerEmail: profile.email })
  const copied = copyLibraryRecipeToProject(library, 'recipe-1', 'recipient-id')
  assert.notEqual(copied.recipe.id, 'recipe-1')
  assert.notEqual(copied.recipe.foodId, 'recipe-food-1')
  assert.equal(copied.recipe.ownerProfileId, 'recipient-id')
  assert.equal(copied.foods.length, 1)
  assert.equal(copied.recipe.ingredients[0].foodId, copied.foods[0].id)
})

test('hiányos könyvtárat elutasít', () => {
  const library = buildRecipeLibrary(projectWithRecipe(), { ownerEmail: profile.email })
  assert.throws(() => normalizeRecipeLibrary({ ...library, publishedFoods: [] }), /hiányos/)
})
