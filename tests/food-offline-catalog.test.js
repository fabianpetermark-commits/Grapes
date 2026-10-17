import test from 'node:test'
import assert from 'node:assert/strict'
import { searchOfflineBasicFoods } from '../src/food/food-offline-catalog.js'

test('az alap katalógus ékezet nélkül megtalálja a tojást', () => {
  const results = searchOfflineBasicFoods('tojas')
  assert.ok(results.some(food => food.name === 'Tojás, egész'))
  assert.ok(results.every(food => food.source.type === 'usda'))
})

test('a magyar szinonima megtalálja a burgonyát', () => {
  assert.equal(searchOfflineBasicFoods('krumpli')[0].name, 'Burgonya, főtt')
})

test('a rövid lekérdezés nem indít katalóguskeresést', () => {
  assert.deepEqual(searchOfflineBasicFoods('a'), [])
})
