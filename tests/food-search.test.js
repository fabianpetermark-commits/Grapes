import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeSearchText, searchFoods, foodSourceLabel } from '../src/food/food-search.js'

const foods = [
  { id: 'potato', name: 'Burgonya főtt', category: 'Köret' },
  { id: 'chicken', name: 'Csirkemell filé', category: 'Hús' },
  { id: 'bread', name: 'Teljes kiőrlésű kenyér', category: 'Pékáru' },
]

test('ékezetfüggetlenül normalizál', () => {
  assert.equal(normalizeSearchText('  TELJES kiőrlésű! '), 'teljes kiorlesu')
})

test('magyar szinonimára megtalálja az ételt', () => {
  assert.equal(searchFoods(foods, 'krumpli')[0].id, 'potato')
})

test('egy karakteres elírást tolerál', () => {
  assert.equal(searchFoods(foods, 'csirkemel')[0].id, 'chicken')
})

test('azonos találatnál kedvencet és használatot rangsorol', () => {
  const same = [
    { id: 'a', name: 'Joghurt A', category: 'Tejtermék' },
    { id: 'b', name: 'Joghurt B', category: 'Tejtermék' },
  ]
  const entries = [{ snapshot: { foodId: 'b' } }, { snapshot: { foodId: 'b' } }]
  assert.equal(searchFoods(same, 'joghurt', { favorites: ['b'], entries })[0].id, 'b')
})


test('mobil kereső: ékezet, szinonima és kedvenc rangsorolás', () => {
  const items = [
    { id: 'turo', name: 'Zsírszegény túró', category: 'Tejtermék' },
    { id: 'potato', name: 'Burgonya főtt', category: 'Köret' },
    { id: 'bread', name: 'Fehér kenyér', category: 'Pékáru' },
  ]
  assert.equal(searchFoods(items, 'turo')[0].id, 'turo')
  assert.equal(searchFoods(items, 'krumpli')[0].id, 'potato')
  assert.equal(searchFoods(items, 'kenyer')[0].id, 'bread')
  assert.equal(searchFoods(items, '', { favorites: ['bread'] })[0].id, 'bread')
})

test('FatSecret forráscímke nem lehet Saját étel; a többi szolgáltató marad', () => {
  assert.equal(foodSourceLabel({ source: { type: 'fatsecret' } }), 'FatSecret')
  assert.equal(foodSourceLabel({ source: { type: 'openfoodfacts' } }), 'Open Food Facts')
  assert.equal(foodSourceLabel({ source: { type: 'yazio' } }), 'YAZIO')
  assert.equal(foodSourceLabel({ source: { type: 'usda' }, verified: true }), 'USDA · ellenőrzött offline')
  assert.equal(foodSourceLabel({ source: { type: 'usda' }, verified: false }), 'USDA · online')
  assert.equal(foodSourceLabel({ kind: 'recipe' }), 'Saját recept')
  assert.equal(foodSourceLabel({ kind: 'manual' }), 'Saját étel')
})
