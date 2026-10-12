import { calculateRecipeFood, createFoodId, normalizeFoodItem, normalizeRecipe } from './food-data.js'

export const FOOD_LIBRARY_VERSION = 1
export const FOOD_LIBRARY_MODULE = 'Családi receptkönyvtár'

const clean = value => String(value ?? '').trim()
const email = value => clean(value).toLocaleLowerCase('hu-HU')

export function buildRecipeLibrary(project, { id = createFoodId('library'), name = 'Családi receptkönyvtár', ownerEmail, members = [], createdAt = new Date().toISOString() } = {}) {
  const baseFoods = project.customFoods.filter(food => food.kind !== 'recipe').map(normalizeFoodItem)
  const recipes = project.recipes.map(normalizeRecipe)
  const generated = []
  for (const recipe of recipes) generated.push(calculateRecipeFood(recipe, [...baseFoods, ...generated]).food)
  return normalizeRecipeLibrary({ version: FOOD_LIBRARY_VERSION, id, name, ownerEmail, members, baseFoods, recipes, publishedFoods: generated, createdAt, updatedAt: new Date().toISOString() })
}

export function normalizeRecipeLibrary(value = {}) {
  if (Number(value.version) !== FOOD_LIBRARY_VERSION) throw new Error('Nem támogatott családi receptkönyvtár-verzió.')
  const id = clean(value.id)
  const name = clean(value.name)
  const ownerEmail = email(value.ownerEmail)
  if (!id || !name || !ownerEmail) throw new Error('A receptkönyvtár azonosítója, neve és tulajdonosa kötelező.')
  const members = []
  for (const member of value.members || []) {
    const memberEmail = email(member.email)
    if (!memberEmail || memberEmail === ownerEmail) continue
    const role = member.role === 'writer' ? 'writer' : 'reader'
    const existing = members.find(item => item.email === memberEmail)
    const permissionId = clean(member.permissionId)
    if (existing) { existing.role = role; if (permissionId) existing.permissionId = permissionId }
    else members.push({ email: memberEmail, role, ...(permissionId ? { permissionId } : {}) })
  }
  const baseFoods = (value.baseFoods || []).map(normalizeFoodItem).filter(food => food.kind !== 'recipe')
  const recipes = (value.recipes || []).map(normalizeRecipe)
  const publishedFoods = (value.publishedFoods || []).map(normalizeFoodItem).filter(food => food.kind === 'recipe')
  if (publishedFoods.length !== recipes.length) throw new Error('A receptkönyvtár publikált receptjei hiányosak.')
  return { version: FOOD_LIBRARY_VERSION, id, name, ownerEmail, members, baseFoods, recipes, publishedFoods, createdAt: new Date(value.createdAt || Date.now()).toISOString(), updatedAt: new Date(value.updatedAt || Date.now()).toISOString() }
}

export function libraryRole(libraryValue, accountEmail) {
  const library = normalizeRecipeLibrary(libraryValue)
  const normalizedEmail = email(accountEmail)
  if (normalizedEmail === library.ownerEmail) return 'owner'
  return library.members.find(member => member.email === normalizedEmail)?.role || 'none'
}

export function sharedFoodsFromLibraries(libraryLinks = []) {
  const foods = []
  for (const link of libraryLinks) {
    let library
    try { library = normalizeRecipeLibrary(link.data || link) } catch { continue }
    for (const food of library.publishedFoods) {
      foods.push(normalizeFoodItem({
        ...food,
        id: `shared:${library.id}:${food.id}`,
        name: `${food.name} · ${library.name}`,
        source: { type: 'shared-recipe', id: food.source.id, revision: food.source.revision, attribution: library.ownerEmail },
      }))
    }
  }
  return foods
}

export function copyLibraryRecipeToProject(libraryValue, recipeId, ownerProfileId) {
  const library = normalizeRecipeLibrary(libraryValue)
  const recipe = library.recipes.find(item => item.id === recipeId)
  if (!recipe) throw new Error('A kiválasztott megosztott recept nem található.')
  const idMap = new Map(library.baseFoods.map(food => [food.id, createFoodId('food')]))
  const foods = library.baseFoods.map(food => normalizeFoodItem({ ...food, id: idMap.get(food.id), source: { ...food.source, attribution: `${food.source.attribution || ''} · ${library.name}`.trim() } }))
  const copied = normalizeRecipe({
    ...recipe, id: createFoodId('recipe'), foodId: createFoodId('food'), ownerProfileId, variantOfRecipeId: '',
    name: `${recipe.name} – ${library.name}`, ingredients: recipe.ingredients.map(item => ({ ...item, id: createFoodId('ingredient'), foodId: idMap.get(item.foodId) || item.foodId })), revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
  return { foods, recipe: copied }
}
