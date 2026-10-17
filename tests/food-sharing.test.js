import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyFoodProject, normalizeDiaryEntry, normalizeFoodItem, normalizeFoodProject } from '../src/food/food-data.js'
import { acceptMealShare, acceptRecipeShare, createMealShare, createRecipeShare, rememberSharingContact } from '../src/food/food-sharing.js'

const profile = { id: 'owner', name: 'Anna', email: 'anna@example.com' }
const recipient = { id: 'recipient', name: 'Béla', email: 'bela@example.com' }

function oatmeal() {
  return normalizeFoodItem({ id: 'food-oat', name: 'Zabkása', baseUnit: 'g', nutrients: { energyKcal: 120, protein: 4, carbohydrate: 20, fat: 2 }, createdAt: '2026-10-14T06:00:00Z' })
}

test('a régi kisétkezést időpont szerint migrálja az öt étkezéses modellbe', () => {
  const food = oatmeal()
  const morning = normalizeDiaryEntry({ profileId: profile.id, mealType: 'snack', amount: 100, unit: 'g', occurredAt: '2026-10-14T10:00:00+02:00' }, food)
  const afternoon = normalizeDiaryEntry({ profileId: profile.id, mealType: 'snack', amount: 100, unit: 'g', occurredAt: '2026-10-14T16:00:00+02:00' }, food)
  assert.equal(morning.mealType, 'morningSnack')
  assert.equal(afternoon.mealType, 'afternoonSnack')
})

test('étkezésmegosztás elfogadáskor hozzáfűz vagy cserél és idempotens', () => {
  const sender = createEmptyFoodProject(profile); const food = oatmeal(); sender.customFoods.push(food)
  sender.diaryEntries.push(normalizeDiaryEntry({ profileId: profile.id, mealType: 'breakfast', amount: 150, unit: 'g', occurredAt: '2026-10-14T08:10:00+02:00' }, food))
  const share = createMealShare(sender, { date: '2026-10-14', mealType: 'breakfast' })
  const target = createEmptyFoodProject(recipient)
  assert.equal(acceptMealShare(target, share, { date: '2026-10-15' }).imported, 1)
  assert.equal(target.diaryEntries[0].profileId, recipient.id)
  assert.match(target.diaryEntries[0].externalKey, new RegExp(share.id))
  assert.equal(acceptMealShare(target, share).duplicate, true)
})

test('hibás megosztás cserénél sem törli a meglévő étkezést', () => {
  const target = createEmptyFoodProject(recipient); const food = oatmeal()
  target.diaryEntries.push(normalizeDiaryEntry({ id: 'existing-breakfast', profileId: recipient.id, mealType: 'breakfast', amount: 100, unit: 'g', occurredAt: '2026-10-15T08:00:00+02:00' }, food))
  const invalidShare = {
    grapesFoodShare: true, version: 1, id: 'share-invalid-meal', type: 'meal',
    payload: { date: '2026-10-15', mealType: 'breakfast', entries: [{ amount: 0, unit: 'g', occurredAt: '2026-10-15T09:00:00+02:00', snapshot: { name: 'Hibás étel', nutrients: {} } }] },
  }
  assert.throws(() => acceptMealShare(target, invalidShare, { date: '2026-10-15', replace: true }), /nullánál nagyobbnak/)
  assert.equal(target.diaryEntries.length, 1)
  assert.equal(target.diaryEntries[0].id, 'existing-breakfast')
})

test('receptmegosztás saját szerkeszthető másolatot készít új azonosítókkal', () => {
  const sender = createEmptyFoodProject(profile); const food = oatmeal(); sender.customFoods.push(food)
  const recipe = { id: 'recipe-1', foodId: 'food-recipe-1', ownerProfileId: profile.id, name: 'Zabkehely', category: 'Reggeli', ingredients: [{ id: 'ingredient-1', foodId: food.id, amount: 100, unit: 'g' }], preparedWeight: 100, yieldCount: 1, yieldUnit: 'serving', createdAt: '2026-10-14T06:00:00Z' }
  sender.recipes.push(recipe)
  const share = createRecipeShare(sender, recipe.id)
  const target = createEmptyFoodProject(recipient)
  const result = acceptRecipeShare(target, share)
  assert.notEqual(result.recipe.id, recipe.id)
  assert.equal(result.recipe.ownerProfileId, recipient.id)
  assert.equal(target.recipes.length, 1)
  assert.equal(target.customFoods.length, 2)
})

test('a megjegyzett címzett normalizált és a projektben megmarad', () => {
  const project = createEmptyFoodProject(profile)
  rememberSharingContact(project, '  BELA@example.com ', 'Béla', '2026-10-14T12:00:00Z')
  rememberSharingContact(project, 'bela@example.com', 'Béla K.', '2026-10-14T13:00:00Z')
  const normalized = normalizeFoodProject(project, profile.id)
  assert.deepEqual(normalized.sharingContacts, [{ email: 'bela@example.com', name: 'Béla K.', lastUsedAt: '2026-10-14T13:00:00.000Z' }])
})
