import { isGrapesAndroidApp, requestAndroidFoodApi } from '../android-bridge.js'

const DEFAULT_OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'
const DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL = 'https://search.openfoodfacts.org'
const OFF_REGION_STORAGE_KEY = 'grapes.food.openFoodFacts.region'
const OFF_REGIONS = new Set(['hu', 'sk', 'at', 'de', 'cz', 'pl', 'ro', 'gb', 'us', 'all'])
function selectedOffRegion() {
  try {
    const value = globalThis.localStorage?.getItem(OFF_REGION_STORAGE_KEY) || 'hu'
    return OFF_REGIONS.has(value) ? value : 'hu'
  } catch { return 'hu' }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function productFromOpenFoodFacts(product, fallbackBarcode = '') {
  const nutrients = product.nutriments || {}
  const name = product.product_name_hu || product.product_name || product.generic_name_hu || product.generic_name
  if (!name) throw new Error('A termékhez nem tartozik használható név.')
  const barcode = String(product.code || fallbackBarcode || '').trim()
  if (!/^\d{7,14}$/.test(barcode)) throw new Error('A termékhez nem tartozik használható vonalkód.')
  const categoryTag = product.categories_tags?.at?.(-1) || product.categories_tags?.[0] || ''
  return {
    kind: 'product', name, barcode, category: categoryTag.replace(/^..:/, '').replaceAll('-', ' ') || 'Csomagolt élelmiszer',
    baseUnit: product.product_quantity_unit === 'ml' ? 'ml' : 'g', imageUrl: product.image_front_small_url || '',
    nutrients: {
      energyKcal: numberOrNull(nutrients['energy-kcal_100g']), protein: numberOrNull(nutrients.proteins_100g),
      carbohydrate: numberOrNull(nutrients.carbohydrates_100g), fat: numberOrNull(nutrients.fat_100g),
      fiber: numberOrNull(nutrients.fiber_100g), sugar: numberOrNull(nutrients.sugars_100g),
      saturatedFat: numberOrNull(nutrients['saturated-fat_100g']), salt: numberOrNull(nutrients.salt_100g),
    },
    source: { type: 'openfoodfacts', id: barcode, revision: product.last_modified_t || '', attribution: 'Open Food Facts contributors' },
  }
}

export async function lookupOpenFoodFactsProduct(barcode, { signal, baseUrl = import.meta.env?.VITE_FOOD_API_URL || DEFAULT_OPEN_FOOD_FACTS_URL, fetchImpl = globalThis.fetch } = {}) {
  const code = String(barcode || '').trim()
  if (!/^\d{7,14}$/.test(code)) throw new Error('A vonalkód 7–14 számjegyből állhat.')
  if (typeof fetchImpl !== 'function') throw new Error('A termékadatbázis ezen a környezeten nem érhető el.')
  const endpoint = String(baseUrl || DEFAULT_OPEN_FOOD_FACTS_URL).replace(/\/$/, '')
  let payload
  if (isGrapesAndroidApp() && baseUrl === DEFAULT_OPEN_FOOD_FACTS_URL && fetchImpl === globalThis.fetch) {
    payload = await requestAndroidFoodApi('offBarcode', code)
  } else {
    const response = await fetchImpl(`${endpoint}/api/v2/product/${encodeURIComponent(code)}.json`, { signal })
    if (!response.ok) throw new Error(`A termékadatbázis nem érhető el (${response.status}).`)
    payload = await response.json()
  }
  if (payload.status !== 1 || !payload.product) throw new Error('Nem található termék ezzel a vonalkóddal.')
  return productFromOpenFoodFacts(payload.product, code)
}


export async function searchOpenFoodFactsProducts(query, {
  page = 1, pageSize = 12, signal,
  baseUrl = import.meta.env?.VITE_FOOD_SEARCH_API_URL || DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL,
  legacyBaseUrl = DEFAULT_OPEN_FOOD_FACTS_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const term = String(query || '').trim().replace(/\s+/g, ' ')
  if (term.length < 2 || term.length > 120) throw new Error('A terméknév legalább 2, legfeljebb 120 karakter legyen.')
  if (typeof fetchImpl !== 'function') throw new Error('A termékadatbázis ezen a környezeten nem érhető el.')
  const requestedPage = Math.max(1, Number(page) || 1)
  const requestedSize = Math.min(24, Math.max(1, Number(pageSize) || 12))
  const fields = 'code,product_name_hu,product_name,generic_name_hu,generic_name,categories_tags,countries_tags,product_quantity_unit,image_front_small_url,nutriments,last_modified_t'
  const params = new URLSearchParams({
    q: term, page: String(requestedPage), page_size: String(requestedSize),
    langs: 'hu,en', boost_phrase: 'true', fields,
  })
  const endpoint = String(baseUrl || DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL).replace(/\/$/, '') + '/search?' + params
  async function fetchResults(url) {
    const useAndroid = isGrapesAndroidApp() && fetchImpl === globalThis.fetch &&
      (url.startsWith(DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL + '/search?') || url.startsWith(DEFAULT_OPEN_FOOD_FACTS_URL + '/cgi/search.pl?'))
    const response = useAndroid
      ? { ok: true, status: 200, json: () => requestAndroidFoodApi(url.includes('/cgi/search.pl?') ? 'offLegacySearch' : 'offSearch', term, requestedPage, requestedSize) }
      : await fetchImpl(url, { signal })
    if (!response.ok) {
      const error = new Error('A név szerinti termékkereső nem érhető el (' + response.status + ').')
      error.status = response.status
      throw error
    }
    const payload = await response.json()
    const hits = payload.hits || payload.products
    if (!Array.isArray(hits)) throw new Error('Az Open Food Facts keresője ismeretlen válaszformátumot adott.')
    const products = []
    const region = selectedOffRegion()
    for (const hit of hits) {
      const item = hit.document || hit._source || hit
      if (region !== 'all' && !item.countries_tags?.includes('en:' + ({
        hu: 'hungary', sk: 'slovakia', at: 'austria', de: 'germany',
        cz: 'czech-republic', pl: 'poland', ro: 'romania',
        gb: 'united-kingdom', us: 'united-states',
      }[region]))) continue
      try { products.push(productFromOpenFoodFacts(item)) } catch { /* Incomplete product skipped. */ }
    }
    return { count: Number(payload.count) || products.length, page: Number(payload.page) || requestedPage, products }
  }
  try {
    return await fetchResults(endpoint)
  } catch (error) {
    // Use documented legacy keyword search only if the new search backend fails.
    // Never bypass a rate limit, and never silently switch a custom test/proxy endpoint.
    const shouldFallback = baseUrl === DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL &&
      error?.name !== 'AbortError' && error?.status !== 429 && !/HTTP 429/.test(error?.message || '')
    if (!shouldFallback) throw error
    const legacy = new URLSearchParams({
      search_terms: term, search_simple: '1', action: 'process', json: '1',
      page: String(requestedPage), page_size: String(requestedSize), fields,
    })
    try {
      return await fetchResults(String(legacyBaseUrl).replace(/\/$/, '') + '/cgi/search.pl?' + legacy)
    } catch (fallbackError) {
      throw new Error('Open Food Facts keresés sikertelen: ' + error.message + ' Tartalék kereső: ' + fallbackError.message)
    }
  }
}
