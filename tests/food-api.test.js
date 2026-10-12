import test from 'node:test'
import assert from 'node:assert/strict'

import { lookupOpenFoodFactsProduct } from '../src/food/food-api.js'

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
