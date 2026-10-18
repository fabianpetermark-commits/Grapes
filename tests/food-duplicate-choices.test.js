import assert from 'node:assert/strict'
import test from 'node:test'
import { groupFoodSearchResults, manualFoodFingerprint, reusableManualFood } from '../src/food/food-duplicate-choices.js'
import { normalizeFoodItem } from '../src/food/food-data.js'

const food = (id, name, nutrients, other = {}) => normalizeFoodItem({
  id, name, kind: 'manual', baseUnit: 'g', category: 'Saját hozzávaló',
  source: { type: 'manual' }, nutrients, ...other,
})

test('azonos kézi étel ugyanazzal a tápértékkel és névvel újrahasznosítható', () => {
  const original = food('old-sugar', 'Cukor', { energyKcal: 387, protein: 0, carbohydrate: 99.98, fat: 0 })
  const again = food('new-sugar', 'cukor', { energyKcal: 387, protein: 0, carbohydrate: 99.98, fat: 0 })
  assert.equal(manualFoodFingerprint(original), manualFoodFingerprint(again))
  assert.equal(reusableManualFood([original], again)?.id, original.id)
})

test('nem vonjuk össze a régi hiányos és a teljes adatokkal rendelkező cukrot', () => {
  const unknown = food('sugar-unknown', 'Cukor', {})
  const known = food('sugar-good', 'Cukor', { energyKcal: 387, protein: 0, carbohydrate: 99.98, fat: 0 })
  assert.equal(reusableManualFood([unknown], known), null)
  const grouped = groupFoodSearchResults([unknown, known])
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].food.id, 'sugar-good', 'A teljesebb tápérték legyen az elsődleges.')
  assert.deepEqual(grouped[0].variants.map(item => item.id), ['sugar-unknown'],
    'A régi hiányos rekord továbbra is választható.')
  assert.equal(unknown.nutrients.energyKcal, null, 'A meglévő ételt nem módosítjuk.')
})

test('só duplikátumok csoportosítása nem törli a kedvencekhez vagy naplóhoz tartozó ID-kat', () => {
  const oldA = food('salt-1', 'Só', {})
  const oldB = food('salt-2', 'SÓ', {})
  const newOne = food('salt-3', 'Só', { energyKcal: 0, protein: 0, carbohydrate: 0, fat: 0 })
  const grouped = groupFoodSearchResults([oldA, oldB, newOne])
  assert.equal(grouped.length, 1)
  assert.deepEqual([grouped[0].food.id, ...grouped[0].variants.map(item => item.id)].sort(),
    ['salt-1', 'salt-2', 'salt-3'])
  assert.equal(grouped[0].food.id, 'salt-3', 'A tényleges nulla nem ismeretlen.')
})

test('eltérő adagolás, mértékegység, recept és márkás termék nem olvasztható össze', () => {
  const salt = food('salt-base', 'Só', { energyKcal: 0, protein: 0, carbohydrate: 0, fat: 0 })
  const differentUnit = food('salt-liquid', 'Só', salt.nutrients, { baseUnit: 'ml' })
  const differentConversion = food('salt-pinch', 'Só', salt.nutrients, {
    servings: [{ id: 'pinch-1', name: 'Csipet', unit: 'pinch', grams: 0.35 }],
  })
  const differentCategory = food('salt-special', 'Só', salt.nutrients, { category: 'Speciális' })
  const branded = food('salt-branded', 'Só', salt.nutrients, {
    kind: 'product', barcode: '5991234567890', source: { type: 'openfoodfacts', id: '5991234567890' },
  })
  const recipe = food('salt-recipe', 'Só', salt.nutrients, { kind: 'recipe' })
  assert.equal(reusableManualFood([salt], differentUnit), null)
  assert.equal(reusableManualFood([salt], differentConversion), null)
  assert.equal(reusableManualFood([salt], differentCategory), null)
  assert.equal(reusableManualFood([salt], branded), null)
  assert.equal(manualFoodFingerprint(recipe), null)
  assert.equal(groupFoodSearchResults([salt, differentUnit, differentConversion, branded, recipe]).length, 4)
})

test('a sorrendfüggetlen adagkonverzió nem hoz létre felesleges új példányt', () => {
  const a = food('salt-a', 'Só', { energyKcal: 0, protein: 0, carbohydrate: 0, fat: 0 }, {
    servings: [{ id: 'p1', name: 'Csipet', unit: 'pinch', grams: 0.4 }, { id: 's1', name: 'Kanál', unit: 'tsp', grams: 5 }],
  })
  const b = food('salt-b', 'Só', { energyKcal: 0, protein: 0, carbohydrate: 0, fat: 0 }, {
    servings: [{ id: 's9', name: 'Kanál', unit: 'tsp', grams: 5 }, { id: 'p9', name: 'Csipet', unit: 'pinch', grams: 0.4 }],
  })
  assert.equal(reusableManualFood([a], b)?.id, a.id)
})
