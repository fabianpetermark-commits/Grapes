import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previewUrl = pathToFileURL(resolve(projectRoot, 'design/android-mobile-preview.html')).href

const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })

try {
  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click()

  await page.locator('[data-module="food"]').last().click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  await page.locator('[data-fab]').click()
  await page.locator('.bottom-sheet.is-open').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector('.bottom-sheet').getBoundingClientRect()
    const lastAction = [...document.querySelectorAll('.quick-action')].at(-1).getBoundingClientRect()
    return { sheetTop: sheet.top, sheetBottom: sheet.bottom, lastActionBottom: lastAction.bottom, viewportHeight: innerHeight }
  })
  assert.ok(sheetLayout.sheetTop >= 0, 'Az ételfelvétel panel teteje kilóg a képernyőről.')
  assert.ok(sheetLayout.lastActionBottom <= sheetLayout.viewportHeight, 'Az ételfelvétel utolsó gyorsgombja nem látható.')
  await page.screenshot({ path: 'mobile-food-v2.png', fullPage: true })
  await page.locator('[data-sheet-close]').click({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(300)

  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="water"] [data-water-add="250"]').click()
  assert.equal((await page.locator('[data-water-total]').textContent()).replace(/\s/g, ''), '1500ml')
  assert.match(await page.locator('[data-water-remaining]').textContent(), /500 ml/)
  await page.locator('[data-samsung-connect]').click()
  assert.match(await page.locator('[data-samsung-status]').textContent(), /vízbeolvasás aktív/)
  await page.screenshot({ path: 'mobile-water.png', fullPage: true })

  await page.locator('[data-nav="home"]').click()
  await page.locator('[data-module="ebook"]').click()
  await page.locator('[data-page="ebook"]').waitFor({ state: 'visible' })
  await page.screenshot({ path: 'mobile-ebook-library.png', fullPage: true })

  await page.locator('[data-ebook-view="reader"]').first().click()
  await page.locator('[data-page="reader"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="reader"] [data-ebook-view="transfer"]').click()
  await page.locator('[data-page="transfer"]').waitFor({ state: 'visible' })

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    visiblePages: [...document.querySelectorAll('[data-page]')].filter(node => !node.hidden).map(node => node.dataset.page),
    openSheet: document.querySelector('.bottom-sheet')?.classList.contains('is-open'),
  }))

  assert.equal(layout.documentWidth, layout.viewportWidth, 'Az előnézet vízszintesen kilóg a mobil viewportból.')
  assert.deepEqual(layout.visiblePages, ['transfer'])
  assert.equal(layout.openSheet, false)
  console.log(JSON.stringify({ ...layout, sheetLayout }, null, 2))
} finally {
  await browser.close()
}
