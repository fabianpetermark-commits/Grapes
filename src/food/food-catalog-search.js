import {
  lookupOpenFoodFactsProduct, searchOpenFoodFactsProducts,
} from './food-api.js'
import { searchVerifiedUsdaFoods } from './usda-foods.js'

// Network searches never mutate Food projects. Selection and saving happen separately in the UI.
const normalizeQuery = value => String(value ?? '').trim().replace(/\s+/g, ' ')
const barcodePattern = /^\d{7,14}$/

function catalogIdentity(product) {
  if (barcodePattern.test(String(product.barcode || ''))) return 'barcode:' + product.barcode
  return product.source?.type + ':' + product.source?.id
}

export function mergeFoodCatalogResults(groups = []) {
  const seen = new Set()
  const results = []
  for (const group of groups) {
    for (const product of group.products || []) {
      if (!product || !product.name || !product.source?.id) continue
      const identity = catalogIdentity(product)
      if (seen.has(identity)) continue
      seen.add(identity)
      results.push(product)
    }
  }
  return results
}

export async function searchFoodCatalog(query, {
  offSearch = searchOpenFoodFactsProducts,
  offBarcode = lookupOpenFoodFactsProduct,
} = {}) {
  const term = normalizeQuery(query)
  if (term.length < 2 || term.length > 120)
    throw new Error('Legalább 2, legfeljebb 120 karakterrel keress.')
  const isBarcode = barcodePattern.test(term)
  const sources = [
    ...(!isBarcode ? [{ id: 'usda', label: 'USDA · ellenőrzött offline', search: async () => { const products = searchVerifiedUsdaFoods(term); return { count: products.length, products } } }] : []),
    { id: 'openfoodfacts', label: 'Open Food Facts',
      search: () => isBarcode
        ? offBarcode(term).then(product => ({ count: 1, products: [product] }))
        : offSearch(term) }
  ]
  const settled = await Promise.allSettled(sources.map(source => source.search()))
  const providers = sources.map((source, index) => {
    const result = settled[index]
    return result.status === 'fulfilled'
      ? { id: source.id, label: source.label, status: 'ok', count: Number(result.value?.count) || 0,
          products: Array.isArray(result.value?.products) ? result.value.products : [] }
      : { id: source.id, label: source.label, status: 'error',
          message: result.reason?.message || 'A szolgáltatás nem elérhető.', count: 0, products: [] }
  })
  const successful = providers.filter(source => source.status === 'ok')
  const products = mergeFoodCatalogResults(successful)
  const errors = providers.filter(source => source.status === 'error')
    .map(source => source.label + ': ' + source.message)
  return {
    term, products, providers, errors, partial: !!successful.length && !!errors.length,
    unavailable: !successful.length, count: successful.reduce((sum, source) => sum + source.count, 0),
  }
}
