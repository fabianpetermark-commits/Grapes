import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4186/Grapes/design/android-mobile-preview.html'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium szükséges a Grapes menünavigáció tesztjéhez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4186', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
server.stdout.on('data', chunk => { serverOutput += String(chunk).slice(-1000) })
server.stderr.on('data', chunk => { serverOutput += String(chunk).slice(-1000) })
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
    await new Promise(done => setTimeout(done, 100))
  }
  if (!ready) throw new Error('Nem indult a menünavigáció tesztszervere: ' + serverOutput.slice(-1300))
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  assert.deepEqual(await page.locator('[data-menu-group]').evaluateAll(nodes => nodes.map(x => x.dataset.menuGroup)),
    ['home', 'health', 'utility', 'finance'])
  assert.equal(await page.locator('[data-page="home"] .hub-card__icon svg').count(), 4)
  assert.match(await page.locator('[data-menu-group="health"]').textContent(), /Food.*Receptek.*Statisztika/)

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const { viewport, documentWidth } = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }))
    assert.ok(documentWidth <= viewport, `Kilóg a főmenü ${width}px szélességen.`)
  }
  await page.setViewportSize({ width: 390, height: 844 })

  await page.locator('[data-menu-group="home"]').click()
  assert.equal(await page.locator('[data-page="hub-home"]').isVisible(), true)
  await page.locator('[data-page="hub-home"] [data-menu-destination="shopping"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-household-shopping]').isVisible(), true, 'Home lista a meglévő Home tárolót használja.')
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-home"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-home"] [data-menu-destination="inventory"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-household-inventory]').isVisible(), true)
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-home"] [data-menu-back]').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="recipes"]').click()
  await page.locator('[data-page="food"] [data-food-recipes-view]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="food"] [data-food-overview]').isVisible(), false)
  await page.locator('[data-food-recipes-back]').click()
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.evaluate(() => {
    window.__foodFlashFrames = 0
    window.__watchStats = true
    const observe = () => {
      const food = document.querySelector('[data-page="food"]')
      const sheet = document.querySelector('[data-food-stats-sheet]')
      if (window.__watchStats && food && !food.hidden && !sheet?.classList.contains('is-open')) window.__foodFlashFrames++
      if (window.__watchStats) requestAnimationFrame(observe)
    }
    requestAnimationFrame(observe)
  })
  await page.locator('[data-page="hub-health"] [data-menu-destination="stats"]').click()
  await page.locator('[data-food-stats-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => {
    window.__watchStats = false
    return window.__foodFlashFrames
  }), 0, 'Health Statisztika: Food overview nem villanhat fel egyetlen képkockára sem.')
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-page="food"] [data-food-overview]').waitFor({ state: 'visible' })
  // Synthetic goal edit, immediate Android Back, then a WebView reload.
  await page.evaluate(() => document.querySelector('[data-food-menu="targets"]').click())
  await page.locator('[data-food-targets-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-target-energy]').fill('2187')
  await page.locator('[data-food-target-save]').click()
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-food-local-save-status][data-state="saved"]').waitFor({ state: 'attached' })
  const savedGoal = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('grapes-projects', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('projects', 'readonly')
      const request = tx.objectStore('projects').get('food-tracker-local-food-profile')
      request.onsuccess = () => { db.close(); resolve(request.result?.data?.targets?.at(-1)?.energyKcal) }
      request.onerror = () => reject(request.error)
    }
  }))
  assert.equal(savedGoal, 2187)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-food-local-save-status]').filter({ hasText: 'Helyben mentve' }).waitFor()
  assert.match(await page.locator('[data-food-energy-target]').textContent(), /2.?187/)
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-menu-back]').click()

  await page.locator('[data-menu-group="utility"]').click()
  await page.locator('[data-page="hub-utility"] [data-menu-destination="ebook"]').click()
  await page.locator('[data-page="ebook"]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-utility"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-utility"] [data-menu-back]').click()
  await page.locator('[data-menu-group="finance"]').click()
  assert.equal(await page.locator('[data-page="hub-finance"] [data-menu-destination="finance"]').count(), 1)
  await page.locator('[data-page="hub-finance"] [data-menu-back]').click()

  await page.locator('.bottom-nav [data-nav="projects"]').click()
  await page.locator('[data-page="projects"]').waitFor({ state: 'visible' })
  await page.locator('.bottom-nav [data-nav="home"]').click()
  assert.equal(await page.locator('[data-page="home"]').isVisible(), true)
  assert.deepEqual(pageErrors, [])
  console.log('Grapes 2x2 hubs: Home lista/készlet, Health Food/Receptek/Statisztika, Utility E-book, Finance, 320–412 px, back és Projektek: OK')
} finally {
  await browser?.close()
  server.kill()
}

