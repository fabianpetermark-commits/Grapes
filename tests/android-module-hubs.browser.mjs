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
  assert.equal(await page.locator('[data-page="home"] .hub-card__icon svg').count(), 5)
  // Approved module capsule is icon-only; the existing Health hub must
  // still expose its live Food, Recipes and Stats destinations.
  assert.equal(await page.locator('[data-main-rail] [data-menu-group="health"]').getAttribute('aria-label'),'Health')
  assert.match(await page.locator('[data-page="home"] [data-main-module-link="health"]').textContent(),/Food.*Receptek.*Statisztika/)
  assert.equal(await page.locator('.bottom-nav, .nav-item').count(), 0, 'Nincs párhuzamos alsó navigáció.')
  assert.equal(await page.locator('.appbar [data-nav="home"]').count(), 1)
  assert.equal(await page.locator('.appbar [data-nav="more"] svg').count(), 1, 'A jobb felső beállítások ikon legyen SVG fogaskerék.')

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const { viewport, documentWidth } = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }))
    assert.ok(documentWidth <= viewport, `Kilóg a főmenü ${width}px szélességen.`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'grapes-menu-main-preview.png' })

  await page.locator('[data-menu-group="home"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="hub-home"]').isVisible(), false, 'Approved Home skips the legacy 2-card hub')
  assert.equal(await page.locator('[data-household-shopping]').isVisible(), true, 'Shopping widget immediately visible')
  assert.equal(await page.locator('[data-household-inventory]').isVisible(), true, 'Inventory widget immediately visible')
  assert.equal(await page.locator('[data-household-suggestions]').isVisible(), true, 'Evidence-only suggestions widget immediately visible')
  assert.equal(await page.locator('[data-household-tabs]').count(), 0, 'No inventory/shopping tab switch')
  assert.equal(await page.locator('[data-household-share]').first().isDisabled(), true, 'No fake family sync before Supabase')
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('[data-menu-group="health"]').click()
  assert.equal(await page.locator('[data-page="hub-health"] .health-panel--food').isVisible(), true)
  assert.equal(await page.locator('[data-page="hub-health"] [data-health-stats]').isVisible(), true)
  assert.equal(await page.locator('[data-page="hub-health"] [data-health-meal]').count(), 4)
  assert.equal(await page.locator('[data-page="hub-health"] [data-health-quick]').count(), 4)
  assert.equal(await page.locator('.statusbar, .phone .statusbar').count(), 0, 'Nincs hamis óra/akku sáv.')
  await page.screenshot({ path: 'grapes-menu-health-preview.png' })
  await page.locator('[data-page="hub-health"] [data-health-recipe-open]').click()
  await page.locator('[data-page="food"] [data-food-recipes-view]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="food"] [data-food-overview]').isVisible(), false)
  await page.locator('[data-food-recipes-back]').click()
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-health-stats]').click()
  await page.locator('[data-food-stats-sheet].is-open').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="health-settings"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-health-section]').count(), 2,
    'The approved Health v1.2 has exactly two settings groups')
  assert.deepEqual(await page.locator('[data-health-section] strong').allTextContents(),
    ['Napi célok','Adatkapcsolatok'])
  await page.locator('[data-health-section="integrations"]').click()
  assert.match(await page.locator('[data-health-settings-content]').textContent(), /Health Connect.*Samsung Health.*YAZIO/)
  assert.equal(await page.locator('[data-health-command="water-backup"]').count(), 1,
    'Water backup remains reachable inside Data connections')
  assert.equal(await page.locator('[data-health-command="food-backup"]').count(), 1,
    'Food backup remains reachable inside Data connections')
  await page.locator('.appbar__home').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  await page.locator('[data-main-nav="health"]').click()
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-health-food-open]').click()
  await page.locator('[data-page="food"] [data-food-overview]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('.appbar__home').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('[data-menu-group="utility"]').click()
  await page.locator('[data-page="hub-utility"] [data-menu-destination="ebook"]').click()
  await page.locator('[data-page="ebook"]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-utility"]').waitFor({ state: 'visible' })
  await page.locator('.appbar__home').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  await page.locator('[data-menu-group="finance"]').click()
  await page.waitForURL(/module=finance/)
  await page.locator('#finance-app').waitFor({ state: 'visible' })
  assert.ok(await page.locator('[data-finance-tab]').count() >= 5, 'Finance icon must open the real five-tab journal, not a blank page.')
  await page.goBack()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="more"]').waitFor({ state: 'visible' })
  await page.screenshot({ path: 'grapes-menu-settings-preview.png' })
  await page.locator('[data-page="more"] [data-nav="projects"]').click()
  await page.locator('[data-page="projects"]').waitFor({ state: 'visible' })
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="more"] [data-nav="sync"]').click()
  await page.locator('[data-page="sync"]').waitFor({ state: 'visible' })
  await page.locator('.appbar [data-nav="home"]').click()
  assert.equal(await page.locator('[data-page="home"]').isVisible(), true)
  for (const name of ['home', 'hub-home', 'hub-health', 'hub-utility', 'hub-finance', 'household', 'food', 'ebook', 'projects', 'sync', 'more']) {
    assert.equal(await page.locator(`[data-page="${name}"] .bottom-nav`).count(), 0, `Alsó navigáció maradt: ${name}`)
  }
  assert.deepEqual(pageErrors, [])
  console.log('Grapes approved One Home directly; Health Food/Receptek/Statisztika, Utility E-book, Finance, 320–412 px, back és Projektek: OK')
} finally {
  await browser?.close()
  server.kill()
}
