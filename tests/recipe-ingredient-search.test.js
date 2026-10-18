import assert from 'node:assert/strict'
import test from 'node:test'
import { recipeIngredientMatches } from '../src/food/recipe-ingredient-search.js'

const food = (id, name, sourceType = 'manual', sourceId = id, barcode = '') => ({
  id, kind: 'product', name, category: 'Alapanyag', barcode,
  source: { type: sourceType, id: sourceId },
})
const saved = [
  food('turo', 'Zsírszegény túró'),
  food('potato', 'Burgonya, főtt'),
  food('rice', 'Rizs, barna'),
  { ...food('saved-recipe', 'Rizses recept'), kind: 'recipe' },
]
const usda = food('', 'Vöröshagyma, nyers', 'usda', '170000')
const remoteRice = food('', 'Rizs, fehér, főtt', 'usda', '12002')

test('the recipe field searches saved foods with Hungarian accents and synonyms', () => {
  assert.deepEqual(recipeIngredientMatches(saved, 'turo').map(item => item.food.id), ['turo'])
  assert.deepEqual(recipeIngredientMatches(saved, 'krumpli').map(item => item.food.id), ['potato'])
  assert.equal(recipeIngredientMatches(saved, 'rizs').some(item => item.food.kind === 'recipe'), false)
  assert.deepEqual(recipeIngredientMatches(saved, '').map(item => item.food.id), [])
})

test('offline USDA matches are available before any network request or saved product', () => {
  const matches = recipeIngredientMatches([], 'voroshagyma', { verifiedUsdaFoods: [usda] })
  assert.equal(matches.length, 1)
  assert.equal(matches[0].food.name, 'Vöröshagyma, nyers')
  assert.equal(matches[0].external, true)
  assert.equal(matches[0].value, 'catalog:0')
})

test('typing offers saved foods first, then remote results, without changing project data', () => {
  const before = JSON.stringify(saved)
  const matches = recipeIngredientMatches(saved, 'rizs', {
    remoteFoods: [remoteRice, saved[2], remoteRice],
  })
  assert.deepEqual(matches.map(item => item.food.name), ['Rizs, barna', 'Rizs, fehér, főtt'])
  assert.equal(matches[0].value, 'rice')
  assert.equal(matches[1].value, 'catalog:1')
  assert.equal(JSON.stringify(saved), before, 'searching must not create or modify saved foods')
})

test('OFF and USDA duplicates are suppressed by barcode or provider identity', () => {
  const local = food('saved-off', 'Keksz', 'openfoodfacts', '5991234567890', '5991234567890')
  const remote = food('', 'Keksz (Open Food Facts)', 'openfoodfacts', '5991234567890', '5991234567890')
  const options = recipeIngredientMatches([local], 'keksz', { remoteFoods: [remote] })
  assert.equal(options.length, 1)
  assert.equal(options[0].value, 'saved-off')
})

test('an unrelated search cannot return the entire catalog', () => {
  assert.deepEqual(recipeIngredientMatches(saved, 'nemlétezőxxx', { verifiedUsdaFoods: [], remoteFoods: [] }), [])
})
