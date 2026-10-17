import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const endpoint = 'http://127.0.0.1:4193'
const binaries = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
const executablePath = binaries.find(existsSync)
if (!executablePath) throw new Error('Chromium/Chrome is required for the Food catalog browser test.')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4193', '--strictPort'], {
  cwd: process.cwd(), env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'food-test-client' }, stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(endpoint)).ok) break } catch {}
    if (i === 99) throw new Error('The test Vite server did not start.')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => {
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({
      clientId: 'food-test-client', accessToken: 'test-token', expiresAt: Date.now() + 3600000,
      scopes: 'https://www.googleapis.com/auth/drive.file',
      account: { id: 'catalog-test-user', name: 'Catalog Test', email: 'catalog@example.com' },
    }))
  })
  await context.route('https://www.googleapis.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }))
  await context.route('https://search.openfoodfacts.org/search**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      count: 1, page: 1, hits: [{
        code: '5991234567890', product_name_hu: 'Teszt keksz', categories_tags: ['hu:keksz'], countries_tags: ['en:hungary'],
        product_quantity_unit: 'g', nutriments: { 'energy-kcal_100g': 490, proteins_100g: 6 },
      }],
    }),
  }))
  const nutrients = energy => [
    { nutrientId: 1008, unitName: 'KCAL', value: energy },
    { nutrientId: 1003, unitName: 'G', value: 7 },
    { nutrientId: 1005, unitName: 'G', value: 79 },
    { nutrientId: 1004, unitName: 'G', value: 1 },
  ]
  const riceDescriptions = [
    ['Rice, white, long grain, unenriched, raw', 359],
    ['Rice, white, long-grain, regular, raw, enriched', 365],
    ['Rice, brown, long grain, unenriched, raw', 367],
    ['Rice, white, medium-grain, raw, enriched', 360],
    ['Rice, brown, medium-grain, raw', 362],
    ['Rice, white, short-grain, raw', 358],
    ['Rice, brown, short-grain, raw', 364],
    ['Rice, white, long-grain, parboiled, enriched, cooked', 123],
    ['Rice, brown, long-grain, cooked', 112],
    ['Rice, white, medium-grain, cooked', 130],
  ]
  await context.route('https://api.nal.usda.gov/fdc/v1/foods/search**', async route => {
    const query = route.request().postDataJSON()?.query || ''
    const foods = /^Rice/i.test(query)
      ? riceDescriptions.map(([description, energy], index) => ({
          fdcId: 8000 + index, description, dataType: index % 2 ? 'Foundation' : 'SR Legacy',
          foodNutrients: nutrients(energy),
        }))
      : []
    if (foods.length) foods.push({ ...foods[0] })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ foods }) })
  })
  const page = await context.newPage()
  await page.goto(endpoint + '/?module=food')
  await page.locator('#food-save-status').filter({ hasText: /Helyi napló|Drive-ról betöltve/ }).waitFor()
  await page.locator('#food-entry-search').fill('keksz')
  await page.locator('#food-entry-catalog-results .food__off-result').first().waitFor()
  assert.equal(await page.locator('#food-entry-catalog-results .food__off-result').count(), 1)
  await page.locator('#food-entry-catalog-results .food__off-result', { hasText: 'Teszt keksz' })
    .locator('[data-off-result]').click()
  await page.locator('#food-item-name').waitFor()
  assert.equal(await page.locator('#food-item-name').inputValue(), 'Teszt keksz')
  await page.locator('#food-item-form button[type="submit"]').click()
  assert.equal(await page.locator('#food-entry-food option:checked').textContent(), 'Teszt keksz')
  await page.locator('#food-entry-amount').fill('75')
  await page.locator('#food-entry-form button[type="submit"]').click()
  assert.equal(await page.locator('.food__entry', { hasText: 'Teszt keksz' }).count(), 1)
  await page.locator('#food-save-status').filter({ hasText: /Helyben mentve/ }).waitFor()
  await page.reload()
  await page.locator('#food-save-status').filter({ hasText: /Helyi napló|Drive-ról betöltve/ }).waitFor()
  assert.equal(await page.locator('.food__entry', { hasText: 'Teszt keksz' }).count(), 1)
  await page.locator('#food-entry-search').fill('vöröshagyma')
  const usdaResult = page.locator('#food-entry-catalog-results .food__off-result', { hasText: 'Vöröshagyma, nyers' })
  await usdaResult.waitFor()
  assert.match(await usdaResult.textContent(), /USDA/)
  await usdaResult.locator('[data-off-result]').click()
  assert.equal(await page.locator('#food-item-name').inputValue(), 'Vöröshagyma, nyers')
  assert.equal(await page.locator('#food-item-energyKcal').inputValue(), '40')
  await page.locator('#food-item-form button[type="submit"]').click()
  assert.equal(await page.locator('#food-entry-food option:checked').textContent(), 'Vöröshagyma, nyers')
  await page.locator('#food-entry-amount').fill('100')
  await page.locator('#food-entry-form button[type="submit"]').click()
  assert.equal(await page.locator('.food__entry', { hasText: 'Vöröshagyma, nyers' }).count(), 1)
  await page.locator('#food-save-status').filter({ hasText: /Helyben mentve/ }).waitFor()
  await page.reload()
  await page.locator('#food-save-status').filter({ hasText: /Helyi napló|Drive-ról betöltve/ }).waitFor()
  assert.equal(await page.locator('.food__entry', { hasText: 'Vöröshagyma, nyers' }).count(), 1)
  await page.locator('#food-entry-search').fill('rizs')
  const riceResults = page.locator('#food-entry-catalog-results .food__off-result')
  await page.locator('#food-entry-catalog-results .food__catalog-more').waitFor()
  assert.equal(await riceResults.count(), 8, 'Alapértelmezetten legfeljebb nyolc külső találat látszódjon.')
  assert.match(await riceResults.first().textContent(), /rizs.*nyers/i)
  assert.match(await riceResults.first().textContent(), /kcal \/ 100 g.*USDA · online/i)
  assert.ok(await riceResults.first().locator('.food__usda-original[lang="en"]').textContent())
  await page.locator('#food-entry-catalog-results .food__catalog-more').click()
  assert.equal(await riceResults.count(), 11, 'A tíz egyedi USDA FDC ID és az OFF találat legyen elérhető.')
  assert.equal(await page.locator('#food-entry-catalog-results').evaluate(element => getComputedStyle(element).overflowY), 'auto')
  console.log('Food catalog browser: OFF + offline USDA + ranked, collapsed online USDA results succeeded')
} finally {
  await browser?.close()
  server.kill()
}
