import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4187/Grapes/design/android-mobile-preview.html'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium is required for Food mobile usability regression.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { cwd: root, stdio: ['ignore','pipe','pipe'] })
let stderr = ''
server.stderr.on('data', chunk => { stderr += String(chunk) })
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
    await new Promise(done => setTimeout(done, 100))
  }
  if (!ready) throw new Error('Food mobile test server did not start: ' + stderr.slice(-600))
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Stable test data: no live provider calls or changes to real accounts.
  await page.route('https://api.nal.usda.gov/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      foods: [{ fdcId: 8802, description: 'Onions, raw', dataType: 'SR Legacy', foodNutrients: [
        { nutrientId: 1008, unitName: 'KCAL', value: 40 },
        { nutrientId: 1003, unitName: 'G', value: 1.1 },
        { nutrientId: 1005, unitName: 'G', value: 9.34 },
        { nutrientId: 1004, unitName: 'G', value: 0.1 },
      ] }]
    }) })
  })
  await page.route(/openfoodfacts\.org/, async route => {
    await new Promise(done => setTimeout(done, 550))
    await route.abort()
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-page="home"]').waitFor({state:'visible',timeout:8000})
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-page="food"] [data-food-overview]').waitFor({state:'visible',timeout:8000})
  await page.locator('[data-food-meals] [data-meal="breakfast"]').click()
  await page.locator('[data-food-detail]').waitFor({state:'visible'})
  assert.equal(await page.locator('[data-food-detail-add]').count(), 0, 'No redundant large Add button')
  const fab = page.locator('[data-fab]')
  assert.equal(await fab.isVisible(), true, 'Floating Add button remains visible')
  assert.ok((await fab.boundingBox()).width >= 64, 'Floating add is easier to tap')
  await fab.click()
  await page.locator('[data-food-add-sheet].is-open').waitFor({state:'visible'})
  const input = page.locator('[data-food-search]')
  await input.fill('hagyma')
  await page.waitForTimeout(120)
  const results = await page.locator('[data-food-search-results]').textContent()
  assert.doesNotMatch(results, /Nincs találat/i, 'Do not claim there are no results while search is pending')
  await page.locator('[data-food-search-results]').getByText(/Vöröshagyma/).first().waitFor({state:'visible',timeout:10000})
  assert.equal(errors.length,0,'No browser JavaScript errors: '+errors.join('; '))
  console.log('PASS Food TEST search: one large FAB, pending status, Hungarian online USDA onion hit')
} finally {
  await browser?.close()
  server.kill()
}
