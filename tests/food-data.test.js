import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createEmptyFoodProject,
  calculateRecipeFood,
  currentTargets,
  entriesForLocalDay,
  foodBackupFromJson,
  foodBackupToJson,
  macroEnergyWarning,
  normalizeDiaryEntry,
  normalizeFoodItem,
  normalizeFoodProject,
  nutrientsForAmount,
  summarizeEntries,
} from '../src/food/food-data.js'

const profile = { id: 'google-user-1', name: 'Teszt Elek', email: 'teszt@example.com' }

test('a FatSecret-forrás megmarad a mobilos étel mentésekor', () => {
  const food = normalizeFoodItem({ name: 'Online étel', source: { type: 'fatsecret', id: 'fs-123', attribution: 'FatSecret Platform' } })
  assert.equal(food.source.type, 'fatsecret')
  assert.equal(food.source.id, 'fs-123')
})

const chicken = normalizeFoodItem({
  id: 'food-chicken',
  name: 'Csirkemell',
  category: 'Hús',
  baseUnit: 'g',
  nutrients: { energyKcal: 120, protein: 23, carbohydrate: 0, fat: 2, fiber: null },
  servings: [{ id: 'serving-slice', name: 'Szelet', unit: 'slice', grams: 80 }],
  createdAt: '2026-10-12T10:00:00.000Z',
})

test('tápértéket 100 g-ról mennyiségre skáláz és megőrzi az ismeretlen adatot', () => {
  const result = nutrientsForAmount(chicken, 150, 'g')
  assert.equal(result.baseAmount, 150)
  assert.equal(result.nutrients.energyKcal, 180)
  assert.equal(result.nutrients.protein, 34.5)
  assert.equal(result.nutrients.fiber, null)
})

test('termékspecifikus adagból alapegységre vált', () => {
  const result = nutrientsForAmount(chicken, 2, 'slice', 'serving-slice')
  assert.equal(result.baseAmount, 160)
  assert.equal(result.nutrients.energyKcal, 192)
})

test('a naplóbejegyzés változatlan tápérték-pillanatképet készít', () => {
  const editableChicken = normalizeFoodItem(chicken)
  const entry = normalizeDiaryEntry({
    id: 'entry-1', profileId: profile.id, mealType: 'lunch', amount: 100, unit: 'g',
    occurredAt: '2026-10-12T12:00:00.000Z', createdAt: '2026-10-12T12:00:00.000Z',
  }, editableChicken)
  editableChicken.nutrients.energyKcal = 999
  assert.equal(entry.snapshot.nutrients.energyKcal, 120)
  assert.equal(entry.snapshot.name, 'Csirkemell')
})

test('napi összesítésnél az ismeretlen tápérték null marad', () => {
  const entry = normalizeDiaryEntry({
    id: 'entry-2', profileId: profile.id, mealType: 'lunch', amount: 100, unit: 'g',
    occurredAt: '2026-10-12T12:00:00.000Z', createdAt: '2026-10-12T12:00:00.000Z',
  }, chicken)
  const totals = summarizeEntries([entry])
  assert.equal(totals.energyKcal, 120)
  assert.equal(totals.fiber, null)
})

test('dátum és profil szerint szűri a naplót', () => {
  const entries = [
    { profileId: profile.id, occurredAt: '2026-10-12T08:00:00.000Z' },
    { profileId: profile.id, occurredAt: '2026-10-13T08:00:00.000Z' },
    { profileId: 'other', occurredAt: '2026-10-12T08:00:00.000Z' },
  ]
  assert.equal(entriesForLocalDay(entries, '2026-10-12', profile.id).length, 1)
  const localMidnight = new Date(2026, 9, 13, 0, 15).toISOString()
  assert.equal(entriesForLocalDay([{ profileId: profile.id, occurredAt: localMidnight }], '2026-10-13', profile.id).length, 1)
})

test('figyelmeztet az egymással nem egyező energia- és makrócélokra', () => {
  assert.equal(macroEnergyWarning({ energyKcal: 2000, protein: 100, carbohydrate: 250, fat: 67 }), null)
  assert.equal(macroEnergyWarning({ energyKcal: 2000, protein: 50, carbohydrate: 50, fat: 20 }).calculatedKcal, 580)
})

test('az időben érvényes legutóbbi célt választja', () => {
  const project = createEmptyFoodProject(profile)
  project.targets = [
    { id: 't1', effectiveFrom: '2026-01-01', values: { energyKcal: 2000 } },
    { id: 't2', effectiveFrom: '2026-10-01', values: { energyKcal: 1800 } },
  ]
  assert.equal(currentTargets(normalizeFoodProject(project), '2026-10-12').energyKcal, 1800)
})

test('biztonsági mentést körbeír és másik profil importját elutasítja', () => {
  const project = createEmptyFoodProject(profile)
  const backup = foodBackupToJson(project, '2026-10-12T12:00:00.000Z')
  assert.equal(foodBackupFromJson(backup, profile.id).profile.email, profile.email)
  assert.throws(() => foodBackupFromJson(backup, 'other-user'), /másik Google-fiókhoz/)
})

test('a recept vízvesztesége az összenergiát nem, csak a 100 g-os értéket módosítja', () => {
  const base = {
    id: 'recipe-1', foodId: 'food-recipe-1', ownerProfileId: profile.id, name: 'Sült csirkemell',
    ingredients: [{ id: 'ingredient-1', foodId: chicken.id, amount: 500, unit: 'g' }],
    preparedWeight: 400, yieldCount: 4, yieldUnit: 'serving', createdAt: '2026-10-12T10:00:00.000Z',
  }
  const cooked = calculateRecipeFood(base, [chicken])
  const rawWeight = calculateRecipeFood({ ...base, preparedWeight: 500 }, [chicken])
  assert.equal(cooked.totalNutrients.energyKcal, 600)
  assert.equal(rawWeight.totalNutrients.energyKcal, 600)
  assert.equal(cooked.food.nutrients.energyKcal, 150)
  assert.equal(rawWeight.food.nutrients.energyKcal, 120)
  assert.equal(cooked.food.servings[0].grams, 100)
})

test('a recept nem talál ki hiányzó tápértéket', () => {
  const recipe = calculateRecipeFood({
    id: 'recipe-2', foodId: 'food-recipe-2', ownerProfileId: profile.id, name: 'Csirkés étel',
    ingredients: [{ id: 'ingredient-2', foodId: chicken.id, amount: 100, unit: 'g' }],
    yieldCount: 2, yieldUnit: 'piece', createdAt: '2026-10-12T10:00:00.000Z',
  }, [chicken])
  assert.equal(recipe.food.nutrients.fiber, null)
  assert.equal(recipe.food.servings[0].unit, 'piece')
})

test('milliliteres receptnél kötelező a készétel lemért tömege', () => {
  const milk = normalizeFoodItem({ id: 'milk', name: 'Tej', baseUnit: 'ml', nutrients: { energyKcal: 50 }, createdAt: '2026-10-12T10:00:00.000Z' })
  assert.throws(() => calculateRecipeFood({
    id: 'recipe-3', foodId: 'food-recipe-3', ownerProfileId: profile.id, name: 'Tejes ital',
    ingredients: [{ id: 'ingredient-3', foodId: milk.id, amount: 200, unit: 'ml' }], createdAt: '2026-10-12T10:00:00.000Z',
  }, [milk]), /lemért tömegét/)
})

test('a recept szerkesztése nem írja át a korábbi napló tápértékét', () => {
  const base = { id: 'recipe-4', foodId: 'food-recipe-4', ownerProfileId: profile.id, name: 'Csirkés recept', ingredients: [{ id: 'ingredient-4', foodId: chicken.id, amount: 100, unit: 'g' }], yieldCount: 1, createdAt: '2026-10-12T10:00:00.000Z' }
  const firstFood = calculateRecipeFood(base, [chicken]).food
  const entry = normalizeDiaryEntry({ id: 'entry-recipe', profileId: profile.id, amount: 100, unit: 'g', occurredAt: '2026-10-12T12:00:00.000Z', createdAt: '2026-10-12T12:00:00.000Z' }, firstFood)
  const changedFood = calculateRecipeFood({ ...base, revision: 2, ingredients: [{ id: 'ingredient-4', foodId: chicken.id, amount: 200, unit: 'g' }], preparedWeight: 100 }, [chicken]).food
  assert.equal(entry.snapshot.nutrients.energyKcal, 120)
  assert.equal(changedFood.nutrients.energyKcal, 240)
})

test('a receptvariáns külön recept és külön naplózható étel marad', () => {
  const project = createEmptyFoodProject(profile)
  project.customFoods.push(chicken)
  project.recipes = [
    { id: 'recipe-base', foodId: 'food-base', ownerProfileId: profile.id, name: 'Alap recept', ingredients: [{ id: 'i-base', foodId: chicken.id, amount: 100, unit: 'g' }], createdAt: '2026-10-12T10:00:00.000Z' },
    { id: 'recipe-variant', foodId: 'food-variant', ownerProfileId: profile.id, variantOfRecipeId: 'recipe-base', name: 'Csípős variáns', ingredients: [{ id: 'i-variant', foodId: chicken.id, amount: 150, unit: 'g' }], createdAt: '2026-10-12T10:00:00.000Z' },
  ]
  const normalized = normalizeFoodProject(project)
  assert.equal(normalized.recipes[1].variantOfRecipeId, 'recipe-base')
  assert.notEqual(normalized.recipes[0].foodId, normalized.recipes[1].foodId)
  assert.throws(() => normalizeFoodProject({ ...project, recipes: [{ ...project.recipes[1], variantOfRecipeId: 'missing' }] }), /variáns-kapcsolat/)
})

test('a projekt betöltése elutasítja a hiányzó alapanyagra hivatkozó receptet', () => {
  const project = createEmptyFoodProject(profile)
  project.recipes = [{
    id: 'recipe-broken', foodId: 'food-broken', ownerProfileId: profile.id, name: 'Hibás recept',
    ingredients: [{ id: 'ingredient-missing', foodId: 'food-missing', amount: 100, unit: 'g' }],
    createdAt: '2026-10-12T10:00:00.000Z',
  }]
  assert.throws(() => normalizeFoodProject(project), /Hiányzó recept-hozzávaló.*food-missing/)
})


test('a recept szeletsúlya a kész tömegből és a hozamból számolódik', () => {
  const result = calculateRecipeFood({
    id: 'recipe-bread-weight', foodId: 'food-bread-weight', ownerProfileId: profile.id,
    name: 'Kenyér', ingredients: [{ id: 'ingredient-bread-weight', foodId: chicken.id, amount: 100, unit: 'g' }],
    preparedWeight: 1450, yieldCount: 25, yieldUnit: 'slice', averageUnitWeight: 25,
  }, [chicken])
  assert.equal(result.recipe.averageUnitWeight, 58)
  assert.equal(result.food.servings[0].grams, 58)
})
