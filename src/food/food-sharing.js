import { calculateRecipeFood, createFoodId, normalizeDiaryEntry, normalizeFoodItem, normalizeRecipe } from './food-data.js'

export const FOOD_SHARE_VERSION = 1
export const FOOD_SHARE_TYPES = ['meal', 'recipe']

const clean = value => String(value ?? '').trim()
const normalizedEmail = value => clean(value).toLocaleLowerCase('hu-HU')

export function rememberSharingContact(project, email, name = '', usedAt = new Date().toISOString()) {
  const normalized = normalizedEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Érvényes e-mail-cím szükséges.')
  if (normalized === normalizedEmail(project.profile?.email)) throw new Error('Saját magaddal nem oszthatsz meg elemet.')
  const contact = { email: normalized, name: clean(name), lastUsedAt: new Date(usedAt).toISOString() }
  project.sharingContacts = [contact, ...(project.sharingContacts || []).filter(item => normalizedEmail(item.email) !== normalized)].slice(0, 50)
  return contact
}

export function createMealShare(project, { date, mealType }) {
  const entries = project.diaryEntries.filter(entry => entry.profileId === project.profile.id && entry.mealType === mealType && localDate(entry.occurredAt) === date)
  if (!entries.length) throw new Error('Az étkezés még üres, ezért nem osztható meg.')
  return {
    grapesFoodShare: true, version: FOOD_SHARE_VERSION, id: createFoodId('share'), type: 'meal',
    sender: { name: project.profile.name, email: project.profile.email }, createdAt: new Date().toISOString(),
    payload: { date, mealType, entries: entries.map(entry => ({ amount: entry.amount, unit: entry.unit, servingId: entry.servingId, note: entry.note, occurredAt: entry.occurredAt, snapshot: structuredClone(entry.snapshot) })) },
  }
}

export function createRecipeShare(project, recipeId) {
  const recipe = project.recipes.find(item => item.id === recipeId)
  if (!recipe) throw new Error('A recept nem található.')
  const ingredientIds = new Set(recipe.ingredients.map(item => item.foodId))
  const foods = project.customFoods.filter(item => item.kind !== 'recipe' && ingredientIds.has(item.id))
  if (foods.length !== ingredientIds.size) throw new Error('A recept egyik hozzávalója hiányzik.')
  return {
    grapesFoodShare: true, version: FOOD_SHARE_VERSION, id: createFoodId('share'), type: 'recipe',
    sender: { name: project.profile.name, email: project.profile.email }, createdAt: new Date().toISOString(),
    payload: { recipe: structuredClone(recipe), foods: structuredClone(foods) },
  }
}

export function normalizeFoodShare(value = {}) {
  if (value.grapesFoodShare !== true || Number(value.version) !== FOOD_SHARE_VERSION || !FOOD_SHARE_TYPES.includes(value.type)) throw new Error('Nem támogatott Grapes-megosztás.')
  if (!clean(value.id)) throw new Error('A megosztási azonosító hiányzik.')
  return value
}

export function acceptMealShare(project, shareValue, { date, replace = false } = {}) {
  const share = normalizeFoodShare(shareValue)
  if (share.type !== 'meal') throw new Error('Ez nem étkezésmegosztás.')
  if ((project.processedShareIds || []).includes(share.id)) return { imported: 0, duplicate: true }
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : share.payload.date
  const mealType = share.payload.mealType
  if (replace) project.diaryEntries = project.diaryEntries.filter(entry => !(entry.profileId === project.profile.id && entry.mealType === mealType && localDate(entry.occurredAt) === targetDate))
  const entries = share.payload.entries.map((entry, index) => normalizeDiaryEntry({
    ...entry, id: createFoodId('entry'), profileId: project.profile.id,
    occurredAt: withDate(entry.occurredAt, targetDate), externalKey: `share:${share.id}:${index}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }))
  project.diaryEntries.push(...entries)
  project.processedShareIds = [...(project.processedShareIds || []), share.id].slice(-500)
  return { imported: entries.length, duplicate: false }
}

export function acceptRecipeShare(project, shareValue) {
  const share = normalizeFoodShare(shareValue)
  if (share.type !== 'recipe') throw new Error('Ez nem receptmegosztás.')
  if ((project.processedShareIds || []).includes(share.id)) return { recipe: null, duplicate: true }
  const foodIds = new Map()
  const foods = share.payload.foods.map(value => {
    const id = createFoodId('food'); foodIds.set(value.id, id)
    return normalizeFoodItem({ ...value, id, source: { type: 'manual', attribution: `Megosztotta: ${share.sender?.email || ''}` }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  })
  const source = share.payload.recipe
  const recipe = normalizeRecipe({
    ...source, id: createFoodId('recipe'), foodId: createFoodId('food'), ownerProfileId: project.profile.id,
    variantOfRecipeId: '', ingredients: source.ingredients.map(item => ({ ...item, id: createFoodId('ingredient'), foodId: foodIds.get(item.foodId) })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 1,
  })
  const generated = calculateRecipeFood(recipe, foods).food
  project.customFoods.push(...foods, generated)
  project.recipes.push(recipe)
  project.processedShareIds = [...(project.processedShareIds || []), share.id].slice(-500)
  return { recipe, duplicate: false }
}

function localDate(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function withDate(value, date) {
  const source = new Date(value)
  return new Date(`${date}T${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}:00`).toISOString()
}
