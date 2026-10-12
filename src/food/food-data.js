export const FOOD_PROJECT_VERSION = 1
export const FOOD_BACKUP_VERSION = 1

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
export const FOOD_BASE_UNITS = ['g', 'ml']
export const FOOD_AMOUNT_UNITS = ['g', 'ml', 'piece', 'slice', 'serving', 'package']
export const CORE_NUTRIENTS = ['energyKcal', 'protein', 'carbohydrate', 'fat', 'fiber', 'sugar', 'saturatedFat', 'salt']
export const RECIPE_YIELD_UNITS = ['serving', 'piece', 'slice']

const DEFAULT_TARGETS = Object.freeze({ energyKcal: 2000, protein: null, carbohydrate: null, fat: null })

const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const finiteOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value)
const rounded = (value, digits = 2) => Number(Number(value).toFixed(digits))

function requiredId(value, label = 'Azonosító') {
  const id = cleanText(value)
  if (!id || id.length > 200) throw new Error(`${label} hiányzik vagy érvénytelen.`)
  return id
}

function isoDateTime(value, label = 'Időpont') {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} érvénytelen.`)
  return date.toISOString()
}

export function createFoodId(prefix = 'food') {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${uuid}`
}

export function normalizeNutrients(value = {}) {
  const result = {}
  for (const key of CORE_NUTRIENTS) {
    const number = finiteOrNull(value[key])
    if (number !== null && (!Number.isFinite(number) || number < 0)) throw new Error(`A(z) ${key} tápérték nem lehet negatív vagy érvénytelen.`)
    result[key] = number === null ? null : rounded(number)
  }
  const extras = {}
  for (const [key, nutrient] of Object.entries(value.extras || {})) {
    const amount = finiteOrNull(nutrient?.amount)
    const unit = cleanText(nutrient?.unit)
    if (!key || amount === null || !Number.isFinite(amount) || amount < 0 || !unit) continue
    extras[key] = { amount: rounded(amount), unit }
  }
  return { ...result, extras }
}

export function calculateMacroEnergy(nutrients = {}) {
  const protein = Number(nutrients.protein)
  const carbohydrate = Number(nutrients.carbohydrate)
  const fat = Number(nutrients.fat)
  if (![protein, carbohydrate, fat].every(Number.isFinite)) return null
  return rounded(protein * 4 + carbohydrate * 4 + fat * 9)
}

export function macroEnergyWarning(targets = {}, tolerance = 0.05) {
  const energy = Number(targets.energyKcal)
  const calculated = calculateMacroEnergy(targets)
  if (!Number.isFinite(energy) || energy <= 0 || calculated === null) return null
  const difference = calculated - energy
  if (Math.abs(difference) / energy <= tolerance) return null
  return { energyKcal: energy, calculatedKcal: calculated, differenceKcal: rounded(difference) }
}

export function normalizeTargets(value = {}) {
  const result = { ...DEFAULT_TARGETS }
  for (const key of Object.keys(result)) {
    const number = finiteOrNull(value[key])
    if (number !== null && (!Number.isFinite(number) || number <= 0)) throw new Error('A célértékeknek nullánál nagyobbnak kell lenniük.')
    result[key] = number === null ? null : rounded(number)
  }
  return result
}

export function normalizeProfile(value = {}) {
  return {
    id: requiredId(value.id, 'Profilazonosító'),
    name: cleanText(value.name) || 'Google-felhasználó',
    email: cleanText(value.email).toLocaleLowerCase('hu-HU'),
    photo: cleanText(value.photo),
  }
}

function normalizeServing(value = {}) {
  const unit = FOOD_AMOUNT_UNITS.includes(value.unit) ? value.unit : 'serving'
  const grams = finiteOrNull(value.grams)
  const milliliters = finiteOrNull(value.milliliters)
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0)) throw new Error('Az adag grammban megadott tömege érvénytelen.')
  if (milliliters !== null && (!Number.isFinite(milliliters) || milliliters <= 0)) throw new Error('Az adag milliliterben megadott mennyisége érvénytelen.')
  return { id: requiredId(value.id || createFoodId('serving'), 'Adagazonosító'), name: cleanText(value.name) || 'Adag', unit, grams, milliliters }
}

export function normalizeFoodItem(value = {}) {
  const baseUnit = FOOD_BASE_UNITS.includes(value.baseUnit) ? value.baseUnit : 'g'
  const name = cleanText(value.name)
  if (!name || name.length > 180) throw new Error('Az étel neve kötelező és legfeljebb 180 karakter lehet.')
  const barcode = cleanText(value.barcode)
  if (barcode && !/^\d{7,14}$/.test(barcode)) throw new Error('A vonalkód 7–14 számjegyből állhat.')
  return {
    id: requiredId(value.id || createFoodId('food'), 'Ételazonosító'),
    kind: ['manual', 'product', 'generic', 'recipe'].includes(value.kind) ? value.kind : 'manual',
    name,
    category: cleanText(value.category) || 'Egyéb',
    barcode,
    baseUnit,
    nutrients: normalizeNutrients(value.nutrients),
    servings: Array.isArray(value.servings) ? value.servings.map(normalizeServing) : [],
    source: {
      type: ['manual', 'openfoodfacts', 'recipe', 'shared-recipe', 'verified'].includes(value.source?.type) ? value.source.type : 'manual',
      id: cleanText(value.source?.id),
      revision: cleanText(value.source?.revision),
      attribution: cleanText(value.source?.attribution),
    },
    verified: value.verified === true,
    imageUrl: /^https:\/\//.test(String(value.imageUrl || '')) ? String(value.imageUrl) : '',
    createdAt: isoDateTime(value.createdAt || new Date().toISOString(), 'Létrehozási idő'),
    updatedAt: isoDateTime(value.updatedAt || value.createdAt || new Date().toISOString(), 'Módosítási idő'),
  }
}

export function resolveAmountInBase(food, amount, unit, servingId = '') {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('A mennyiségnek nullánál nagyobbnak kell lennie.')
  if (unit === food.baseUnit) return numeric
  const serving = food.servings.find(item => item.id === servingId || item.unit === unit)
  if (!serving) throw new Error('Ehhez az egységhez nincs termékspecifikus átváltás.')
  const size = food.baseUnit === 'g' ? serving.grams : serving.milliliters
  if (!Number.isFinite(size) || size <= 0) throw new Error('Az adag átváltása hiányzik.')
  return numeric * size
}

export function nutrientsForAmount(foodValue, amount, unit, servingId = '') {
  const food = normalizeFoodItem(foodValue)
  const baseAmount = resolveAmountInBase(food, amount, unit, servingId)
  const factor = baseAmount / 100
  const nutrients = {}
  for (const key of CORE_NUTRIENTS) nutrients[key] = food.nutrients[key] === null ? null : rounded(food.nutrients[key] * factor)
  nutrients.extras = Object.fromEntries(Object.entries(food.nutrients.extras).map(([key, item]) => [key, { amount: rounded(item.amount * factor), unit: item.unit }]))
  return { baseAmount: rounded(baseAmount), baseUnit: food.baseUnit, nutrients }
}

export function normalizeRecipe(value = {}) {
  const name = cleanText(value.name)
  if (!name || name.length > 180) throw new Error('A recept neve kötelező és legfeljebb 180 karakter lehet.')
  const preparedWeight = finiteOrNull(value.preparedWeight)
  const yieldCount = finiteOrNull(value.yieldCount)
  const averageUnitWeight = finiteOrNull(value.averageUnitWeight)
  for (const [label, number] of [['készétel tömege', preparedWeight], ['hozam', yieldCount], ['átlagos egységtömeg', averageUnitWeight]]) {
    if (number !== null && (!Number.isFinite(number) || number <= 0)) throw new Error(`A(z) ${label} csak nullánál nagyobb lehet.`)
  }
  const ingredients = (value.ingredients || []).map((ingredient) => {
    const amount = Number(ingredient.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Minden recept-hozzávaló mennyiségének nullánál nagyobbnak kell lennie.')
    return { id: requiredId(ingredient.id || createFoodId('ingredient')), foodId: requiredId(ingredient.foodId, 'Hozzávaló ételazonosító'), amount: rounded(amount), unit: FOOD_AMOUNT_UNITS.includes(ingredient.unit) ? ingredient.unit : 'g', servingId: cleanText(ingredient.servingId) }
  })
  if (!ingredients.length) throw new Error('A recepthez legalább egy hozzávaló szükséges.')
  return {
    id: requiredId(value.id || createFoodId('recipe'), 'Receptazonosító'),
    foodId: requiredId(value.foodId || createFoodId('food'), 'Recept ételazonosító'),
    ownerProfileId: requiredId(value.ownerProfileId, 'Tulajdonos profilazonosító'),
    variantOfRecipeId: cleanText(value.variantOfRecipeId),
    name, category: cleanText(value.category) || 'Saját recept', instructions: cleanText(value.instructions),
    imageUrl: /^https:\/\//.test(String(value.imageUrl || '')) ? String(value.imageUrl) : '',
    ingredients, preparedWeight, yieldCount, averageUnitWeight,
    yieldUnit: RECIPE_YIELD_UNITS.includes(value.yieldUnit) ? value.yieldUnit : 'serving',
    revision: Math.max(1, Math.trunc(Number(value.revision) || 1)),
    createdAt: isoDateTime(value.createdAt || new Date().toISOString(), 'Létrehozási idő'),
    updatedAt: isoDateTime(value.updatedAt || value.createdAt || new Date().toISOString(), 'Módosítási idő'),
  }
}

export function calculateRecipeFood(recipeValue, foods = []) {
  const recipe = normalizeRecipe(recipeValue)
  const totals = Object.fromEntries(CORE_NUTRIENTS.map(key => [key, 0]))
  const complete = Object.fromEntries(CORE_NUTRIENTS.map(key => [key, true]))
  let inputWeight = 0
  let weightKnown = true
  for (const ingredient of recipe.ingredients) {
    const food = foods.find(item => item.id === ingredient.foodId)
    if (!food) throw new Error(`Hiányzó recept-hozzávaló: ${ingredient.foodId}`)
    const calculated = nutrientsForAmount(food, ingredient.amount, ingredient.unit, ingredient.servingId)
    if (calculated.baseUnit === 'g') inputWeight += calculated.baseAmount
    else weightKnown = false
    for (const key of CORE_NUTRIENTS) {
      const amount = calculated.nutrients[key]
      if (amount === null) complete[key] = false
      else totals[key] += amount
    }
  }
  const basisWeight = recipe.preparedWeight || (weightKnown ? inputWeight : null)
  if (!basisWeight) throw new Error('Milliliteres hozzávalóknál add meg a készétel lemért tömegét.')
  const nutrients = Object.fromEntries(CORE_NUTRIENTS.map(key => [key, complete[key] ? rounded(totals[key] / basisWeight * 100) : null]))
  const unitWeight = recipe.averageUnitWeight || (recipe.yieldCount ? basisWeight / recipe.yieldCount : null)
  const servings = unitWeight ? [{ id: `${recipe.id}-yield`, name: recipe.yieldUnit === 'slice' ? 'Szelet' : recipe.yieldUnit === 'piece' ? 'Darab' : 'Adag', unit: recipe.yieldUnit, grams: rounded(unitWeight) }] : []
  return {
    recipe,
    totalNutrients: Object.fromEntries(CORE_NUTRIENTS.map(key => [key, complete[key] ? rounded(totals[key]) : null])),
    inputWeight: weightKnown ? rounded(inputWeight) : null,
    preparedWeight: rounded(basisWeight),
    food: normalizeFoodItem({ id: recipe.foodId, kind: 'recipe', name: recipe.name, category: recipe.category, baseUnit: 'g', nutrients, servings, imageUrl: recipe.imageUrl, source: { type: 'recipe', id: recipe.id, revision: String(recipe.revision), attribution: recipe.ownerProfileId }, createdAt: recipe.createdAt, updatedAt: recipe.updatedAt }),
  }
}

export function normalizeDiaryEntry(value = {}, foodValue = null) {
  const mealType = MEAL_TYPES.includes(value.mealType) ? value.mealType : 'snack'
  const amount = Number(value.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A naplózott mennyiségnek nullánál nagyobbnak kell lennie.')
  const unit = FOOD_AMOUNT_UNITS.includes(value.unit) ? value.unit : 'g'
  let snapshot = value.snapshot
  if (foodValue) {
    const food = normalizeFoodItem(foodValue)
    const calculated = nutrientsForAmount(food, amount, unit, value.servingId)
    snapshot = { foodId: food.id, name: food.name, category: food.category, source: food.source, ...calculated }
  }
  if (!snapshot?.name || !snapshot?.nutrients) throw new Error('A naplóbejegyzés tápérték-pillanatképe hiányzik.')
  return {
    id: requiredId(value.id || createFoodId('entry'), 'Naplóazonosító'),
    profileId: requiredId(value.profileId, 'Profilazonosító'),
    mealType,
    occurredAt: isoDateTime(value.occurredAt || new Date().toISOString(), 'Étkezés időpontja'),
    amount: rounded(amount), unit, servingId: cleanText(value.servingId), note: cleanText(value.note),
    snapshot: {
      foodId: cleanText(snapshot.foodId), name: cleanText(snapshot.name), category: cleanText(snapshot.category),
      source: snapshot.source || { type: 'manual' }, baseAmount: Number(snapshot.baseAmount), baseUnit: snapshot.baseUnit,
      nutrients: normalizeNutrients(snapshot.nutrients),
    },
    externalKey: cleanText(value.externalKey),
    createdAt: isoDateTime(value.createdAt || new Date().toISOString(), 'Létrehozási idő'),
    updatedAt: isoDateTime(value.updatedAt || value.createdAt || new Date().toISOString(), 'Módosítási idő'),
  }
}

export function summarizeEntries(entries = []) {
  const result = Object.fromEntries(CORE_NUTRIENTS.map(key => [key, 0]))
  const availability = Object.fromEntries(CORE_NUTRIENTS.map(key => [key, false]))
  for (const entry of entries) {
    for (const key of CORE_NUTRIENTS) {
      const value = entry.snapshot?.nutrients?.[key]
      if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
        result[key] += Number(value)
        availability[key] = true
      }
    }
  }
  for (const key of CORE_NUTRIENTS) result[key] = availability[key] ? rounded(result[key]) : null
  return result
}

export function entriesForLocalDay(entries, date, profileId) {
  return entries.filter(entry => entry.profileId === profileId && localDateKey(entry.occurredAt) === date)
}

export function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function createEmptyFoodProject(profile) {
  const normalizedProfile = normalizeProfile(profile)
  return { version: FOOD_PROJECT_VERSION, profile: normalizedProfile, targets: [{ id: createFoodId('target'), effectiveFrom: new Date().toISOString().slice(0, 10), values: normalizeTargets({}) }], customFoods: [], recipes: [], diaryEntries: [], favorites: [], recentFoods: [], recipeLibraries: [], syncState: {}, settings: {} }
}

export function normalizeFoodProject(value = {}, expectedProfileId = '') {
  if (Number(value.version || FOOD_PROJECT_VERSION) > FOOD_PROJECT_VERSION) throw new Error('A Food-mentés újabb alkalmazásverzióval készült.')
  const profile = normalizeProfile(value.profile || {})
  if (expectedProfileId && profile.id !== expectedProfileId) throw new Error('Ez a Food-napló egy másik Google-fiókhoz tartozik.')
  const customFoods = (value.customFoods || []).map(normalizeFoodItem)
  const recipes = (value.recipes || []).map(normalizeRecipe)
  const diaryEntries = (value.diaryEntries || []).map(entry => normalizeDiaryEntry(entry))
  if (new Set(customFoods.map(item => item.id)).size !== customFoods.length) throw new Error('Ismétlődő ételazonosító a mentésben.')
  if (new Set(recipes.map(item => item.id)).size !== recipes.length) throw new Error('Ismétlődő receptazonosító a mentésben.')
  const ingredientFoodIds = new Set(customFoods.filter(item => item.kind !== 'recipe').map(item => item.id))
  const missingIngredient = recipes.flatMap(item => item.ingredients).find(item => !ingredientFoodIds.has(item.foodId))
  if (missingIngredient) throw new Error(`Hiányzó recept-hozzávaló a mentésben: ${missingIngredient.foodId}`)
  const recipeIds = new Set(recipes.map(item => item.id))
  if (recipes.some(item => item.variantOfRecipeId && (item.variantOfRecipeId === item.id || !recipeIds.has(item.variantOfRecipeId)))) throw new Error('Érvénytelen receptvariáns-kapcsolat a mentésben.')
  if (new Set(diaryEntries.map(item => item.id)).size !== diaryEntries.length) throw new Error('Ismétlődő naplóazonosító a mentésben.')
  const targets = (value.targets || []).map(item => ({ id: requiredId(item.id || createFoodId('target')), effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom) ? item.effectiveFrom : new Date().toISOString().slice(0, 10), values: normalizeTargets(item.values) }))
  return { version: FOOD_PROJECT_VERSION, profile, targets: targets.length ? targets : createEmptyFoodProject(profile).targets, customFoods, recipes, diaryEntries, favorites: [...new Set(value.favorites || [])], recentFoods: [...new Set(value.recentFoods || [])].slice(0, 50), recipeLibraries: Array.isArray(value.recipeLibraries) ? value.recipeLibraries : [], syncState: value.syncState || {}, settings: value.settings || {} }
}

export function currentTargets(project, date = new Date().toISOString().slice(0, 10)) {
  return [...project.targets].filter(item => item.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.values || normalizeTargets({})
}

export function foodBackupToJson(project, exportedAt = new Date().toISOString()) {
  return JSON.stringify({ grapesFoodBackup: true, version: FOOD_BACKUP_VERSION, exportedAt, data: normalizeFoodProject(project) }, null, 2)
}

export function foodBackupFromJson(source, expectedProfileId = '') {
  let payload
  try { payload = JSON.parse(source) } catch { throw new Error('A biztonsági mentés nem érvényes JSON-fájl.') }
  if (payload?.grapesFoodBackup !== true || payload.version !== FOOD_BACKUP_VERSION) throw new Error('Ez nem támogatott Grapes Food biztonsági mentés.')
  return normalizeFoodProject(payload.data, expectedProfileId)
}
