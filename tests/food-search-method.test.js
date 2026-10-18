import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { HUNGARIAN_USDA_CATALOG } from '../src/food/hungarian-food-catalog.js'
import {
  createHungarianFoodIndex, resolveHungarianFood, resolveUsdaSearchTerm,
  resolveVerifiedFdcId, searchHungarianFoods,
} from '../src/food/food-search-method.js'

const verification = { source: 'test', checkedAt: '2026-10-16' }
const record = overrides => ({
  id: 'onion-raw', fdcId: 170000, nameHu: 'Vöröshagyma, nyers',
  aliasesHu: ['vöröshagyma', 'hagyma'], usdaQuery: 'Onions, raw',
  preparation: 'raw', ediblePart: 'bulb', processing: 'unprocessed',
  verified: true, verification, ...overrides,
})
const foods = [
  record({}),
  record({ id: 'onion-cooked', fdcId: 170001, nameHu: 'Vöröshagyma, főtt', aliasesHu: ['főtt hagyma', 'hagyma'], usdaQuery: 'Onions, cooked', preparation: 'cooked' }),
  record({ id: 'garlic-raw', fdcId: 1104647, nameHu: 'Fokhagyma, nyers', aliasesHu: ['fokhagyma'], usdaQuery: 'Garlic, raw', ediblePart: 'clove' }),
  record({ id: 'flour-bl55', fdcId: 169761, nameHu: 'Búzafinomliszt BL55', aliasesHu: ['finomliszt', 'bl55', 'bl 55', 'bl-55'], usdaQuery: 'Wheat flour, white, all-purpose, unenriched', preparation: 'not-applicable', ediblePart: 'grain-endosperm', processing: 'milled-unenriched' }),
]

test('az ékezet és a magyar toldalék nem akadályozza a találatot', () => {
  const index = createHungarianFoodIndex(foods)
  assert.equal(searchHungarianFoods('VOROSHAGYMA', index)[0].id, 'onion-raw')
  assert.equal(searchHungarianFoods('vöröshagymát', index)[0].id, 'onion-raw')
  assert.deepEqual(searchHungarianFoods('hagymából', index).map(food => food.id).sort(), ['onion-cooked', 'onion-raw'])
})

test('a BL55 elválasztóval és elválasztó nélkül is ugyanaz a pontos rekord', () => {
  for (const query of ['BL55', 'BL 55', 'BL-55'])
    assert.equal(resolveVerifiedFdcId(query, foods), 169761)
})

test('azonos generikus alias eltérő elkészítési állapotoknál kétértelmű', () => {
  const result = resolveHungarianFood('hagyma', foods)
  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.matches.map(food => food.preparation).sort(), ['cooked', 'raw'])
  assert.equal(resolveUsdaSearchTerm('hagyma', foods), null)
  assert.equal(resolveVerifiedFdcId('hagyma', foods), null)
})

test('a teljes állapotnév egyértelmű, a rövid prefix nem fordul automatikusan USDA-kifejezésre', () => {
  assert.equal(resolveUsdaSearchTerm('főtt hagyma', foods), 'Onions, cooked')
  assert.equal(resolveUsdaSearchTerm('fo', foods), null)
  assert.deepEqual(searchHungarianFoods('fo', foods).map(food => food.id).sort(), ['garlic-raw', 'onion-cooked'])
})

test('egy jelöltszó nem elégíthet ki két külön keresési tokent', () => {
  assert.deepEqual(searchHungarianFoods('fo fok', foods), [])
})

test('a katalógussorrend megfordítása nem változtatja meg a jelentést', () => {
  const forward = searchHungarianFoods('hagyma', foods).map(food => food.id)
  const reverse = searchHungarianFoods('hagyma', [...foods].reverse()).map(food => food.id)
  assert.deepEqual(forward, reverse)
  assert.equal(resolveHungarianFood('hagyma', [...foods].reverse()).status, 'ambiguous')
})

test('az elkészítés, feldolgozás és ehető rész külön jelentést alkot', () => {
  const variants = [
    ['nyers cukkini', 'raw', 'unprocessed', 'fruit'],
    ['főtt cukkini', 'cooked', 'unprocessed', 'fruit'],
    ['sült cukkini', 'roasted', 'unprocessed', 'fruit'],
    ['párolt cukkini', 'steamed', 'unprocessed', 'fruit'],
    ['fagyasztott cukkini', 'raw', 'frozen', 'fruit'],
    ['konzerv cukkini', 'cooked', 'canned', 'fruit'],
    ['édesburgonya gumó', 'raw', 'unprocessed', 'tuber'],
    ['édesburgonya levél', 'raw', 'unprocessed', 'leaf'],
    ['citrom héj', 'raw', 'unprocessed', 'peel'],
    ['citromlé', 'raw', 'pressed', 'juice'],
    ['egész citrom', 'raw', 'unprocessed', 'whole'],
  ].map(([nameHu, preparation, processing, ediblePart], index) => record({
    id: `variant-${index}`, fdcId: 200000 + index, nameHu, aliasesHu: [],
    usdaQuery: `Variant ${index}`, preparation, processing, ediblePart,
  }))
  for (const food of variants)
    assert.equal(resolveHungarianFood(food.nameHu, variants).match?.id, food.id)
})

test('ismeretlen és túl rövid keresésből nincs USDA-fordítás', () => {
  assert.equal(resolveUsdaSearchTerm('ismeretlen étel', foods), null)
  assert.equal(resolveUsdaSearchTerm('a', foods), null)
})

test('csak ellenőrzési nyommal rendelkező strukturált rekord indexelhető', () => {
  assert.throws(() => createHungarianFoodIndex([{ ...foods[0], verified: false }]), /ellenőrzési nyoma/)
  assert.throws(() => createHungarianFoodIndex([{ ...foods[0], ediblePart: '' }]), /ediblePart/)
  assert.throws(() => createHungarianFoodIndex([{ ...foods[0], fdcId: '170000' }]), /fdcId/)
})

test('a kiadott katalógus minden fdcId-je egyedi és ellenőrzött', () => {
  createHungarianFoodIndex(HUNGARIAN_USDA_CATALOG)
  assert.equal(new Set(HUNGARIAN_USDA_CATALOG.map(food => food.fdcId)).size, HUNGARIAN_USDA_CATALOG.length)
  assert.ok(HUNGARIAN_USDA_CATALOG.every(food => food.usdaDescription && food.validation))
})

test('az előre épített index nagy katalóguson is gyors keresést ad', () => {
  const large = Array.from({ length: 50000 }, (_, index) => record({
    id: `food-${index}`, fdcId: 1000000 + index, nameHu: `Tesztétel ${index}`,
    aliasesHu: [`minta${index}`], usdaQuery: `Test food ${index}`,
  }))
  const index = createHungarianFoodIndex(large)
  const started = performance.now()
  for (let i = 0; i < 200; i++) {
    const number = 49999 - (i % 100)
    assert.equal(searchHungarianFoods(`minta${number}`, index, { limit: 5 })[0].id, `food-${number}`)
  }
  assert.ok(performance.now() - started < 250, '200 indexed searches should finish below 250 ms')
})
