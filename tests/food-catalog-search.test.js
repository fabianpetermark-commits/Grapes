import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeFoodCatalogResults, searchFoodCatalog } from '../src/food/food-catalog-search.js'
import { searchOpenFoodFactsProducts } from '../src/food/food-api.js'

const food = (name, barcode, type = 'openfoodfacts') => ({
  name, barcode, kind: 'product', category: 'Teszt', baseUnit: 'g',
  nutrients: { energyKcal: 100, protein: 2 }, source: { type, id: barcode || name },
})
const fulfilled = products => ({ count: products.length, page: 1, products })
const ok = body => ({ ok: true, status: 200, json: async () => body })

test('név szerinti keresés kizárólag Open Food Facts szolgáltatót használ', async () => {
  const result = await searchFoodCatalog('vöröshagyma', {
    offSearch: async () => fulfilled([food('Vöröshagyma', '5991234567890')]),
  })
  assert.equal(result.products.length, 1)
  assert.deepEqual(result.providers.map(item => item.id), ['openfoodfacts'])
  assert.equal(result.unavailable, false)
  assert.equal(result.errors.length, 0)
})

test('azonos vonalkódú termékeket nem jelenítünk meg duplán', () => {
  const results = mergeFoodCatalogResults([
    fulfilled([food('A termék', '5991234567890')]),
    fulfilled([food('A termék másik neve', '5991234567890')]),
  ])
  assert.equal(results.length, 1)
})

test('eltérő forrásazonosítójú termékeket megtartunk', () => {
  const results = mergeFoodCatalogResults([
    fulfilled([food('Csirkemell', '', 'openfoodfacts')]),
    fulfilled([food('Csirkemell', '', 'usda')]),
  ])
  assert.equal(results.length, 2)
})

test('Open Food Facts hiba esetén az online keresés elérhetetlen', async () => {
  const result = await searchFoodCatalog('sajt', {
    offSearch: async () => { throw new Error('HTTP 503') },
  })
  assert.equal(result.unavailable, true)
  assert.equal(result.products.length, 0)
  assert.equal(result.errors.length, 1)
})

test('vonalkódnál kizárólag az Open Food Facts közvetlen keresése fut', async () => {
  const called = []
  const result = await searchFoodCatalog('5991234567890', {
    offSearch: async () => { throw new Error('Nem szabad meghívni') },
    offBarcode: async barcode => { called.push('off:' + barcode); return food('Keksz', barcode) },
  })
  assert.deepEqual(called, ['off:5991234567890'])
  assert.equal(result.products.length, 1)
})

test('az üres és túl hosszú keresést elutasítjuk külső kérés nélkül', async () => {
  await assert.rejects(searchFoodCatalog('a'), /Legalább 2/)
  await assert.rejects(searchFoodCatalog('a'.repeat(121)), /120 karakter/)
})

test('a használhatatlan termékek nem kerülnek be a találatok közé', () => {
  assert.deepEqual(mergeFoodCatalogResults([fulfilled([{ name: '', source: { id: '1' } }, food('Keksz', '5991234567890')])]).map(item => item.name), ['Keksz'])
})

test('Open Food Facts tartalék keresője aktiválódik a fő végpont hibájánál', async () => {
  const requested = []
  const result = await searchOpenFoodFactsProducts('kenyér', {
    fetchImpl: async url => {
      requested.push(String(url))
      if (String(url).startsWith('https://search.openfoodfacts.org')) return { ok: false, status: 503 }
      return ok({ count: 1, page: 1, products: [{
        code: '5991234567890', product_name_hu: 'Barna kenyér',
        nutriments: { 'energy-kcal_100g': 248 },
      }] })
    },
  })
  assert.equal(requested.length, 2)
  assert.match(requested[1], /\/cgi\/search\.pl\?/)
  assert.match(requested[1], /search_terms=keny/)
  assert.equal(result.products[0].name, 'Barna kenyér')
})

test('429 korlátozásnál nincs automatikus kerülő keresés', async () => {
  let calls = 0
  await assert.rejects(() => searchOpenFoodFactsProducts('kenyér', {
    fetchImpl: async () => { calls++; return { ok: false, status: 429 } },
  }), /429/)
  assert.equal(calls, 1)
})

test('ismeretlen főválasz esetén is használható a tartalék JSON terméklista', async () => {
  let calls = 0
  const result = await searchOpenFoodFactsProducts('alma', { fetchImpl: async () => {
    calls++
    return ok(calls === 1 ? { count: 3, hits: null } : { count: 1, products: [{
      code:'5991234567890',product_name:'Alma',nutriments:{'energy-kcal_100g':55},
    }] })
  } })
  assert.equal(result.products.length, 1)
})
