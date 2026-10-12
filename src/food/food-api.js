const DEFAULT_OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export async function lookupOpenFoodFactsProduct(barcode, { signal, baseUrl = import.meta.env?.VITE_FOOD_API_URL || DEFAULT_OPEN_FOOD_FACTS_URL, fetchImpl = globalThis.fetch } = {}) {
  const code = String(barcode || '').trim()
  if (!/^\d{7,14}$/.test(code)) throw new Error('A vonalkód 7–14 számjegyből állhat.')
  if (typeof fetchImpl !== 'function') throw new Error('A termékadatbázis ezen a környezeten nem érhető el.')
  const endpoint = String(baseUrl || DEFAULT_OPEN_FOOD_FACTS_URL).replace(/\/$/, '')
  const response = await fetchImpl(`${endpoint}/api/v2/product/${encodeURIComponent(code)}.json`, { signal })
  if (!response.ok) throw new Error(`A termékadatbázis nem érhető el (${response.status}).`)
  const payload = await response.json()
  if (payload.status !== 1 || !payload.product) throw new Error('Nem található termék ezzel a vonalkóddal.')
  const product = payload.product
  const nutrients = product.nutriments || {}
  const name = product.product_name_hu || product.product_name || product.generic_name_hu || product.generic_name
  if (!name) throw new Error('A termékhez nem tartozik használható név.')
  return {
    kind: 'product', name, barcode: code, category: product.categories_tags?.[0]?.replace(/^..:/, '') || 'Csomagolt élelmiszer',
    baseUnit: product.product_quantity_unit === 'ml' ? 'ml' : 'g', imageUrl: product.image_front_small_url || '',
    nutrients: {
      energyKcal: numberOrNull(nutrients['energy-kcal_100g']), protein: numberOrNull(nutrients.proteins_100g),
      carbohydrate: numberOrNull(nutrients.carbohydrates_100g), fat: numberOrNull(nutrients.fat_100g),
      fiber: numberOrNull(nutrients.fiber_100g), sugar: numberOrNull(nutrients.sugars_100g),
      saturatedFat: numberOrNull(nutrients['saturated-fat_100g']), salt: numberOrNull(nutrients.salt_100g),
    },
    source: { type: 'openfoodfacts', id: code, revision: product.last_modified_t || '', attribution: 'Open Food Facts contributors' },
  }
}
