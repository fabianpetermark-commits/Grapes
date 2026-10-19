import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const getIndex = token => {
  const index = html.indexOf(token)
  assert.ok(index >= 0, `Missing expected existing Food element: ${token}`)
  return index
}

test('Food Design 2.0 phase 1 keeps the existing navigation, screen order and five recipe tabs', () => {
  const overview = getIndex('<section data-food-overview>')
  const dailyDate = getIndex('class="food-datebar"')
  const calories = getIndex('class="daily-card"')
  const water = getIndex('data-water-open')
  const recipes = getIndex('data-food-recipes')
  const meals = getIndex('data-food-meals')
  const detail = getIndex('<section data-food-detail hidden>')
  const recipeList = getIndex('<section data-food-recipes-view hidden>')
  const recipeDetail = getIndex('<section data-food-recipe-detail hidden>')
  assert.ok(overview < dailyDate && dailyDate < calories && calories < water && water < recipes && recipes < meals)
  assert.ok(meals < detail && detail < recipeList && recipeList < recipeDetail)

  const tabKeys = [...html.matchAll(/data-food-recipe-tab="(basics|ingredient|list|image|import)"/g)].map(match => match[1])
  assert.deepEqual(tabKeys, ['basics', 'ingredient', 'list', 'image', 'import'])
  const navigation = [...html.matchAll(/data-nav="(home|projects|sync|more)"/g)].map(match => match[1])
  assert.deepEqual(navigation, ['home', 'projects', 'sync', 'more'])
})

test('Food Design 2.0 uses the audited Grapes palette and covers all existing Food views', () => {
  assert.equal(html.split('GRAPES FOOD DESIGN 2.0 – PHASE 1').length - 1, 1)
  for (const selector of [
    '[data-page="food"] .daily-card',
    '[data-page="food"] .energy-ring__track',
    '[data-page="food"] .energy-ring__progress',
    '[data-page="food"] .water-card',
    '[data-page="food"] .food-recipe--compact',
    '[data-page="food"] [data-food-meals]',
    '[data-page="food"] .food-recipe-detail-image',
    '[data-food-add-sheet] .food-search-filters',
    '[data-food-recipe-edit-sheet] .food-recipe-tab',
    '[data-food-stats-sheet] .food-stats-controls',
    '[data-food-targets-sheet] .food-target-field',
  ]) {
    assert.ok(html.includes(selector), `Missing visual treatment for ${selector}`)
  }
  const css = html.slice(html.indexOf('GRAPES FOOD DESIGN 2.0 – PHASE 1'), html.indexOf('</style>'))
  assert.match(css, /--food-visual-accent:\s*#3bdcf2/)
  assert.match(css, /--food-visual-stroke:\s*#243343/)
  assert.match(css, /\[data-energy-visible="false"\][\s\S]*?filter:\s*none/)
  assert.match(css, /@media\s*\(max-width:\s*375px\)/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

test('Food forms and protected integrations remain present in the underlying TEST template', () => {
  for (const selector of [
    'data-food-recipe-editor-save',
    'data-food-recipe-import-select',
    'data-food-recipe-image-select',
    'data-food-recipe-nutrients-repair',
    'data-food-search-results',
    'data-food-recipe-ingredient-add',
    'data-food-open-stats',
    'data-food-open-targets',
    'data-food-stats-range',
    'data-food-target-save',
    'data-food-share-send',
    'data-food-inbox-accept',
    'data-food-health-confirm',
    'data-yazio-input',
    'data-food-backup-input',
  ]) {
    assert.ok(html.includes(selector), `Protected Food behavior hook missing: ${selector}`)
  }
})
