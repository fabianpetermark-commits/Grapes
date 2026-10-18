import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRecipeImport, parseRecipeIngredientLine } from '../src/food/recipe-import.js'
import { normalizeRecipeImageUrl } from '../src/food/recipe-image.js'
import { normalizeRecipe, normalizeFoodItem } from '../src/food/food-data.js'

test('magyar receptszöveg: mértékegységek, instrukciók és bizonytalan darabok', () => {
  const draft = parseRecipeImport('Puha kenyér\nHozzávalók:\n400 g búzafinomliszt\n5 g cukor\n5 g só\n350 ml víz\n2 db tojás\nElkészítés:\nKeverd össze.\nSüsd meg.')
  assert.equal(draft.name, 'Puha kenyér')
  assert.deepEqual(draft.ingredients.slice(0,4).map(x=>[x.amount,x.unit,x.name]), [
    [400,'g','búzafinomliszt'],[5,'g','cukor'],[5,'g','só'],[350,'ml','víz'],
  ])
  assert.equal(draft.ingredients[4].unit,null)
  assert.match(draft.ingredients[4].reason,/darab/)
  assert.equal(draft.instructions,'Keverd össze.\nSüsd meg.')
  assert.match(draft.warnings.join(' '),/ellenőrizd/)
})
test('JSON-LD Recipe embedded in HTML from a recipe site', () => {
  const html='<html><head><script type="application/ld+json">'+JSON.stringify({
    '@context':'https://schema.org','@type':'Recipe',name:'Egyszerű krém',
    recipeIngredient:['200 g túró','50 ml víz'],
    recipeInstructions:[{'@type':'HowToStep',text:'Keverd össze.'}],
    recipeYield:'4 adag',
    image:'https://example.org/recipe.webp',
  })+'</script></head><body>Étel</body></html>'
  const draft=parseRecipeImport(html)
  assert.equal(draft.format,'schema.org/Recipe')
  assert.equal(draft.name,'Egyszerű krém')
  assert.equal(draft.ingredients.length,2)
  assert.equal(draft.yieldCount,4)
  assert.equal(draft.instructions,'Keverd össze.')
  assert.equal(draft.imageUrl,'https://example.org/recipe.webp')
})
test('JSON recipe values are input only: script tags cannot execute as HTML', () => {
  const draft=parseRecipeImport(JSON.stringify({name:'Recept',ingredients:[{name:'cukor',amount:8,unit:'g'}],instructions:'Szöveg'}))
  assert.equal(draft.ingredients[0].name,'cukor')
  assert.equal(draft.ingredients[0].amount,8)
  assert.throws(()=>parseRecipeImport('{"broken":',{}),/JSON-formátuma/)
})
test('CSV with explicit ingredient, amount and unit headers', () => {
  const d=parseRecipeImport('hozzávaló;mennyiség;egység\ncukor;8;g\nsó;1;g',{fileName:'export.csv'})
  assert.deepEqual(d.ingredients.map(x=>[x.amount,x.unit,x.name]),[[8,'g','cukor'],[1,'g','só']])
})
test('unknown measures and fractions are explicit rather than guessed', () => {
  assert.equal(parseRecipeIngredientLine('1/2 teáskanál só').amount,.5)
  assert.equal(parseRecipeIngredientLine('2 ek méz').unit,'tbsp')
  assert.equal(parseRecipeIngredientLine('cukor 30 g').name,'cukor')
  assert.equal(parseRecipeIngredientLine('2 db tojás').unit,null)
  assert.equal(parseRecipeIngredientLine('egy bögre cukor').unit,null)
  assert.throws(()=>parseRecipeImport('Recept\nFőzd meg.'),/Nem található/)
})
test('local images only from strict raster data and bounded size; legacy https persists', () => {
  const tiny='data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  assert.equal(normalizeRecipeImageUrl(tiny),tiny)
  assert.equal(normalizeRecipeImageUrl('data:image/svg+xml;base64,PHN2Zz4='),'')
  assert.equal(normalizeRecipeImageUrl('javascript:alert(1)'),'')
  assert.equal(normalizeRecipeImageUrl('data:image/jpeg;base64,'+'A'.repeat(180001)),'')
  const src={id:'recipe-1',ownerProfileId:'local-food-profile',name:'Kép teszt',
    ingredients:[{id:'i1',foodId:'f1',amount:100,unit:'g'}],imageUrl:tiny}
  const recipe=normalizeRecipe(src)
  assert.equal(recipe.imageUrl,tiny)
  const food=normalizeFoodItem({id:'f1',kind:'recipe',name:'Kép teszt',imageUrl:recipe.imageUrl})
  assert.equal(food.imageUrl,tiny)
  assert.equal(normalizeRecipeImageUrl('https://example.com/food.jpg'),'https://example.com/food.jpg')
})
test('limits and malformed sources do not silently overwrite any saved record', () => {
  assert.throws(()=>parseRecipeImport('a'.repeat(120001)),/120 000/)
  assert.throws(()=>parseRecipeImport(''),/Adj meg/)
  const draft=parseRecipeImport('Húsleves\nHozzávalók:\n1 kg hús')
  assert.equal(draft.ingredients[0].amount,1)
  assert.equal(draft.ingredients[0].unit,'kg')
})
