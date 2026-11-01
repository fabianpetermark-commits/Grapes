import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4183'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4183', '--strictPort'], {
  cwd: projectRoot,
  env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'android-module-test-client' },
  stdio: 'ignore',
})
let browser

async function mobilePage(context, module) {
  const page = await context.newPage()
  await page.goto(`${baseUrl}/?module=${module}&android-shell=1`, { waitUntil: 'networkidle' })
  await page.locator(`#${module}-app`).waitFor({ state: 'visible' })
  assert.equal(await page.locator('#login-screen').isVisible(), false, 'A native shell module route must not fall back to the separate Drive login screen.')
  return page
}

try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(baseUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('Az Android modul tesztszervere nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }

  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  })
  // Model the native WebView bridge, but deliberately leave Drive disconnected and local mode off.
  await context.addInitScript(() => { window.GrapesAndroid = { postMessage() {} } })

  const ebook = await mobilePage(context, 'ebook')
  await ebook.locator('#ebook-status').waitFor()
  const ebookLayout = await ebook.evaluate(() => ({
    androidClass: document.documentElement.classList.contains('is-grapes-android-module'),
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    appWidth: document.querySelector('#ebook-app').scrollWidth,
    toolbarHeight: document.querySelector('#ebook-toolbar').getBoundingClientRect().height,
    homeHeight: document.querySelector('#ebook-back-to-menu-btn').getBoundingClientRect().height,
    uploadHeight: document.querySelector('#ebook-upload-btn').getBoundingClientRect().height,
    markSource: document.querySelector('#ebook-toolbar .toolbar__brand-mark').getAttribute('src'),
  }))
  assert.equal(ebookLayout.androidClass, true)
  assert.equal(ebookLayout.documentWidth, ebookLayout.viewportWidth, 'Az E-book modul vízszintesen kilóg a mobilnézetből.')
  assert.ok(ebookLayout.appWidth <= ebookLayout.viewportWidth)
  assert.ok(ebookLayout.toolbarHeight >= 58)
  assert.ok(ebookLayout.homeHeight >= 44)
  assert.ok(ebookLayout.uploadHeight >= 48)
  assert.ok(ebookLayout.markSource.endsWith('grapes-mark.svg'))
  await ebook.screenshot({ path: 'mobile-ebook-full.png', fullPage: true })
  await ebook.locator('#ebook-open-organizer').tap()
  await ebook.locator('#ebook-editor-tabs').waitFor({ state: 'visible' })
  assert.equal(await ebook.locator('#ebook-manager-view').getAttribute('data-ebook-mode'), 'organizer')
  assert.ok(await ebook.locator('#ebook-editor-metadata-tab').evaluate((button) => button.getBoundingClientRect().height >= 44))
  assert.equal(await ebook.locator('#ebook-metadata-apply').isVisible(), false, 'Az Android szerkesztőben nem maradhat külön javaslat-alkalmazó gomb.')
  assert.equal(await ebook.locator('#ebook-editor-status').isVisible(), false, 'Az üres EPUB-súgósor nem foglalhat helyet.')
  assert.equal(await ebook.locator('.ebook-library__hero').isVisible(), false, 'A szerkesztő mögött nem jelenhet meg a régi Drive-fejléc.')
  assert.equal(await ebook.locator('.ebook-library__quick-add').isVisible(), false, 'A szerkesztő mögött nem jelenhet meg a régi feltöltési blokk.')
  assert.equal(await ebook.locator('.ebook-library__grid').isVisible(), false, 'A szerkesztő mögött nem jelenhet meg a régi könyvlista.')
  assert.equal(await ebook.evaluate(() => document.documentElement.scrollWidth), 390)
  await ebook.close()

  const finance = await mobilePage(context, 'finance')
  await finance.locator('#finance-save-status').filter({ hasText: 'Kész' }).waitFor()
  const financeLayout = await finance.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    appWidth: document.querySelector('#finance-app').scrollWidth,
    tabHeight: document.querySelector('[data-finance-tab="overview"]').getBoundingClientRect().height,
    fabHeight: document.querySelector('#finance-mobile-add').getBoundingClientRect().height,
    fieldHeight: document.querySelector('#finance-filter-search').getBoundingClientRect().height,
    visiblePanels: [...document.querySelectorAll('[data-finance-panel]:not([hidden])')].length,
    markSource: document.querySelector('#finance-app .toolbar__brand-mark').getAttribute('src'),
  }))
  assert.equal(financeLayout.documentWidth, financeLayout.viewportWidth, 'A Pénzügyi Napló vízszintesen kilóg a mobilnézetből.')
  assert.ok(financeLayout.appWidth <= financeLayout.viewportWidth)
  assert.ok(financeLayout.tabHeight >= 44)
  assert.ok(financeLayout.fabHeight >= 54)
  assert.ok(financeLayout.fieldHeight >= 44)
  assert.ok(financeLayout.visiblePanels >= 3)
  assert.ok(financeLayout.markSource.endsWith('grapes-mark.svg'))
  await finance.screenshot({ path: 'mobile-finance-overview.png', fullPage: true })

  for (const tab of ['savings', 'forecast', 'import', 'overview']) {
    await finance.locator(`[data-finance-tab="${tab}"]`).tap()
    assert.equal(await finance.locator(`[data-finance-tab="${tab}"]`).getAttribute('aria-selected'), 'true')
    assert.equal(await finance.evaluate(() => document.documentElement.scrollWidth), 390)
  }

  await finance.locator('#finance-mobile-add').tap()
  await finance.locator('#finance-form').waitFor({ state: 'visible' })
  assert.equal(await finance.locator('[data-finance-tab="transaction"]').getAttribute('aria-selected'), 'true')
  const amountHeight = await finance.locator('#finance-amount').evaluate((field) => field.getBoundingClientRect().height)
  assert.ok(amountHeight >= 48)
  await finance.screenshot({ path: 'mobile-finance-full.png', fullPage: true })
  await context.close()

  console.log(JSON.stringify({ ebook: ebookLayout, finance: financeLayout }, null, 2))
} finally {
  await browser?.close()
  server.kill()
}
