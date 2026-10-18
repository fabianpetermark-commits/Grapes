import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInstructionText, plainInstructionsToHtml } from '../src/food/recipe-instructions.js'
import { normalizeRecipe } from '../src/food/food-data.js'

test('recipe instructions keep paragraph and numbered-step line breaks', () => {
  const value = '1. Összeállítás: Keverd össze.\r\n2. Keverés: Dolgozd össze.\n\n3. Sütés: 200 °C.'
  assert.equal(normalizeInstructionText(value),
    '1. Összeállítás: Keverd össze.\n2. Keverés: Dolgozd össze.\n\n3. Sütés: 200 °C.')
  const recipe = normalizeRecipe({
    id:'recipe-1',foodId:'food-1',ownerProfileId:'owner-1',name:'Puha kenyér',
    ingredients:[{foodId:'ingredient-1',amount:400,unit:'g'}],
    instructions:value,
  })
  assert.equal(recipe.instructions,normalizeInstructionText(value))
  assert.equal(recipe.instructionsHtml,'')
})

test('plain-text fallback preserves line structure without interpreting tags', () => {
  const html = plainInstructionsToHtml('1. Sütés: 200 °C\n\n2. Hűtés: <script>alert(1)</script>')
  assert.ok(html.includes('<div>1. Sütés: 200 °C</div><div><br></div>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.equal(html.includes('<script>'),false)
})
