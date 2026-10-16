import test from 'node:test'
import assert from 'node:assert/strict'
import { searchHungarianFoods, resolveUsdaSearchTerm } from '../src/food/food-search-method.js'

const foods = [
  { fdcId: 170000, nameHu: 'Vöröshagyma, nyers', aliasesHu: ['vöröshagyma', 'hagyma'], usdaQuery: 'Onions, raw' },
  { fdcId: 170001, nameHu: 'Vöröshagyma, főtt', aliasesHu: ['főtt hagyma'], usdaQuery: 'Onions, cooked' },
  { fdcId: 170002, nameHu: 'Fokhagyma, nyers', aliasesHu: ['fokhagyma'], usdaQuery: 'Garlic, raw' },
  { fdcId: 170003, nameHu: 'Búzafinomliszt', aliasesHu: ['finomliszt', 'bl55'], usdaQuery: 'Wheat flour, white, all-purpose' },
]
test('accentless Hungarian query finds the correct record', () => {
  assert.equal(searchHungarianFoods('VOROSHAGYMA', foods)[0].fdcId, 170000)
  assert.equal(searchHungarianFoods('fott hagyma', foods)[0].fdcId, 170001)
})
test('synonyms match without unrelated categories', () => {
  assert.equal(searchHungarianFoods('bl55', foods)[0].nameHu, 'Búzafinomliszt')
  assert.deepEqual(searchHungarianFoods('zöldség', foods), [])
})
test('unknown queries are never translated by guessing', () => {
  assert.equal(resolveUsdaSearchTerm('ismeretlen étel', foods), null)
  assert.equal(resolveUsdaSearchTerm('voroshagyma', foods), 'Onions, raw')
})
