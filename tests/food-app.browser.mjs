import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4181'
const screenshotPath = 'C:\\Users\\uszan\\.codex\\visualizations\\2026\\10\\12\\01a13009-ffc7-7101-913b-e4248074c839\\grapes-food-mobile.png'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(path => path && existsSync(path))
if (!executablePath) throw new Error('Chromium böngésző szükséges a Food böngészős teszthez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4181', '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'food-test-client' }, stdio: 'ignore',
})
let browser
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('A Food tesztszerver nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await context.addInitScript(() => {
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({
      clientId: 'food-test-client', accessToken: 'token', expiresAt: Date.now() + 3600000,
      scopes: 'https://www.googleapis.com/auth/drive.file', account: { id: 'food-user', name: 'Food Teszt', email: 'food@example.com', photo: '' },
    }))
    globalThis.__GRAPES_RECEIPT_OCR_TEST__ = async (_image, onProgress) => { onProgress(1); return 'Tápérték 100 g\nEnergia 200 kcal\nZsír 8,5 g\nSzénhidrát 20 g\nFehérje 10 g\nSó 0,75 g' }
    globalThis.BarcodeDetector = class { async detect() { return [{ rawValue: '5991234567890' }] } }
    globalThis.createImageBitmap = async () => ({ close() {} })
  })
  await context.route('https://www.googleapis.com/**', route => {
    const isCreate = route.request().method() === 'POST'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isCreate ? { id: `folder-${Date.now()}` } : { files: [] }) })
  })
  await context.route('https://world.openfoodfacts.org/api/v2/product/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1, product: { product_name_hu: 'Kamerával beolvasott termék', categories_tags: ['hu:teszt'], product_quantity_unit: 'g', nutriments: { 'energy-kcal_100g': 321, proteins_100g: 12 } } }),
  }))
  await context.route('https://search.openfoodfacts.org/search**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1, page: 1, hits: [{
      code: '5999999999999', product_name_hu: 'Név alapján talált mogyorókrém',
      categories_tags: ['en:spreads', 'en:chocolate-spreads'], product_quantity_unit: 'g',
      nutriments: { 'energy-kcal_100g': 555, proteins_100g: 6 }, last_modified_t: 123,
    }] }),
  }))
  const page = await context.newPage()
  await page.goto(`${baseUrl}/?module=food`)
  await page.locator('#food-save-status').filter({ hasText: 'Helyi napló' }).waitFor()

  for (const id of ['food-health-import', 'food-backup-export', 'food-backup-import', 'food-drive-save', 'food-back-to-menu-btn']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id} legyen elérhető mobilon is`)
  }
  assert.equal(await page.locator('#food-entry-scan').isVisible(), true)
  const diaryScanChooser = page.waitForEvent('filechooser')
  await page.locator('#food-entry-scan').tap()
  await (await diaryScanChooser).setFiles({ name: 'diary-barcode.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-diary-barcode-image') })
  await page.locator('#food-save-status').filter({ hasText: 'elmentve az Ételek közé' }).waitFor()
  assert.equal(await page.locator('#food-entry-food option:checked').textContent(), 'Kamerával beolvasott termék')
  await page.locator('[data-food-tab="foods"]').tap()
  assert.equal(await page.locator('.food__food-row', { hasText: 'Kamerával beolvasott termék' }).count(), 1)
  await page.locator('[data-food-tab="diary"]').tap()
  const duplicateScanChooser = page.waitForEvent('filechooser')
  await page.locator('#food-entry-scan').tap()
  await (await duplicateScanChooser).setFiles({ name: 'same-barcode.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('same-fake-image') })
  await page.locator('#food-save-status').filter({ hasText: 'már szerepel az Ételek között' }).waitFor()
  await page.locator('[data-food-tab="foods"]').tap()
  assert.equal(await page.locator('.food__food-row', { hasText: 'Kamerával beolvasott termék' }).count(), 1)
  await page.locator('[data-food-tab="diary"]').tap()
  assert.equal(await page.locator('.food__tabs').getAttribute('role'), 'tablist')
  assert.equal(await page.locator('[data-food-tab="diary"]').getAttribute('aria-selected'), 'true')
  await page.locator('[data-food-tab="diary"]').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('[data-food-tab="foods"]').getAttribute('aria-selected'), 'true')

  await page.locator('#food-drive-save').tap()
  await page.locator('#food-save-status').filter({ hasText: 'Drive-ra mentve' }).waitFor()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('#food-backup-export').tap()
  assert.match((await downloadPromise).suggestedFilename(), /^grapes-food-\d{4}-\d{2}-\d{2}\.json$/)

  await page.locator('[data-food-tab="foods"]').tap()
  assert.match(await page.locator('#food-lookup').textContent(), /név vagy vonalkód alapján/)
  await page.locator('#food-item-name').fill('mogyorókrém')
  await page.locator('#food-item-barcode').fill('')
  await page.locator('#food-lookup').tap()
  const remoteResult = page.locator('.food__off-result', { hasText: 'Név alapján talált mogyorókrém' })
  await remoteResult.waitFor()
  await remoteResult.locator('[data-off-result]').tap()
  assert.equal(await page.locator('#food-item-name').inputValue(), 'Név alapján talált mogyorókrém')
  assert.equal(await page.locator('#food-item-barcode').inputValue(), '5999999999999')
  assert.equal(await page.locator('#food-item-energyKcal').inputValue(), '555')
  await page.locator('#food-item-form button[type="submit"]').tap()
  await page.locator('.food__food-row', { hasText: 'Név alapján talált mogyorókrém' }).waitFor()
  await page.locator('#food-search').fill('')
  await page.locator('#food-item-name').fill('Teszt csirkemell')
  await page.locator('#food-item-category').fill('Hús')
  await page.locator('#food-item-energyKcal').fill('120')
  await page.locator('#food-item-protein').fill('23')
  await page.locator('#food-item-form button[type="submit"]').tap()
  await page.locator('.food__food-row', { hasText: 'Teszt csirkemell' }).waitFor()

  await page.locator('#food-label-input').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from('fake-image') })
  await page.locator('#food-ocr-preview:not(.hidden)').waitFor()
  assert.equal(await page.locator('#food-ocr-energyKcal').inputValue(), '200')
  await page.locator('#food-ocr-apply').tap()
  assert.equal(await page.locator('#food-item-fat').inputValue(), '8.5')
  assert.match(await page.locator('#food-api-status').textContent(), /ellenőrizd/i)

  await page.locator('[data-food-tab="recipes"]').tap()
  await page.locator('#food-recipe-name').fill('Sült csirkemell recept')
  await page.locator('#food-recipe-ingredient-food').selectOption({ label: 'Teszt csirkemell' })
  await page.locator('#food-recipe-ingredient-amount').fill('500')
  await page.locator('#food-recipe-add-ingredient').tap()
  await page.locator('#food-recipe-prepared-weight').fill('400')
  await page.locator('#food-recipe-yield-count').fill('4')
  await page.locator('#food-recipe-yield-unit').selectOption('serving')
  await page.locator('#food-recipe-form button[type="submit"]').tap()
  await page.locator('.food__recipe-row', { hasText: 'Sült csirkemell recept' }).waitFor()

  await page.locator('[data-recipe-variant]').first().tap()
  await page.locator('#food-recipe-name').fill('Csípős csirkemell variáns')
  await page.locator('#food-recipe-form button[type="submit"]').tap()
  const variantRow = page.locator('.food__recipe-row', { hasText: 'Csípős csirkemell variáns' })
  await variantRow.waitFor()
  assert.match(await variantRow.textContent(), /variánsa/)

  await page.locator('[data-food-tab="foods"]').tap()
  const chickenRow = page.locator('.food__food-row', { hasText: 'Teszt csirkemell' })
  await chickenRow.locator('[data-food-edit]').tap()
  await page.locator('#food-item-energyKcal').fill('160')
  await page.locator('#food-item-form button[type="submit"]').tap()
  await page.locator('[data-food-tab="recipes"]').tap()
  assert.match(await page.locator('.food__recipe-row', { hasText: 'Sült csirkemell recept' }).first().textContent(), /200 kcal/)
  await page.locator('[data-food-tab="foods"]').tap()
  await page.locator('.food__food-row', { hasText: 'Teszt csirkemell' }).locator('[data-food-delete]').tap()
  assert.match(await page.locator('#food-api-status').textContent(), /Nem törölhető:.*recept használja/)
  assert.equal(await page.locator('.food__food-row', { hasText: 'Teszt csirkemell' }).count(), 1)
  const favorite = page.locator('.food__food-row', { hasText: 'Teszt csirkemell' }).locator('[data-food-favorite]')
  await favorite.tap()
  assert.equal(await favorite.getAttribute('aria-pressed'), 'true')

  await page.locator('[data-food-tab="libraries"]').tap()
  await page.locator('#food-library-name').fill('Teszt családi receptek')
  await page.locator('#food-library-create button[type="submit"]').tap()
  const libraryCard = page.locator('.food__library-card', { hasText: 'Teszt családi receptek' })
  await libraryCard.waitFor()
  assert.match(await libraryCard.textContent(), /2 recept/)
  await page.locator('#food-library-email').fill('csaladtag@example.com')
  await page.locator('#food-library-role').selectOption('writer')
  await libraryCard.locator('[data-library-share]').tap()
  await page.locator('#food-library-status').filter({ hasText: 'Meghívás elküldve' }).waitFor()
  page.once('dialog', dialog => dialog.accept())
  await libraryCard.locator('[data-library-revoke]').tap()
  await page.locator('#food-library-status').filter({ hasText: 'hozzáférése visszavonva' }).waitFor()

  await page.locator('[data-food-tab="diary"]').tap()
  await page.locator('#food-entry-food').selectOption({ label: 'Sült csirkemell recept' })
  await page.locator('#food-entry-unit').selectOption('serving')
  await page.locator('#food-entry-amount').fill('1')
  await page.locator('#food-entry-form button[type="submit"]').tap()
  await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).waitFor()
  assert.match(await page.locator('#food-summary').textContent(), /200/)
  await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).locator('[data-entry-action="edit"]').tap()
  assert.equal(await page.locator('#food-entry-cancel').isVisible(), true)
  await page.locator('#food-entry-cancel').tap()
  await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).locator('[data-entry-action="repeat"]').tap()
  assert.equal(await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).count(), 2)
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).first().locator('[data-entry-action="delete"]').tap()
  assert.equal(await page.locator('.food__entry', { hasText: 'Sült csirkemell recept' }).count(), 1)

  await page.locator('[data-food-tab="targets"]').tap()
  await page.locator('#food-target-energy').fill('2200')
  await page.locator('#food-target-protein').fill('120')
  await page.locator('#food-target-form button[type="submit"]').tap()
  await page.locator('[data-food-tab="diary"]').tap()
  assert.match(await page.locator('#food-summary').textContent(), /2.?200 kcal cél/)
  await page.locator('[data-food-tab="stats"]').tap()
  await page.locator('#food-stats-nutrient').selectOption('protein')
  await page.locator('#food-stats-compare').selectOption('energyKcal')
  await page.locator('#food-stats-granularity').selectOption('week')
  assert.match(await page.locator('#food-stats-summary').textContent(), /Napi átlag/)
  await page.locator('.food__donut').waitFor()

  const healthExport = {
    schemaVersion: 1, producer: 'hu.grapes.healthconnect', generatedAt: '2026-10-12T12:00:00.000Z',
    records: [
      { type: 'nutrition', externalId: 'healthconnect:com.samsung.android.app.healthdata:browser-n1', sourcePackage: 'com.samsung.android.app.healthdata', clientRecordId: null, startTime: '2026-10-12T08:00:00.000Z', endTime: '2026-10-12T08:10:00.000Z', name: 'Health reggeli', mealType: 'breakfast', energyKcal: 420, proteinGrams: 24, carbohydrateGrams: 48, fatGrams: 14, volumeMilliliters: null },
      { type: 'hydration', externalId: 'healthconnect:com.samsung.android.app.healthdata:browser-h1', sourcePackage: 'com.samsung.android.app.healthdata', clientRecordId: null, startTime: '2026-10-12T09:00:00.000Z', endTime: '2026-10-12T09:00:00.000Z', name: null, mealType: null, energyKcal: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, volumeMilliliters: 250 },
    ],
  }
  const healthFile = { name: 'grapes-health.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(healthExport)) }
  await page.locator('#food-health-input').setInputFiles(healthFile)
  await page.locator('#food-health-preview:not(.hidden)').waitFor()
  assert.match(await page.locator('#food-health-summary').textContent(), /2 új/)
  await page.locator('#food-health-confirm').tap()
  await page.locator('[data-food-tab="diary"]').tap()
  await page.locator('.food__entry', { hasText: 'Health reggeli' }).waitFor()
  await page.locator('.food__entry', { hasText: 'Víz' }).waitFor()

  await page.locator('#food-health-input').setInputFiles(healthFile)
  await page.locator('#food-health-preview:not(.hidden)').waitFor()
  assert.match(await page.locator('#food-health-summary').textContent(), /0 új · 2 már importálva/)
  assert.equal(await page.locator('#food-health-confirm').isDisabled(), true)
  await page.locator('#food-health-close').tap()

  await page.locator('[data-food-tab="foods"]').tap()
  assert.equal(await page.locator('#food-barcode-input').getAttribute('capture'), 'environment')
  await page.locator('#food-barcode-input').setInputFiles({ name: 'barcode.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-barcode-image') })
  await page.locator('#food-api-status').filter({ hasText: 'már szerepel az Ételek között' }).waitFor()
  assert.equal(await page.locator('#food-item-barcode').inputValue(), '5991234567890')
  assert.equal(await page.locator('#food-item-name').inputValue(), 'Kamerával beolvasott termék')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await page.evaluate(() => { globalThis.__foodMainMenuOpened = false; document.addEventListener('grapes:open-main-menu', () => { globalThis.__foodMainMenuOpened = true }, { once: true }) })
  await page.locator('#food-back-to-menu-btn').tap()
  assert.equal(await page.evaluate(() => globalThis.__foodMainMenuOpened), true)
  console.log('✓ A Food teljes mobil vezérlési útvonala, API-ja, recept-újraszámítása, céljai, statisztikája, exportja és Health-importja működik')
  await context.close()
} finally {
  await browser?.close()
  server.kill()
}
