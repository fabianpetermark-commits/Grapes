import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { foodFromUsdaSearchHit, translateUsdaQuery, searchOnlineUsdaFoods } from '../src/food/usda-online.js'
import { searchFoodCatalog } from '../src/food/food-catalog-search.js'
import { normalizeFoodItem, normalizeDiaryEntry, createEmptyFoodProject, foodBackupFromJson, foodBackupToJson } from '../src/food/food-data.js'

const fixture = {
  fdcId: 170001, description: 'Apples, raw, with skin', dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientId: 1008, unitName: 'KCAL', value: 52 },
    { nutrientId: 1003, unitName: 'G', value: 0.26 },
    { nutrientId: 1005, unitName: 'G', value: 13.81 },
    { nutrientId: 1004, unitName: 'G', value: 0.17 },
    { nutrientId: 1079, unitName: 'G', value: 2.4 },
    { nutrientId: 1093, unitName: 'MG', value: 1 },
  ],
}
const fakeOff = async () => ({ count: 0, products: [] })

test('magyar alapanyagok USDA keresőkifejezésre fordulnak, FDC azonosító nélkül', () => {
  assert.deepEqual(translateUsdaQuery('Alma'), { query: 'Apples, raw', label: 'Alma' })
  assert.deepEqual(translateUsdaQuery('BANÁN'), { query: 'Bananas, raw', label: 'Banán' })
  assert.deepEqual(translateUsdaQuery('főtt rizs'), { query: 'Rice, white, long-grain, cooked', label: 'Főtt rizs' })
  assert.deepEqual(translateUsdaQuery('barna rizs'), { query: 'Rice, brown, raw', label: 'Barna rizs' })
  assert.deepEqual(translateUsdaQuery('főtt barna rizs'), { query: 'Rice, brown, cooked', label: 'Főtt barna rizs' })
  assert.deepEqual(translateUsdaQuery('főtt csirkemell'), { query: 'Chicken breast, cooked', label: 'Csirkemell' })
  assert.deepEqual(translateUsdaQuery('egyedi angol termék'), { query: 'egyedi angol termék', label: '' })
})

test('csak valódi USDA tápértékek kerülhetnek 100 g-os ételbe; hiányzó érték null', () => {
  const result = foodFromUsdaSearchHit(fixture, 'Alma')
  assert.equal(result.name, 'Alma – nyers, héjjal')
  assert.equal(result.usdaDescription, 'Apples, raw, with skin')
  assert.equal(result.preparation, 'raw')
  assert.equal(result.verified, false)
  assert.equal(result.source.type, 'usda')
  assert.equal(result.source.id, '170001')
  assert.deepEqual([result.nutrients.energyKcal, result.nutrients.protein, result.nutrients.carbohydrate, result.nutrients.fat], [52, 0.26, 13.81, 0.17])
  assert.equal(result.nutrients.sugar, null)
  assert.equal(result.nutrients.salt, 0.0025)
  const food = normalizeFoodItem({ ...result, id: 'usda-apple-live' })
  assert.equal(food.nutrients.sugar, null)
  assert.equal(food.verified, false)
  assert.equal(food.source.id, '170001')
})

const usdaHit = (fdcId, description, energyKcal) => ({
  ...fixture, fdcId, description,
  foodNutrients: fixture.foodNutrients.map(nutrient => nutrient.nutrientId === 1008
    ? { ...nutrient, value: energyKcal } : { ...nutrient }),
})

const riceResponse = Object.freeze([
  usdaHit(2001, 'Rice, white, long-grain, parboiled, enriched, cooked', 123),
  usdaHit(2002, 'Rice, brown, long grain, unenriched, raw', 367),
  usdaHit(2003, 'Rice, white, long grain, unenriched, raw', 359),
  usdaHit(2004, 'Rice, white, long-grain, regular, raw, enriched', 365),
])

async function rankedSearch(query, foods, now) {
  return searchOnlineUsdaFoods(query, {
    android: true, now, androidSearch: async () => ({ foods }),
  })
}

test('a sima rizskeresésnél a nyers alapváltozatok megelőzik a főttet és az FDC ID egyedi', async () => {
  const result = await rankedSearch('rizs', [...riceResponse, riceResponse[2]], 1_000_000)
  assert.deepEqual(result.products.slice(0, 3).map(food => food.preparation), ['raw', 'raw', 'raw'])
  assert.equal(result.products.at(-1).preparation, 'cooked')
  assert.equal(new Set(result.products.map(food => food.source.id)).size, result.products.length)
  assert.match(result.products[0].name, /^(Fehér|Barna) rizs – nyers, hosszúszemű/)
})

test('a főtt rizs keresési szándéka a főtt tápértékű rekordot rangsorolja előre', async () => {
  const result = await rankedSearch('főtt rizs', riceResponse, 1_100_000)
  assert.equal(result.products[0].source.id, '2001')
  assert.equal(result.products[0].nutrients.energyKcal, 123)
  assert.equal(result.products[0].name, 'Fehér rizs – főtt, előgőzölt, hosszúszemű, dúsított')
})

test('a barna és a főtt barna rizs keresése minden megadott feltételt figyelembe vesz', async () => {
  const brownRaw = await rankedSearch('barna rizs', riceResponse, 1_200_000)
  const brownCookedHit = usdaHit(2005, 'Rice, brown, long-grain, cooked', 112)
  const brownCooked = await rankedSearch('főtt barna rizs', [...riceResponse, brownCookedHit], 1_300_000)
  assert.equal(brownRaw.products[0].source.id, '2002')
  assert.equal(brownCooked.products[0].source.id, '2005')
  assert.match(brownCooked.products[0].name, /^Barna rizs – főtt/)
})

test('az alma és csirkemell neve magyar, az elkészítési állapot és az eredeti leírás megmarad', async () => {
  const apple = foodFromUsdaSearchHit(fixture, 'Alma')
  const chickenRaw = foodFromUsdaSearchHit(usdaHit(3001, 'Chicken, broilers or fryers, breast, meat only, raw', 120), 'Csirkemell')
  const chickenCooked = foodFromUsdaSearchHit(usdaHit(3002, 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', 165), 'Csirkemell')
  assert.equal(apple.name, 'Alma – nyers, héjjal')
  assert.match(chickenRaw.name, /^Csirkemell – nyers, bőr nélkül/)
  assert.match(chickenCooked.name, /^Csirkemell – főtt, sült, bőr nélkül/)
  assert.notEqual(chickenRaw.source.id, chickenCooked.source.id)
  assert.match(chickenCooked.usdaDescription, /cooked, roasted/)
})

test('ismeretlen kifejezéshez csak a válaszban kapott FDC ID használható', async () => {
  const result = await rankedSearch('ismeretlen kifejezés', [
    { ...usdaHit(4001, 'Unknown edible ingredient, raw', 80), fdcId: undefined },
  ], 1_400_000)
  assert.deepEqual(result.products, [])
})

test('alapmakró hiány vagy tiltott adattípus esetén nem naplózható USDA találat', () => {
  assert.equal(foodFromUsdaSearchHit({ ...fixture, dataType: 'Branded' }), null)
  assert.equal(foodFromUsdaSearchHit({ ...fixture, fdcId: undefined }), null)
  assert.equal(foodFromUsdaSearchHit({ ...fixture, foodNutrients: fixture.foodNutrients.filter(n => n.nutrientId !== 1004) }), null)
  const negative = { ...fixture, foodNutrients: fixture.foodNutrients.map(n => n.nutrientId === 1003 ? { ...n, value: -1 } : n) }
  assert.equal(foodFromUsdaSearchHit(negative), null)
})

test('Android natív USDÁ-kérés keresés és cache, nincs kitalált azonosító', async () => {
  const called = []
  const mockNative = async (...args) => {
    called.push(args)
    return { foods: [fixture, { ...fixture, fdcId: undefined }] }
  }
  const a = await searchOnlineUsdaFoods('Alma', { android: true, androidSearch: mockNative, now: 50000 })
  const b = await searchOnlineUsdaFoods('alma', { android: true, androidSearch: mockNative, now: 51000 })
  assert.equal(a.products.length, 1)
  assert.equal(b.products.length, 1)
  assert.equal(a.products[0].source.id, '170001')
  assert.deepEqual(called, [['usdaSearch', 'Apples, raw']])
})

test('vonalkód nem indít USDA-kérést', async () => {
  let calls = 0
  const result = await searchOnlineUsdaFoods('5991234567890', { android: true, androidSearch: async () => { calls++; throw Error('should not call') } })
  assert.equal(result.products.length, 0)
  assert.equal(calls, 0)
})

test('online USDA és OFF kombinálódik, a mentett étel később visszatölthető', async () => {
  const result = await searchFoodCatalog('alma', {
    usdaSearch: async () => ({ count: 1, products: [foodFromUsdaSearchHit(fixture, 'Alma')] }),
    offSearch: fakeOff,
  })
  assert.deepEqual(result.providers.map(item => item.id), ['usda', 'usda-online', 'openfoodfacts'])
  assert.equal(result.products.length, 1)
  const profile = { id: 'online-usda-tester', name: 'Teszt' }
  const project = createEmptyFoodProject(profile)
  const food = normalizeFoodItem({ ...result.products[0], id: 'usda-apple-entry' })
  project.customFoods.push(food)
  project.diaryEntries.push(normalizeDiaryEntry({
    id: 'online-usda-entry', profileId: profile.id, mealType: 'breakfast',
    amount: 150, unit: 'g', occurredAt: '2026-10-16T10:00:00.000Z',
  }, food))
  const restored = foodBackupFromJson(foodBackupToJson(project), profile.id)
  assert.equal(restored.customFoods[0].source.id, '170001')
  assert.equal(restored.diaryEntries[0].snapshot.nutrients.energyKcal, 78)
})

test('natív Android Food Bridge csak meghatározott API végpontokat kezel', () => {
  const kotlin = readFileSync(new URL('../android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/FoodApiBridge.kt', import.meta.url), 'utf8')
  assert.match(kotlin, /"offSearch"/)
  assert.match(kotlin, /"usdaSearch"/)
  assert.match(kotlin, /"offBarcode"/)
  assert.match(kotlin, /withContext\(Dispatchers\.IO\)/)
  assert.match(kotlin, /3_000_000/)
  assert.doesNotMatch(kotlin, /request\(args\.optString/)
})
