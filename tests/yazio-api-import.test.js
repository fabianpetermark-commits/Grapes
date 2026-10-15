import test from 'node:test'
import assert from 'node:assert/strict'
import { readYazioApiBundle, yazioDateRange } from '../src/food/yazio-api-import.js'
import { prepareYazioImport, applyYazioBatch } from '../src/food/food-yazio-import.js'
import { normalizeFoodProject } from '../src/food/food-data.js'

const entry = { id: 'meal-1', product_id: 'egg-1', amount: 50, date: '2026-10-14 08:30:00', daytime: 'breakfast' }
const product = { name: 'Tojás', base_unit: 'g', nutrients: { 'energy.energy': 1.43, 'nutrient.protein': 0.126 } }
const options = { from: '2026-10-14', to: '2026-10-14' }
test('API grammra megadott tápértékeiből fogyasztott mennyiséget számol; újraimport nem dupláz', async () => {
  const bundle = await readYazioApiBundle({ ...options, request: async op => op === 'day' ? { products: [entry] } : product })
  const preview = prepareYazioImport(JSON.stringify(bundle), { profileId: 'p' })
  assert.equal(preview.counts.ready, 1)
  assert.equal(preview.records[0].entry.snapshot.nutrients.energyKcal, 71.5)
  assert.equal(preview.records[0].entry.snapshot.nutrients.protein, 6.3)
  assert.equal(preview.records[0].entry.snapshot.nutrients.fat, null)
  const saved = applyYazioBatch(normalizeFoodProject({ profile: { id: 'p' } }, 'p'), preview, [0]).project
  const repeated = prepareYazioImport(JSON.stringify(bundle), { profileId: 'p', existingEntries: saved.diaryEntries })
  assert.equal(repeated.counts.duplicate, 1)
})
test('az ismétlődő terméket egyszer kéri le és a kihagyott receptet jelzi', async () => {
  let products = 0
  const bundle = await readYazioApiBundle({ ...options, request: async op => {
    if (op === 'day') return { products: [entry, { ...entry, id: 'meal-2' }], recipe_portions: [{ id: 'recipe-1' }] }
    products++; return product
  } })
  assert.equal(products, 1); assert.equal(bundle.nutrition_log.length, 2)
  assert.match(bundle.warnings[0].message, /recipe_portions/)
  assert.equal(bundle.raw_days[0].consumed.recipe_portions[0].id, 'recipe-1')
})
test('érvénytelen időszak, válasz, mértékegység és hálózati hiba nem eredményez félkész importot', async () => {
  assert.throws(() => yazioDateRange('2026-02-30', '2026-03-01'))
  assert.throws(() => yazioDateRange('2026-01-01', '2026-02-01'))
  await assert.rejects(readYazioApiBundle({ ...options, request: async () => ({}) }), /formátuma/)
  await assert.rejects(readYazioApiBundle({ ...options, request: async op => op === 'day' ? { products: [entry] } : { ...product, base_unit: 'serving' } }), /mértékegység/)
  await assert.rejects(readYazioApiBundle({ ...options, request: async () => { throw new Error('HTTP 401') } }), /401/)
})
test('a megszakítás megállítja a lekérést', async () => {
  let requests = 0
  await assert.rejects(readYazioApiBundle({ ...options, checkCancelled: () => { throw new Error('cancelled') }, request: async () => { requests++ } }), /cancelled/)
  assert.equal(requests, 0)
})
