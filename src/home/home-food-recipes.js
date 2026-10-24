import { normalizeFoodProject } from '../food/food-data.js'
import { loadLocalProject } from '../storage/local-project-store.js'
import { UNITS } from './home-data.js'

const normalizedName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU')

// Only the active profile's already saved Food project is read. No Drive request,
// Food save, recipe copy, or Home command is part of this bridge.
export async function readLocalFoodRecipes(profileId, loadProject = loadLocalProject) {
  const id = normalizedName(profileId)
  if (!id) throw new Error('A Food-profil nem azonosítható.')
  const saved = await loadProject(`food-tracker-${id}`)
  if (!saved?.data) return { status: 'empty', recipes: [], savedAt: null }
  const project = normalizeFoodProject(saved.data, id)
  const foods = new Map(project.customFoods.filter(food => food.kind !== 'recipe').map(food => [food.id, food]))
  const recipes = project.recipes.filter(recipe => recipe.ownerProfileId === id).map(recipe => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    yieldCount: recipe.yieldCount,
    yieldUnit: recipe.yieldUnit,
    ingredients: recipe.ingredients.map(ingredient => ({
      name: foods.get(ingredient.foodId)?.name || null,
      amount: ingredient.amount,
      unit: ingredient.unit,
      dimension: UNITS[ingredient.unit]?.[0] || null,
    })),
  }))
  return { status: 'ready', recipes, savedAt: saved.updatedAt || null }
}

// Read only already persisted personal diary entries. Linking one to a Home
// prepared lot is a separate, explicitly confirmed Home event.
export async function readLocalFoodDiary(profileId, loadProject = loadLocalProject) {
  const id = normalizedName(profileId)
  if (!id) throw new Error('A Food-profil nem azonosítható.')
  const saved = await loadProject(`food-tracker-${id}`)
  if (!saved?.data) return []
  const project = normalizeFoodProject(saved.data, id)
  const ownRecipes = new Set(project.recipes.filter(recipe => recipe.ownerProfileId === id).map(recipe => recipe.id))
  return project.diaryEntries.filter(entry => entry.profileId === id && entry.snapshot?.source?.type === 'recipe' && ownRecipes.has(entry.snapshot.source.id) && ['serving', 'slice', 'piece'].includes(entry.unit) && Number.isSafeInteger(entry.amount) && entry.amount > 0)
    .map(entry => ({ id: entry.id, profileId: id, recipeRef: entry.snapshot.source.id, recipeName: entry.snapshot.name, portions: entry.amount, unit: entry.unit, occurredAt: entry.occurredAt }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

// A name match is merely a candidate. M1 lots do not carry a verified Food
// ingredient mapping, so this function must never assert that a recipe is ready.
export function reviewRecipeAgainstInventory(recipe, inventory) {
  const ingredients = recipe.ingredients.map(ingredient => {
    const candidateNames = ingredient.name && ingredient.dimension
      ? inventory.filter(lot => lot.evidenceStatus === 'confirmed' && lot.dimension === ingredient.dimension && normalizedName(lot.name) === normalizedName(ingredient.name)).map(lot => lot.name)
      : []
    return { ...ingredient, possibleNameMatch: candidateNames.length > 0 }
  })
  return { status: 'review', ingredients }
}
