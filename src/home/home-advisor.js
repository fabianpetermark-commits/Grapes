import { UNITS } from './home-data.js'

const dateText = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null
const key = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU')
const todayLocal = () => {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

/**
 * Read-only, evidence-labelled Home M3/A hints. These are not safety decisions
 * and must never be fed into StockReceived, CookingConfirmed or Food writes.
 */
export function homeDateHints(inventory = [], today = todayLocal()) {
  if (!dateText(today)) throw new Error('Érvénytelen vizsgálati dátum.')
  return inventory.filter(lot => lot.quantityBase > 0 && dateText(lot.expiryDate) &&
    ['bestBefore', 'useBy'].includes(lot.expiryKind) && lot.expiryDate <= today)
    .map(lot => ({
      id: lot.id, name: lot.name, date: lot.expiryDate, kind: lot.expiryKind,
      observedAt: lot.observedAt,
      message: lot.expiryKind === 'useBy'
        ? 'A címkén szereplő fogyaszthatósági dátum elérkezett vagy elmúlt. Ne tekintsd automatikusan biztonságosan fogyaszthatónak.'
        : 'A címkén szereplő minőségmegőrzési dátum elérkezett vagy elmúlt. Ellenőrizd a terméket és a tárolási előírásokat.',
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'hu'))
}

/**
 * Recipe ranking uses evidence from the verified Food project, but an exact
 * name match is NEVER verified ingredient identity or proof of enough stock.
 * No guessed conversions, inferred missing stock, scores or unknown timings.
 */
export function homeRecipeHints(inventory = [], foodProject = {}) {
  const knownFoods = new Map((foodProject.customFoods || []).map(food => [food.id, food]))
  const lots = (inventory || []).filter(lot => lot.quantityBase > 0)
  return (foodProject.recipes || []).map(recipe => {
    const matched = []
    const unresolved = []
    for (const item of recipe.ingredients || []) {
      const food = knownFoods.get(item.foodId)
      const name = food?.name || 'Ismeretlen hozzávaló'
      const candidate = lots.find(lot => key(lot.name) === key(name) &&
        UNITS[item.unit] && UNITS[lot.displayUnit] &&
        UNITS[item.unit][0] === UNITS[lot.displayUnit][0])
      if (candidate) matched.push({ name, lotId: candidate.id, observedAt: candidate.observedAt })
      else unresolved.push(name)
    }
    return {
      id: recipe.id, name: recipe.name, imageUrl: recipe.imageUrl || '',
      yieldCount: recipe.yieldCount ?? null, yieldUnit: recipe.yieldUnit || 'serving',
      status: 'review', matched, unresolved,
      reason: matched.length
        ? `Lehetséges névegyezés: ${matched.map(item => item.name).join(', ')}. Az alapanyag azonossága, a tényleges mennyiség és a frissesség ellenőrizendő.`
        : 'Nincs igazolt megfeleltetés a saját készlethez. A hozzávalók ellenőrizendők.',
    }
  }).sort((a, b) => b.matched.length - a.matched.length ||
    a.unresolved.length - b.unresolved.length || a.name.localeCompare(b.name, 'hu'))
}
