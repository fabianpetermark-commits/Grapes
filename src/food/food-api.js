const DEFAULT_OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'
const DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL = 'https://search.openfoodfacts.org'
const DEFAULT_FOOD_BROKER_URL = import.meta.env?.VITE_FOOD_BROKER_URL || import.meta.env?.VITE_EBOOK_TRANSFER_BROKER_URL || ''

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
  const response = await fetchImpl(`${endpoint}/api/v2/product/${encodeURIComponent(code)}.json`, { signal })
  if (!response.ok) throw new Error(`A termékadatbázis nem érhető el (${response.status}).`)
  const payload = await response.json()
  if (payload.status !== 1 || !payload.product) throw new Error('Nem található termék ezzel a vonalkóddal.')
  return productFromOpenFoodFacts(payload.product, code)
}

export async function searchOpenFoodFactsProducts(query, { page = 1, pageSize = 12, signal, baseUrl = import.meta.env?.VITE_FOOD_SEARCH_API_URL || DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL, fetchImpl = globalThis.fetch } = {}) {
  const term = String(query || '').trim().replace(/\s+/g, ' ')
  if (term.length < 2 || term.length > 120) throw new Error('A terméknév legalább 2, legfeljebb 120 karakter legyen.')
  if (typeof fetchImpl !== 'function') throw new Error('A termékadatbázis ezen a környezeten nem érhető el.')
  const params = new URLSearchParams({
    q: term, page: String(Math.max(1, Number(page) || 1)), page_size: String(Math.min(24, Math.max(1, Number(pageSize) || 12))),
    langs: 'hu,en', boost_phrase: 'true',
    fields: 'code,product_name_hu,product_name,generic_name_hu,generic_name,categories_tags,product_quantity_unit,image_front_small_url,nutriments,last_modified_t',
  })
  const endpoint = `${String(baseUrl || DEFAULT_OPEN_FOOD_FACTS_SEARCH_URL).replace(/\/$/, '')}/search?${params}`
  const response = await fetchImpl(endpoint, { signal })
  if (!response.ok) throw new Error(`A név szerinti termékkereső nem érhető el (${response.status}).`)
  const payload = await response.json()
  const products = []
  for (const hit of payload.hits || []) {
    try { products.push(productFromOpenFoodFacts(hit)) } catch {}
  }
  return { count: Number(payload.count) || products.length, page: Number(payload.page) || 1, products }
}

function bridgeNonce(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(24)
  if (cryptoImpl?.getRandomValues) cryptoImpl.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

function normalizeBrokerProduct(product) {
  if (!product || typeof product !== 'object' || !product.name || !product.source?.id) return null
  const barcode = String(product.barcode || '').trim()
  if (barcode && !/^\d{7,14}$/.test(barcode)) return null
  return {
    kind: 'product', name: String(product.name).slice(0, 180), barcode,
    category: String(product.category || 'Élelmiszer').slice(0, 120), baseUnit: product.baseUnit === 'ml' ? 'ml' : 'g', imageUrl: '',
    nutrients: {
      energyKcal: numberOrNull(product.nutrients?.energyKcal), protein: numberOrNull(product.nutrients?.protein),
      carbohydrate: numberOrNull(product.nutrients?.carbohydrate), fat: numberOrNull(product.nutrients?.fat),
      fiber: numberOrNull(product.nutrients?.fiber), sugar: numberOrNull(product.nutrients?.sugar),
      saturatedFat: numberOrNull(product.nutrients?.saturatedFat), salt: numberOrNull(product.nutrients?.salt),
    },
    source: { type: 'fatsecret', id: String(product.source.id), revision: String(product.source.revision || ''), attribution: 'FatSecret Platform' },
  }
}

async function fatSecretBridgeRequest(kind, value, { brokerUrl = DEFAULT_FOOD_BROKER_URL, timeoutMs = 15000, windowImpl = globalThis.window, documentImpl = globalThis.document, cryptoImpl = globalThis.crypto } = {}) {
  if (typeof globalThis.__GRAPES_FATSECRET_TEST__ === 'function') return globalThis.__GRAPES_FATSECRET_TEST__(kind, value)
  if (!brokerUrl) throw new Error('A FatSecret kereső még nincs konfigurálva.')
  if (!windowImpl?.addEventListener || !documentImpl?.createElement) throw new Error('A FatSecret kereső ebben a környezetben nem érhető el.')
  const nonce = bridgeNonce(cryptoImpl)
  const endpoint = new URL(brokerUrl)
  endpoint.searchParams.set('action', 'food-search'); endpoint.searchParams.set('kind', kind); endpoint.searchParams.set('value', value); endpoint.searchParams.set('nonce', nonce)
  const frame = documentImpl.createElement('iframe'); frame.hidden = true; frame.title = 'FatSecret termékkeresés'; frame.src = endpoint.toString()
  return new Promise((resolve, reject) => {
    const cleanup = () => { windowImpl.removeEventListener('message', receive); frame.remove(); clearTimeout(timer) }
    const receive = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'grapes-fatsecret-result' || event.data?.nonce !== nonce) return
      cleanup()
      if (event.data.status !== 'ok') reject(new Error(event.data.message || 'A FatSecret keresés nem sikerült.'))
      else resolve((event.data.products || []).map(normalizeBrokerProduct).filter(Boolean))
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('A FatSecret keresés túllépte az időkorlátot.')) }, timeoutMs)
    windowImpl.addEventListener('message', receive); documentImpl.body.append(frame)
  })
}

export async function searchFatSecretProducts(query, options = {}) {
  const term = String(query || '').trim().replace(/\s+/g, ' ')
  if (term.length < 2 || term.length > 120) throw new Error('A terméknév legalább 2, legfeljebb 120 karakter legyen.')
  const products = await fatSecretBridgeRequest('name', term, options)
  return { count: products.length, page: 1, products }
}

export async function lookupFatSecretProduct(barcode, options = {}) {
  const code = String(barcode || '').trim()
  if (!/^\d{7,14}$/.test(code)) throw new Error('A vonalkód 7–14 számjegyből állhat.')
  const products = await fatSecretBridgeRequest('barcode', code, options)
  if (!products.length) throw new Error('A FatSecret adatbázisban sem található termék ezzel a vonalkóddal.')
  return products[0]
}
