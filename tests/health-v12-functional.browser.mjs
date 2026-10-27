import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(chrome, 'Chromium is required for the approved Health UI checks')
const port = 4276
const url = `http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; ++i) {
    if (server.exitCode !== null) throw Error('Vite stopped')
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 99) throw Error('Health preview did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
  for (const width of [320, 360, 390, 412]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } })
    await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(url)
    await page.locator('[data-page="home"]').waitFor({ state:'visible' })
    assert.equal(await page.locator('[data-health-rail]').isVisible(), false,
      'Health navigation must not leak into the main menu')
    await page.locator('[data-menu-group="health"]').click()
    const rail = page.locator('[data-health-rail]')
    await rail.waitFor({ state:'visible' })
    const tabs = rail.locator('button')
    assert.equal(await tabs.count(), 6)
    assert.deepEqual(await tabs.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label'))),
      ['Food', 'Víznapló', 'Receptek', 'Statisztika', 'Vonalkód', 'Health beállítások'])
    assert.equal(await rail.locator('svg').count(), 6)
    const dims = await rail.evaluate(node => ({
      columns: getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length,
      width: node.getBoundingClientRect().width,
      iconSizes: [...node.querySelectorAll('svg')].map(el => el.getBoundingClientRect().width),
    }))
    assert.equal(dims.columns, 6, 'The accepted navigation is one six-column capsule')
    assert.ok(dims.width <= width - 12)
    assert.ok(dims.iconSizes.every(n => n === (width <= 350 ? 20 : 22)))
    assert.equal(await page.locator('[data-page="hub-health"] .health-panel--food').isVisible(), true)
    assert.equal(await page.locator('[data-page="hub-health"] .health-panel--water').isVisible(), true)
    assert.equal(await page.locator('[data-page="hub-health"] .health-panel--food .health-panel-head strong').textContent(),
      'Mai tápanyagok')
    assert.equal(await page.locator('[data-page="hub-health"] .health-panel--water .health-panel-head strong').textContent(),
      'Mai folyadék')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.ok(overflow <= 2, `Health layout overflow at ${width}: ${overflow}`)
    await rail.locator('[data-health-nav="settings"]').click()
    await page.locator('[data-page="health-settings"]').waitFor({ state:'visible' })
    assert.equal(await rail.locator('[data-health-nav="settings"]').getAttribute('aria-current'), 'page')
    assert.deepEqual(await page.locator('[data-health-settings-index] [data-health-section]')
      .evaluateAll(nodes => nodes.map(node => node.textContent.trim().replace(/\s+/g, ' '))),
      ['Napi célok Kalória, makrók, folyadék és megjelenítés',
        'Adatkapcsolatok Health Connect, Samsung Health, YAZIO és mentések'])
    await page.locator('[data-health-section="connections"]').click()
    assert.equal(await page.locator('[data-health-command="health-import"]').isVisible(), true)
    assert.equal(await page.locator('[data-health-command="samsung-import"]').isVisible(), true)
    assert.equal(await page.locator('[data-health-command="yazio-import"]').isVisible(), true)
    assert.equal(await page.locator('[data-health-command="water-backup"]').isVisible(), true)
    await page.locator('[data-health-command="samsung-import"]').click()
    await page.locator('[data-sync-import-sheet].is-open').waitFor({ state:'visible' })
    assert.match(await page.locator('[data-sync-import-title]').textContent(), /Samsung/i)
    await page.keyboard.press('Escape')
    await page.locator('[data-health-section-back]').click()
    await page.locator('[data-health-section="goals"]').click()
    assert.equal(await page.locator('[data-health-command="food-targets"]').isVisible(), true)
    assert.equal(await page.locator('[data-health-command="water-goal"]').isVisible(), true)
    assert.equal(await page.locator('[data-health-pref]').count(), 3)
    await rail.locator('[data-health-nav="water"]').click()
    await page.locator('[data-page="water"]').waitFor({ state:'visible' })
    assert.equal(await rail.locator('[data-health-nav="water"]').getAttribute('aria-current'), 'page')
    await rail.locator('[data-health-nav="recipes"]').click()
    await page.locator('[data-page="food"]').waitFor({ state:'visible' })
    assert.equal(await rail.locator('[data-health-nav="recipes"]').getAttribute('aria-current'), 'page')
    await rail.locator('[data-health-nav="stats"]').click()
    await page.locator('[data-food-stats-sheet].is-open').waitFor({ state:'visible' })
    assert.equal(await rail.locator('[data-health-nav="stats"]').getAttribute('aria-current'), 'page')
    await page.keyboard.press('Escape')
    await rail.locator('[data-health-nav="food"]').click()
    await page.locator('[data-page="food"]').waitFor({ state:'visible' })
    assert.equal(await rail.locator('[data-health-nav="food"]').getAttribute('aria-current'), 'page')
    await page.locator('.appbar [data-nav="home"]').click()
    await page.locator('[data-page="home"]').waitFor({ state:'visible' })
    assert.equal(await rail.isVisible(), false)
    assert.deepEqual(errors, [], `Browser JS errors at ${width}`)
    await context.close()
  }
  console.log('PASS: Health v1.2 6 real routes, 2 settings groups, Food/Water/Recipe/Stats, import, accessibility and 4 viewport widths')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
