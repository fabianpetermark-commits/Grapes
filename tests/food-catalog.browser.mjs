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
        code: '5991234567890', product_name_hu: 'Teszt keksz', categories_tags: ['hu:keksz'],
        product_quantity_unit: 'g', nutriments: { 'energy-kcal_100g': 490, proteins_100g: 6 },
      }],
    }),
  }))
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
  console.log('Food catalog browser: Open Food Facts selection, form review and reload succeeded')
} finally {
  await browser?.close()
  server.kill()
}
