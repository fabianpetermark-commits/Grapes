import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFoodItem, nutrientsForAmount, normalizeRecipe, calculateRecipeFood, resolveAmountInBase } from '../src/food/food-data.js'
import {
  RECIPE_UNITS, manualRecipeBaseUnit, prepareRecipeIngredientFood,
  recipeUnitNeedsConversion, recipeUnitOptions, recipeNutrientInputs,
} from '../src/food/recipe-ingredient-draft.js'

const now = '2026-10-17T12:00:00.000Z'
let seq = 0
const createId = () => 'ingredient-test-' + ++seq
const sample = (name = 'Búzafinomliszt') => normalizeFoodItem({
  id: 'known-flour', name, kind: 'product', baseUnit: 'g',
  source: { type: 'usda', id: 'flour' },
  nutrients: { energyKcal: 350, protein: 11, carbohydrate: 73, fat: 1.2 },
  createdAt: now, updatedAt: now,
})

test('metric units convert exactly without changing shared food data', () => {
  const flour = sample()
  assert.equal(resolveAmountInBase(flour, 2, 'kg'), 2000)
  assert.equal(resolveAmountInBase(flour, 35, 'dkg'), 350)
  const water = normalizeFoodItem({ id: 'water', name: 'Víz', baseUnit: 'ml', nutrients: { energyKcal: 0 }, createdAt: now, updatedAt: now })
  assert.equal(resolveAmountInBase(water, 1.5, 'l'), 1500)
  assert.equal(resolveAmountInBase(water, 2, 'dl'), 200)
  assert.equal(manualRecipeBaseUnit('dl'), 'ml')
  assert.equal(manualRecipeBaseUnit('kg'), 'g')
  assert.equal(recipeUnitNeedsConversion(flour, 'tbsp'), true)
  assert.equal(recipeUnitNeedsConversion(flour, 'ml'), true)
  assert.equal(recipeUnitNeedsConversion(water, 'kg'), true)
  assert.equal(recipeUnitNeedsConversion(water, 'tsp'), true)
  assert.equal(recipeUnitOptions(flour).length >= 9, true)
  assert.deepEqual(RECIPE_UNITS.map(([unit]) => unit), ['g','dkg','kg','ml','dl','l','tsp','tbsp','pinch'])
})

test('a missing catalog result may become manual ingredient with genuinely unknown nutrients', () => {
  const result = prepareRecipeIngredientFood({ name: 'Házi fűszerkeverék', unit: 'dkg', nutrients: {}, createId })
  assert.equal(result.food.name, 'Házi fűszerkeverék')
  assert.equal(result.food.baseUnit, 'g')
  assert.equal(result.food.nutrients.energyKcal, null)
  assert.equal(result.food.nutrients.protein, null)
  assert.equal(nutrientsForAmount(result.food, 2.5, 'dkg').baseAmount, 25)
  const inputs = recipeNutrientInputs(result.food)
  assert.equal(inputs.energyKcal, '')
  assert.equal(inputs.fat, '')
})

test('a manual liquid ingredient accepts dl and l with editable per-100ml nutrients', () => {
  const result = prepareRecipeIngredientFood({name:'Házi szörp', unit:'dl', nutrients:{energyKcal:'210',carbohydrate:'52'},createId})
  assert.equal(result.food.baseUnit, 'ml')
  assert.equal(result.food.nutrients.protein, null)
  assert.equal(nutrientsForAmount(result.food, 2, 'dl').nutrients.energyKcal, 420)
})

test('spoon, pinch and mass-volume crossover need a per-food conversion instead of fake defaults', () => {
  assert.throws(()=>prepareRecipeIngredientFood({chosen:sample(),unit:'tbsp',nutrients:recipeNutrientInputs(sample()),createId}),/hány g/)
  const flour = sample()
  const made = prepareRecipeIngredientFood({
    chosen:flour, unit:'tbsp', conversionAmount:'12', nutrients:recipeNutrientInputs(flour),createId,
  })
  assert.notEqual(made.food.id, flour.id)
  assert.equal(made.food.barcode, '')
  assert.equal(resolveAmountInBase(made.food, 2, 'tbsp', made.servingId), 24)
  assert.equal(flour.servings.length, 0, 'Original catalog/custom foods must not be mutated')
  const pinch = prepareRecipeIngredientFood({name:'Só',unit:'pinch',conversionAmount:'0.35',nutrients:{},createId})
  assert.ok(Math.abs(resolveAmountInBase(pinch.food, 3, 'pinch',pinch.servingId) - 1.05) < 1e-9)
})

test('edited nutrients are private to the recipe ingredient and recipe calculation uses them', () => {
  const original = sample()
  const food = prepareRecipeIngredientFood({chosen:original,unit:'kg',nutrients:{
    energyKcal:'310',protein:'10',carbohydrate:'64',fat:'0.9',
  },createId}).food
  assert.notEqual(food.id, original.id)
  assert.equal(original.nutrients.energyKcal, 350)
  assert.equal(food.nutrients.energyKcal, 310)
  assert.equal(nutrientsForAmount(food,0.1,'kg').nutrients.energyKcal,310)
  const recipe = normalizeRecipe({
    id:'r-1',foodId:'rf-1',ownerProfileId:'local-food-profile',name:'Tészta',
    ingredients:[{id:'i-1',foodId:food.id,amount:0.1,unit:'kg'}],createdAt:now,updatedAt:now,
  })
  const totals = calculateRecipeFood(recipe,[original,food])
  assert.equal(totals.totalNutrients.energyKcal,310)
})

test('blank means unknown whereas explicit 0 is valid; reject negative nutrients', () => {
  const food = prepareRecipeIngredientFood({name:'Citromhéj',unit:'g',nutrients:{energyKcal:'',protein:'0',carbohydrate:'',fat:''},createId}).food
  assert.equal(food.nutrients.energyKcal,null)
  assert.equal(food.nutrients.protein,0)
  assert.throws(()=>prepareRecipeIngredientFood({name:'Hibás',unit:'g',nutrients:{energyKcal:'-1'},createId}),/negatív/)
})
