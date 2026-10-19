// One-way, opt-in reads. No Food or Finance writes, no inferred quantities.
import { loadLocalProject } from '../storage/local-project-store.js'
import { getGrapesAccount } from '../storage/grapes-drive.js'
import { normalizeFoodProject } from '../food/food-data.js'
import { quantity, UNITS } from './home-data.js'

export function reviewFoodRecipeAvailability(recipe, homeState) {
  const candidates = (recipe.ingredients || []).map(ingredient => {
    const name = String(ingredient.name || '').trim()
    // A matching display name is NOT a trusted ingredient/product identity.
    const namedLots = (homeState.inventory || []).filter(lot => lot.name.toLocaleLowerCase('hu-HU') === name.toLocaleLowerCase('hu-HU'))
    return { name, amount: ingredient.amount, unit: ingredient.unit,
      evidence: namedLots.length ? 'Név alapján lehetséges egyezés; ellenőrizendő' : 'Alapanyag / mennyiség ellenőrizendő',
      lotIds: namedLots.map(lot => lot.id) }
  })
  return { recipeId: recipe.id, name: recipe.name, status: 'Ellenőrizendő',
    reason: 'A Food alapanyagazonosítói és a Home készlettételei még nincsenek hitelesen összerendelve.',
    ingredients: candidates }
}

export async function readOwnFoodRecipes({ allowed = false } = {}) {
  if (!allowed) throw new Error('A személyes Food-receptek megtekintéséhez külön engedély szükséges.')
  const account = getGrapesAccount() || {}
  const profileId = String(account.id || account.email || 'local-food-profile').trim().toLocaleLowerCase('hu-HU')
  const local = await loadLocalProject(`food-tracker-${profileId}`)
  if (!local?.data) return []
  const project = normalizeFoodProject(local.data, profileId)
  const foods = new Map(project.customFoods.map(food => [food.id, food.name]))
  return project.recipes.filter(recipe => recipe.ownerProfileId === profileId).map(recipe => ({
    id: recipe.id, name: recipe.name, yieldCount: recipe.yieldCount ?? null,
    yieldUnit: recipe.yieldUnit || null,
    ingredients: recipe.ingredients.map(item => ({
      name: foods.get(item.foodId) || 'Ismeretlen hozzávaló',
      amount: item.amount, unit: item.unit, foodId: item.foodId,
      unitCompatibleWithHome: Boolean(UNITS[item.unit]),
    })),
  }))
}

// Current Finance OCR mostly extracts transaction totals. Totals cannot
// identify purchased products. Only independently itemised lines are offered.
export function itemizedReceiptCandidates(financeData) {
  if (!financeData || !Array.isArray(financeData.transactions)) return []
  const results = []
  const seen = new Set()
  for (const transaction of financeData.transactions) {
    if (transaction.type !== 'expense' || transaction.planned || !transaction.receipt) continue
    const receiptId = String(transaction.id || '')
    if (!receiptId || receiptId.includes(':') || receiptId.length > 160) continue
    const lines = transaction.receipt.verifiedLines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      const lineId = String(line.lineId || '')
      const name = String(line.name || '').trim()
      if (!lineId || lineId.includes(':') || lineId.length > 160 || !name || name.length > 160 || !UNITS[line.unit]) continue
      const sourceId = `${receiptId}:${lineId}`
      if (seen.has(sourceId)) continue
      try {
        const q = quantity(line.quantity, line.unit)
        if (!q.quantityBase) continue
      } catch { continue }
      seen.add(sourceId)
      results.push({ sourceType: 'financeReceiptLine', sourceId,
        name, quantity: line.quantity, unit: line.unit, date: transaction.date || null,
        status: 'Tételes vásárlási jelölt – jóváhagyás kell' })
    }
  }
  return results
}

export async function readFinanceReceiptCandidates({ allowed = false } = {}) {
  if (!allowed) throw new Error('A Pénzügy adataihoz külön engedély szükséges.')
  const local = await loadLocalProject('finance-tracker-current')
  return itemizedReceiptCandidates(local?.data)
}
