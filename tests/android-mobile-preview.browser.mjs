import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previewUrl = 'http://127.0.0.1:4181/Grapes/design/android-mobile-preview.html'

const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4181', '--strictPort'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })
let browser

try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(previewUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('A mobil UI tesztszervere nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click()

  await page.locator('[data-nav="sync"]').click()
  await page.locator('[data-page="sync"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-sync-local-count]').textContent(), /\d+ projekt/)
  assert.equal(await page.locator('[data-sync-drive-count]').textContent(), 'Nincs csatlakoztatva')
  await page.locator('[data-sync-refresh]').click()
  await page.waitForFunction(() => !document.querySelector('[data-sync-last-check]')?.textContent.includes('Még nem'))
  assert.doesNotMatch(await page.locator('[data-sync-last-check]').textContent(), /Még nem/)
  await page.screenshot({ path: 'mobile-sync.png', fullPage: true })

  await page.locator('[data-nav="home"]').click()

  await page.locator('[data-module="food"]').last().click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-fab]').isVisible(), false, 'A + gomb a főképernyőn nem jelenhet meg.')
  assert.equal(await page.locator('[data-food-meals] .meal').count(), 5, 'Mind az öt étkezésnek látszania kell.')
  await page.locator('[data-food-meals] .meal').first().click()
  assert.equal(await page.locator('[data-fab]').isVisible(), true, 'A + gomb az étkezés részletein jelenjen meg.')
  await page.locator('[data-fab]').click()
  await page.locator('.bottom-sheet.is-open').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector('.bottom-sheet').getBoundingClientRect()
    const lastAction = [...document.querySelectorAll('[data-food-add-sheet] .quick-action')].at(-1).getBoundingClientRect()
    return { sheetTop: sheet.top, sheetBottom: sheet.bottom, lastActionBottom: lastAction.bottom, viewportHeight: innerHeight }
  })
  console.log(JSON.stringify({ sheetLayout }))
  assert.ok(sheetLayout.sheetTop >= 0, 'Az ételfelvétel panel teteje kilóg a képernyőről.')
  assert.ok(sheetLayout.lastActionBottom <= sheetLayout.viewportHeight, 'Az ételfelvétel utolsó gyorsgombja nem látható.')
  const foodPageUrl = page.url()
  await page.locator('[data-food-quick="custom"]').click()
  await page.locator('[data-food-custom-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(page.url(), foodPageUrl, 'A Saját étel gomb nem navigálhat vissza a régi Ételnaplóba.')
  await page.locator('[data-food-custom-name]').fill('Mobil tesztétel')
  await page.locator('[data-food-custom-energy]').fill('123')
  await page.locator('[data-food-custom-protein]').fill('4')
  await page.locator('[data-food-custom-carbohydrate]').fill('20')
  await page.locator('[data-food-custom-fat]').fill('3')
  await page.locator('[data-food-custom-save]').click()
  await page.locator('[data-food-entries]').getByText('Mobil tesztétel').waitFor()
  assert.equal(page.url(), foodPageUrl, 'A mobilos ételmentés után is az új Ételnaplóban kell maradni.')
  await page.screenshot({ path: 'mobile-food-v2.png', fullPage: true })
  await page.locator('[data-food-back]').click()

  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="water"] [data-water-add="250"]').click()
  assert.equal((await page.locator('[data-water-total]').textContent()).replace(/\s/g, ''), '250ml')
  assert.match(await page.locator('[data-water-remaining]').textContent(), /1.?750 ml/)
  await page.locator('[data-samsung-connect]').click()
  assert.match(await page.locator('[data-samsung-status]').textContent(), /Bemutató mód/)
  await page.screenshot({ path: 'mobile-water.png', fullPage: true })

  await page.locator('[data-nav="home"]').click()
  await page.locator('[data-module="ebook"]').click()
  await page.locator('[data-page="ebook"]').waitFor({ state: 'visible' })
  await page.screenshot({ path: 'mobile-ebook-library.png', fullPage: true })

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    visiblePages: [...document.querySelectorAll('[data-page]')].filter(node => !node.hidden).map(node => node.dataset.page),
    openSheet: document.querySelector('.bottom-sheet')?.classList.contains('is-open'),
  }))

  assert.equal(layout.documentWidth, layout.viewportWidth, 'Az előnézet vízszintesen kilóg a mobil viewportból.')
  assert.deepEqual(layout.visiblePages, ['ebook'])
  assert.equal(layout.openSheet, false)
  console.log(JSON.stringify({ ...layout, sheetLayout }, null, 2))
} finally {
  await browser?.close()
  server.kill()
}
