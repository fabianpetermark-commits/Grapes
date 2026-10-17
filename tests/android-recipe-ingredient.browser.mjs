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
  // Exercise the realistic Android WebView fallback when BarcodeDetector is unavailable.
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }) })
  page.on('pageerror', error => console.error('Recipe browser page error:', error.message))
  await page.route('https://world.openfoodfacts.org/api/v2/product/5998888888888.json', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 1, product: { code: '5998888888888', product_name_hu: 'Teszt keksz',
        nutriments: { 'energy-kcal_100g': 410, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 16 } },
    }),
  }))
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
  await page.locator('[data-food-meals] .meal').first().waitFor()
  await page.locator('[data-food-open-recipes]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible', timeout: 10000 })
    .catch(async error => {
      const state = await page.evaluate(() => ({
        food: document.querySelector('[data-page="food"]')?.hidden,
        recipes: document.querySelector('[data-food-recipes-view]')?.hidden,
        title: document.querySelector('[data-food-recipe-editor-title]')?.textContent,
        sheet: document.querySelector('[data-food-recipe-edit-sheet]')?.className,
        status: document.querySelector('[data-food-recipe-editor-status]')?.textContent,
      }))
      console.error('Recipe editor did not open:', JSON.stringify(state))
      throw error
    })
  const alignment = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).closest('label').getBoundingClientRect()
    const a = rect('[data-food-recipe-yield-unit]')
    const b = rect('[data-food-recipe-unit-weight]')
    const c = rect('[data-food-recipe-nutrient-carbohydrate]')
    const d = rect('[data-food-recipe-nutrient-fat]')
    return { yieldTop: a.top, weightTop: b.top, yieldWidth: a.width, weightWidth: b.width,
      carbohydrateTop: c.top, fatTop: d.top, carbohydrateWidth: c.width, fatWidth: d.width }
  })
  assert.ok(Math.abs(alignment.yieldTop - alignment.weightTop) < 3,
    'Egységtömeg és hozam egysége mezők egy sorban legyenek: ' + JSON.stringify(alignment))
  assert.ok(Math.abs(alignment.carbohydrateTop - alignment.fatTop) < 3,
    'Szénhidrát és zsír mezők egy sorban legyenek: ' + JSON.stringify(alignment))
  assert.ok(Math.abs(alignment.carbohydrateWidth - alignment.fatWidth) < 5)
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
  // A user should not need to enter both yield and finished/unit weights.
  await page.locator('[data-food-recipe-weight-input]').fill('750')
  await page.locator('[data-food-recipe-yield-unit]').selectOption('slice')
  await page.locator('[data-food-recipe-unit-weight]').fill('25')
  assert.equal(await page.locator('[data-food-recipe-yield-input]').inputValue(), '')
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /30 szelet/)
  assert.doesNotMatch(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek:/)
  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Keresővel készített tesztrecept' })
    .waitFor({ state: 'visible' })

  const savedCard = await page.locator('[data-food-recipes] .food-recipe--compact').first().textContent()
  assert.match(savedCard, /kcal\/szelet/)
  assert.doesNotMatch(savedCard, /— kcal\/szelet/)
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-food-recipe-yield-input]').inputValue(), '30')
  await input.fill('voroshagyma')
  const savedOnion = dropdown.locator('option', { hasText: /Vöröshagyma/ }).first()
  await savedOnion.waitFor({ state: 'attached' })
  assert.ok((await savedOnion.getAttribute('value'))?.startsWith('food-'),
    'A recepthez hozzáadott USDA-étel legközelebb már mentett hozzávaló legyen.')
  // Saved ingredients must expose editable nutrients per 100 g without
  // rewriting the previously saved catalogue record.
  await dropdown.selectOption(await savedOnion.getAttribute('value'))
  const kcal = page.locator('[data-food-recipe-nutrient-energyKcal]')
  assert.ok((await kcal.inputValue()).length > 0, 'Saved USDA nutrients should pre-fill the editable field.')
  const originalKcal = await kcal.inputValue()
  await kcal.fill('135')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('dkg')
  await page.locator('[data-food-recipe-ingredient-amount]').fill('2')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /2 dkg/)
  await input.fill('vöröshagyma')
  await savedOnion.waitFor({ state: 'attached' })
  await dropdown.selectOption(await savedOnion.getAttribute('value'))
  assert.equal(await kcal.inputValue(), originalKcal,
    'Per-recipe nutrient overrides must not overwrite the saved USDA food.')

  // No search result is required when adding a new, manual ingredient.
  await input.fill('Kézi teszt hozzávaló 20261017')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('tbsp')
  await page.locator('[data-food-recipe-ingredient-amount]').fill('2')
  await page.locator('[data-food-recipe-conversion-label]:visible').waitFor()
  await page.locator('[data-food-recipe-conversion-amount]').fill('12')
  await kcal.fill('210')
  await page.locator('[data-food-recipe-nutrient-protein]').fill('')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Kézi teszt hozzávaló 20261017/)
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /2 evőkanál/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Összesen:/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek:.*Kézi teszt hozzávaló/s)
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Hiányzó adatok/)

  // Recipe scanner must stay inline without switching to full catalogue.
  const popup = page.waitForEvent('dialog')
  const clickScan = page.locator('[data-food-recipe-scan]').click()
  await (await popup).accept('5998888888888')
  await clickScan
  await dropdown.locator('option', { hasText: /Teszt keksz/ }).first().waitFor({ state: 'attached' })
  await page.waitForFunction(() => Boolean(document.querySelector('[data-food-recipe-ingredient-food]')?.value))
  assert.notEqual(await dropdown.inputValue(), '', 'Scanned product must be selected explicitly by the scanner.')
  assert.equal(await page.locator('[data-food-add-sheet].is-open').count(), 0,
    'Inline scanner must not open the full catalog.')
  assert.equal(await page.locator('[data-food-recipe-edit-sheet].is-open').count(), 1,
    'Recipe editor must remain open after barcode scan.')
  assert.equal(await page.locator('[data-food-recipe-open-catalog]').count(), 0,
    'The former full catalogue button must be removed.')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('kg')
  assert.equal(await page.locator('[data-food-recipe-conversion-label]').isVisible(), false,
    'Metric conversions should not ask for invented per-food sizes.')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Teszt keksz/)

  const warningDialog = page.waitForEvent('dialog')
  const saveWithUnknown = page.locator('[data-food-recipe-editor-save]').click()
  const dialog = await warningDialog
  assert.match(dialog.message(), /hiányzik tápérték/i)
  assert.match(dialog.message(), /Kézi teszt hozzávaló 20261017/)
  await dialog.accept()
  await saveWithUnknown
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Keresővel készített tesztrecept' }).waitFor()
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-ingredients]').getByText('Kézi teszt hozzávaló 20261017').waitFor()
  console.log('Recipe ingredient editor: search, editable nutrients, manual fallback, conversions and inline barcode OK')
} finally {
  await browser?.close()
  server.kill()
}
