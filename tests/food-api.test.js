import test from 'node:test'
import assert from 'node:assert/strict'

import { lookupFatSecretProduct, lookupOpenFoodFactsProduct, searchFatSecretProducts, searchOpenFoodFactsProducts } from '../src/food/food-api.js'

test('a FatSecret bridge csak a saját iframe és Google origin egyező nonce-ú válaszát fogadja', async () => {
  let receive, frame
  const windowImpl = { addEventListener: (_type, listener) => { receive = listener }, removeEventListener() {} }
  const documentImpl = {
    createElement: () => (frame = { contentWindow: {}, remove() {} }),
    body: { append() {
      const nonce = new URL(frame.src).searchParams.get('nonce')
      const data = { type: 'grapes-fatsecret-result', nonce, status: 'ok', products: [] }
      receive({ source: frame.contentWindow, origin: 'https://example.com', data: { ...data, status: 'error', message: 'foreign' } })
      receive({ source: {}, origin: 'https://script.googleusercontent.com', data: { ...data, status: 'error', message: 'wrong frame' } })
      receive({ source: frame.contentWindow, origin: 'https://script.googleusercontent.com', data: { ...data, nonce: 'wrong', status: 'error', message: 'wrong nonce' } })
      receive({ source: frame.contentWindow, origin: 'https://script.googleusercontent.com', data })
    } },
  }
  const result = await searchFatSecretProducts('alma', { brokerUrl: 'https://script.google.com/macros/s/test/exec', windowImpl, documentImpl })
  assert.deepEqual(result.products, [])
})

const response = (body, { ok = true, status = 200 } = {}) => ({ ok, status, async json() { return body } })

test('az Open Food Facts választ Food-étellé alakítja és a magyar nevet részesíti előnyben', async () => {
  let requestedUrl = ''
  const product = await lookupOpenFoodFactsProduct('5991234567890', {
    baseUrl: 'https://food.example/',
    fetchImpl: async url => {
      requestedUrl = url
      return response({ status: 1, product: {
        product_name_hu: 'Teszt müzli', product_name: 'Test cereal', categories_tags: ['hu:reggeli'],
        product_quantity_unit: 'g', last_modified_t: 123,
        nutriments: { 'energy-kcal_100g': 380, proteins_100g: 12, carbohydrates_100g: 64, fat_100g: 8 },
      } })
    },
  })
  assert.equal(requestedUrl, 'https://food.example/api/v2/product/5991234567890.json')
  assert.equal(product.name, 'Teszt müzli')
  assert.equal(product.category, 'reggeli')
  assert.equal(product.nutrients.energyKcal, 380)
  assert.equal(product.nutrients.fiber, null)
  assert.equal(product.source.type, 'openfoodfacts')
})

test('a termék API hibáit és az érvénytelen vonalkódot érthetően jelzi', async () => {
  await assert.rejects(() => lookupOpenFoodFactsProduct('12abc'), /7–14 számjegyből/)
  await assert.rejects(() => lookupOpenFoodFactsProduct('5991234567890', { fetchImpl: async () => response({}, { ok: false, status: 503 }) }), /503/)
  await assert.rejects(() => lookupOpenFoodFactsProduct('5991234567890', { fetchImpl: async () => response({ status: 0 }) }), /Nem található termék/)
  await assert.rejects(() => lookupOpenFoodFactsProduct('5991234567890', { fetchImpl: async () => response({ status: 1, product: { nutriments: {} } }) }), /használható név/)
})

test('név alapján keres az Open Food Factsban és kiszűri a használhatatlan találatokat', async () => {
  let requestedUrl = ''
  const result = await searchOpenFoodFactsProducts('mogyorókrém', {
    baseUrl: 'https://search.example/',
    fetchImpl: async url => {
      requestedUrl = url
      return response({ count: 2, page: 1, hits: [
        {
          code: '5991111111111', product_name_hu: 'Magyar mogyorókrém',
          categories_tags: ['en:spreads', 'en:chocolate-spreads'], product_quantity_unit: 'g',
          image_front_small_url: 'https://images.example/product.jpg', last_modified_t: 123,
          nutriments: { 'energy-kcal_100g': 500, proteins_100g: 6 },
        },
        { code: 'hibás', product_name: 'Kihagyandó találat', nutriments: {} },
      ] })
    },
  })
  const url = new URL(requestedUrl)
  assert.equal(url.origin, 'https://search.example')
  assert.equal(url.pathname, '/search')
  assert.equal(url.searchParams.get('q'), 'mogyorókrém')
  assert.equal(url.searchParams.get('langs'), 'hu,en')
  assert.match(url.searchParams.get('fields'), /code,product_name_hu,product_name/)
  assert.equal(result.count, 2)
  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].name, 'Magyar mogyorókrém')
  assert.equal(result.products[0].category, 'chocolate spreads')
  assert.equal(result.products[0].nutrients.energyKcal, 500)
})

test('a név szerinti keresés validációs és hálózati hibáit jelzi', async () => {
  await assert.rejects(() => searchOpenFoodFactsProducts('a'), /legalább 2.*karakter/)
  await assert.rejects(() => searchOpenFoodFactsProducts('müzli', { fetchImpl: async () => response({}, { ok: false, status: 429 }) }), /429/)
})

test('a FatSecret közvetítő név és vonalkód alapján normalizált terméket ad', async () => {
  const calls = []
  globalThis.__GRAPES_FATSECRET_TEST__ = async (kind, value) => {
    calls.push([kind, value])
    return [{
      name: 'Pikok – Baromfi párizsi', barcode: kind === 'barcode' ? value : '', category: 'Márkás élelmiszer', baseUnit: 'g',
      nutrients: { energyKcal: 210, protein: 12, salt: 1.7 }, source: { type: 'fatsecret', id: 'fs-1' },
    }]
  }
  try {
    const search = await searchFatSecretProducts('baromfi párizsi')
    const barcode = await lookupFatSecretProduct('5999999999999')
    assert.equal(search.products[0].source.type, 'fatsecret')
    assert.equal(search.products[0].name, 'Pikok – Baromfi párizsi')
    assert.equal(barcode.barcode, '5999999999999')
    assert.deepEqual(calls, [['name', 'baromfi párizsi'], ['barcode', '5999999999999']])
  } finally { delete globalThis.__GRAPES_FATSECRET_TEST__ }
})
