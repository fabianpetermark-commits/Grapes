import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4182'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4182', '--strictPort'], { cwd: projectRoot, stdio: 'ignore' })
let browser

try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(baseUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('Az Android Food tesztszervere nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const page = await context.newPage()
  await page.goto(`${baseUrl}/?module=food&android-shell=1`, { waitUntil: 'networkidle' })
  await page.locator('#food-save-status').filter({ hasText: 'Helyi napló' }).waitFor()

  const layout = await page.evaluate(() => ({
    androidClass: document.documentElement.classList.contains('is-grapes-android-module'),
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
    foodHeight: document.querySelector('#food-app').scrollHeight,
    mainHeight: document.querySelector('.food__main').scrollHeight,
    tabHeight: document.querySelector('[data-food-tab="diary"]').getBoundingClientRect().height,
    inputHeight: document.querySelector('#food-entry-amount').getBoundingClientRect().height,
  }))
  assert.equal(layout.androidClass, true)
  assert.equal(layout.documentWidth, layout.viewportWidth, 'A teljes Food modul vízszintesen kilóg a mobilnézetből.')
  assert.ok(layout.tabHeight >= 42, 'A Food fülek érintési célja túl kicsi.')
  assert.ok(layout.inputHeight >= 48, 'A Food mezők érintési célja túl kicsi.')
  assert.equal(await page.locator('#food-backup-export').isVisible(), false)
  assert.equal(await page.locator('#food-health-import').isVisible(), true)
  assert.equal(await page.locator('#food-drive-save').isVisible(), true)
  assert.equal(await page.locator('#food-back-to-menu-btn').isVisible(), true)
  await page.screenshot({ path: 'mobile-food-full.png', fullPage: true })
  console.log(JSON.stringify(layout, null, 2))
} finally {
  await browser?.close()
  server.kill()
}
