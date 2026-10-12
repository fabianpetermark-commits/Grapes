import test from 'node:test'
import assert from 'node:assert/strict'

import { nutritionSuggestionPer100, parseNutritionLabelText } from '../src/food/food-label-ocr.js'

test('magyar 100 g-os címkén felismeri a kcal-t, makrókat és tizedesvesszőt', () => {
  const result = parseNutritionLabelText(`Tápérték 100 g\nEnergia 840 kJ / 200 kcal\nZsír 8,5 g\namelyből telített zsírsavak 2,1 g\nSzénhidrát 20 g\namelyből cukrok 3,2 g\nRost 4 g\nFehérje 10 g\nSó 0,75 g`)
  assert.deepEqual(result.basis, { type: 'per100', baseUnit: 'g', amount: 100 })
  assert.equal(result.nutrients.energyKcal, 200)
  assert.equal(result.nutrients.fat, 8.5)
  assert.equal(result.nutrients.saturatedFat, 2.1)
  assert.equal(result.nutrients.sugar, 3.2)
  assert.equal(result.nutrients.salt, 0.75)
})

test('kJ-ból kcal-t számol, ha kcal nincs a címkén', () => {
  const result = parseNutritionLabelText('per 100 ml\nEnergy 418.4 kJ\nProtein 3 g')
  assert.equal(result.nutrients.energyKcal, 100)
  assert.equal(result.basis.baseUnit, 'ml')
})

test('adagonkénti értéket csak megadott adagmennyiséggel vált 100 g-ra', () => {
  const result = parseNutritionLabelText('Egy adag 40 g\nEnergia 120 kcal\nFehérje 8 g\nSzénhidrát 10 g\nZsír 4 g')
  const converted = nutritionSuggestionPer100(result, { basisType: 'serving', baseUnit: 'g', servingAmount: 40 })
  assert.equal(converted.nutrients.energyKcal, 300)
  assert.equal(converted.nutrients.protein, 20)
  assert.throws(() => nutritionSuggestionPer100(result, { basisType: 'serving', servingAmount: null }), /adag/)
})

test('a nátriumot só-egyenértékre váltja', () => {
  const result = parseNutritionLabelText('100 g\nSodium 400 mg')
  assert.equal(result.nutrients.salt, 1)
})

test('a telített zsír sora nem írja felül az összes zsírt akkor sem, ha előbb szerepel', () => {
  const result = parseNutritionLabelText('100 g\nTelített zsír 2 g\nZsír 8 g')
  assert.equal(result.nutrients.saturatedFat, 2)
  assert.equal(result.nutrients.fat, 8)
})
