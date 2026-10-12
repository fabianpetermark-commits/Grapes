import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeSearchText, searchFoods } from '../src/food/food-search.js'

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

