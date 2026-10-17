import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previewUrl = 'http://127.0.0.1:4198/Grapes/design/android-mobile-preview.html'
const chrome = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('A recipe browser testhez Chromium szükséges.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host',
  '127.0.0.1', '--port', '4198', '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(previewUrl)).ok) break } catch {}
    if (attempt === 99) throw new Error('A Food recept tesztszervere nem indult el.')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.route('https://api.nal.usda.gov/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"foods":[]}',
  }))
  await page.route('https://search.openfoodfacts.org/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      count: 1, page: 1, hits: [{
        code: '5998888888888', product_name_hu: 'Teszt keksz',
        categories_tags: ['hu:keksz'], countries_tags: ['en:hungary'],
        product_quantity_unit: 'g',
        nutriments: { 'energy-kcal_100g': 410, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 16 },
      }],
    }),
  }))

  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click()
  await page.locator('[data-module="food"]').last().click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  await page.locator('[data-food-open-recipes]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-recipe-name-input]').fill('Keresővel készített tesztrecept')
  const input = page.locator('[data-food-recipe-ingredient-search]')
  const dropdown = page.locator('[data-food-recipe-ingredient-food]')
  assert.equal(await dropdown.inputValue(), '', 'Keresés nélkül ne válasszunk hozzávalót.')

  await input.fill('vöröshagyma')
  const onion = dropdown.locator('option', { hasText: /Vöröshagyma/ }).first()
  await onion.waitFor({ state: 'attached' })
  const onionValue = await onion.getAttribute('value')
  assert.ok(onionValue?.startsWith('catalog:'), 'Az offline USDA-találat közvetlenül legyen választható.')
  assert.equal(await dropdown.inputValue(), '', 'Gépeléskor ne válasszuk ki automatikusan az első találatot.')
  await dropdown.selectOption(onionValue)
  assert.equal(await page.locator('[data-food-recipe-ingredient-unit]').inputValue(), 'g')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Vöröshagyma/)
  assert.equal(await input.inputValue(), '', 'Hozzáadás után ürüljön a keresőmező.')

  await input.fill('Teszt keksz')
  const cookie = dropdown.locator('option', { hasText: /Teszt keksz/ }).first()
  await cookie.waitFor({ state: 'attached', timeout: 18000 })
  assert.equal(await dropdown.inputValue(), '', 'Online találat sem választható ki automatikusan.')
  await dropdown.selectOption(await cookie.getAttribute('value'))
  await page.locator('[data-food-recipe-ingredient-amount]').fill('45')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Teszt keksz/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Összesen:/)
  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Keresővel készített tesztrecept' })
    .waitFor({ state: 'visible' })

  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible' })
  await input.fill('voroshagyma')
  const savedOnion = dropdown.locator('option', { hasText: /Vöröshagyma/ }).first()
  await savedOnion.waitFor({ state: 'attached' })
  assert.ok((await savedOnion.getAttribute('value'))?.startsWith('food-'),
    'A recepthez hozzáadott USDA-étel legközelebb már mentett hozzávaló legyen.')
  console.log('Recipe ingredients: Hungarian search -> USDA/OFF dropdown -> explicit selection -> recipe save OK')
} finally {
  await browser?.close()
  server.kill()
}
