import test from 'node:test'
import assert from 'node:assert/strict'

import { lookupOpenFoodFactsProduct, searchOpenFoodFactsProducts } from '../src/food/food-api.js'


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
  await assert.rejects(() => lookupOpenFoodFactsProduct('5991234567890', { fetchImpl: async () => response({}, { ok: false, status: 404 }) }), /Nem található termék ezzel a vonalkóddal/)
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
          categories_tags: ['en:spreads', 'en:chocolate-spreads'], countries_tags: ['en:hungary'], product_quantity_unit: 'g',
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
  assert.equal(url.searchParams.get('q'), 'mogyorókrém countries_tags:"en:hungary"')
  assert.equal(url.searchParams.get('langs'), 'hu,en')
  assert.match(url.searchParams.get('fields'), /code,product_name_hu,product_name/)
  assert.equal(result.count, 1)
  assert.equal(result.sourceCount, 2)
  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].name, 'Magyar mogyorókrém')
  assert.equal(result.products[0].category, 'chocolate spreads')
  assert.equal(result.products[0].nutrients.energyKcal, 500)
})

test('a név szerinti keresés validációs és hálózati hibáit jelzi', async () => {
  await assert.rejects(() => searchOpenFoodFactsProducts('a'), /legalább 2.*karakter/)
  await assert.rejects(() => searchOpenFoodFactsProducts('müzli', { fetchImpl: async () => response({}, { ok: false, status: 429 }) }), /429/)
})

test('az eltávolított integráció nem exportál FatSecret keresőfüggvényeket', async () => {
  const api = await import('../src/food/food-api.js')
  assert.equal('searchFatSecretProducts' in api, false)
  assert.equal('lookupFatSecretProduct' in api, false)
})

test('OFF ország beállítás server-side szűrés és helyi ellenőrzés, márka, eredeti név és tápérték', async () => {
  const previous = globalThis.localStorage
  const store = new Map([['grapes.food.openFoodFacts.region', 'hu']])
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) }
  try {
    const hits = [
      { code: '5991111111111', product_name: 'Túró', product_name_hu: 'Magyar túró', brands: 'Márka A', countries_tags: ['en:hungary'],
        nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 12, fat_100g: 3, carbohydrates_100g: 1.2, sodium_100g: 0.1 } },
      { code: '5992222222222', product_name: 'Foreign yoghurt', brands: 'Brand B', lang: 'en', countries_tags: ['en:hungary'],
        nutriments: { 'energy-kcal_100g': 120 } },
      { code: '5993333333333', product_name: 'Export cheese', countries_tags: ['en:germany'],
        nutriments: { 'energy-kcal_100g': 280 } },
      { code: '5994444444444', product_name: 'Unverified region', nutriments: {} },
    ]
    const requests = []
    const fetchImpl = async url => { requests.push(String(url)); return response({ hits, count: hits.length }) }
    const hu = await searchOpenFoodFactsProducts('túró', { baseUrl: 'https://search.example', fetchImpl })
    assert.equal(new URL(requests[0]).searchParams.get('q'), 'túró countries_tags:"en:hungary"')
    assert.match(new URL(requests[0]).searchParams.get('fields'), /countries_tags,brands/)
    assert.equal(hu.products.length, 2)
    assert.equal(hu.count, 2)
    assert.equal(hu.products[0].brand, 'Márka A')
    assert.equal(hu.products[0].nutrients.energyKcal, 100)
    assert.equal(hu.products[0].nutrients.salt, 0.25)
    assert.equal(hu.products[1].productLanguage, 'en')
    assert.equal(hu.products[1].hasHungarianName, false)
    assert.equal(hu.products[1].nutrients.protein, null)
    store.set('grapes.food.openFoodFacts.region', 'de')
    const de = await searchOpenFoodFactsProducts('túró', { baseUrl: 'https://search.example', fetchImpl })
    assert.equal(new URL(requests[1]).searchParams.get('q'), 'túró countries_tags:"en:germany"')
    assert.deepEqual(de.products.map(x => x.barcode), ['5993333333333'])
    store.set('grapes.food.openFoodFacts.region', 'all')
    const all = await searchOpenFoodFactsProducts('túró', { baseUrl: 'https://search.example', fetchImpl })
    assert.equal(new URL(requests[2]).searchParams.get('q'), 'túró')
    assert.equal(all.products.length, 4)
  } finally {
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})
test('OFF legacy országfüggő tartalék szűrő nem hagyja figyelmen kívül a beállítást', async () => {
  const previous = globalThis.localStorage
  globalThis.localStorage = { getItem: () => 'hu' }
  try {
    let legacy = ''
    const result = await searchOpenFoodFactsProducts('kenyér', { fetchImpl: async url => {
      if (String(url).includes('search.openfoodfacts.org')) return response({}, { ok: false, status: 503 })
      legacy = String(url)
      return response({ products: [{ code:'5990000000001', product_name_hu:'Kenyér', countries_tags:['en:hungary'], nutriments:{} }] })
    } })
    assert.equal(new URL(legacy).searchParams.get('tagtype_0'), 'countries')
    assert.equal(new URL(legacy).searchParams.get('tag_0'), 'hungary')
    assert.equal(result.products.length, 1)
  } finally {
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})
