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
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
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
  const nutrient = (nutrientId, unitName, value) => ({ nutrientId, unitName, value })
  const usdaFoods = [
    'Rice, white, long grain, unenriched, raw',
    'Rice, brown, long grain, unenriched, raw',
    'Rice, white, long-grain, regular, raw, enriched',
    'Rice, white, medium-grain, raw, unenriched',
    'Rice, brown, medium-grain, raw',
    'Rice, white, short-grain, raw',
    'Rice, white, long-grain, parboiled, enriched, cooked',
    'Rice, brown, long-grain, cooked',
    'Rice, white, medium-grain, cooked',
    'Rice, brown, parboiled, cooked',
  ].map((description, index) => ({
    fdcId: 900000 + index,
    dataType: index % 2 ? 'Foundation' : 'SR Legacy',
    description,
    foodNutrients: [nutrient(1008, 'kcal', 120 + index), nutrient(1003, 'g', 3), nutrient(1005, 'g', 27), nutrient(1004, 'g', 0.5)],
  }))
  await page.route('https://api.nal.usda.gov/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ totalHits: usdaFoods.length, foods: usdaFoods }) }))
  await page.route('https://search.openfoodfacts.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, hits: [] }) }))
  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click()

  assert.equal(await page.locator('[data-account-card]').count(), 0, 'A fiókkártya nem maradhat a kezdőlapon.')
  assert.equal(await page.locator('[data-recent-projects]').count(), 0, 'A legutóbbi projektek blokk nem maradhat a kezdőlapon.')
  assert.equal(await page.locator('[data-page="home"] .hub-card__icon svg').count(), 4, 'Minden kezdőlapi modulnak egységes SVG ikon kell.')
  assert.match(await page.locator('[data-home-greeting]').textContent(), /^Jó (reggelt|napot|estét)$/)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('grapes:android-update', { detail: { versionCode: 99, versionName: 'Grapes 99', notes: 'Tesztfrissítés' } })))
  assert.equal(await page.locator('[data-notifications-badge]').isVisible(), true, 'Az új frissítésnek jelvényt kell mutatnia.')
  await page.locator('[data-notifications]').click()
  await page.locator('[data-notifications-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-update-title]').textContent(), 'Grapes 99 elérhető')
  assert.equal(await page.locator('[data-notifications-badge]').isVisible(), false, 'Megnyitás után a frissítés olvasott legyen.')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'mobile-update-inbox.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'mobile-home-icons.png', fullPage: true })

  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="more"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="more"] .setting__icon svg').count(), 4, 'Minden beállítássornak egységes SVG ikon kell.')
  await page.screenshot({ path: 'mobile-more-icons.png', fullPage: true })

  await page.locator('[data-page="more"] [data-nav="sync"]').click()
  await page.locator('[data-page="sync"]').waitFor({ state: 'visible' })
  await page.locator('[data-sync-local-count]').filter({ hasText: /\d+ projekt/ }).waitFor()
  await page.locator('[data-sync-drive-count]').filter({ hasText: 'Nincs csatlakoztatva' }).waitFor()
  assert.equal(await page.locator('[data-health-sync]').count(), 1)
  assert.equal(await page.locator('[data-samsung-sync-action]').count(), 1)
  assert.equal(await page.locator('[data-yazio-import]').count(), 1)
  assert.equal(await page.locator('[data-page="sync"] [data-food-health-auto]').count(), 1, 'A Health automatikus import kapcsolója a Szinkron oldalon legyen.')
  assert.equal(await page.locator('[data-page="sync"] [data-food-yazio-auto]').count(), 1, 'A YAZIO automatikus import kapcsolója a Szinkron oldalon legyen.')
  assert.equal(await page.locator('[data-page="sync"] .sync-hero__icon svg').count(), 1, 'A Drive állapotkártyának SVG ikon kell.')
  assert.equal(await page.locator('[data-page="sync"] .sync-stat').count(), 4, 'A Szinkron oldalon a négy állapotösszesítőnek meg kell maradnia.')
  assert.equal(await page.locator('[data-page="sync"] [data-food-off-region]').count(), 1, 'Az Open Food Facts régióválasztó legyen elérhető a Szinkron oldalon.')
  assert.equal(await page.locator('[data-page="sync"] .sync-provider__icon svg').count(), 3, 'Minden szinkronszolgáltatónak SVG ikon kell.')
  const testDay = new Date().toISOString().slice(0, 10)
  const healthExport = JSON.stringify({
    schemaVersion: 1, producer: 'hu.grapes.healthconnect', generatedAt: `${testDay}T08:00:00.000Z`, records: [
      { type: 'nutrition', externalId: 'healthconnect:com.samsung.android.app.healthdata:sync-n1', sourcePackage: 'com.samsung.android.app.healthdata', startTime: `${testDay}T06:10:00.000Z`, endTime: `${testDay}T06:20:00.000Z`, name: 'Samsung reggeli', mealType: 'breakfast', energyKcal: 320, proteinGrams: 18, carbohydrateGrams: 42, fatGrams: 9, volumeMilliliters: null },
      { type: 'hydration', externalId: 'healthconnect:com.samsung.android.app.healthdata:sync-h1', sourcePackage: 'com.samsung.android.app.healthdata', startTime: `${testDay}T07:00:00.000Z`, endTime: `${testDay}T07:00:00.000Z`, name: 'Víz', mealType: null, energyKcal: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, volumeMilliliters: 300 },
    ],
  })
  const healthChooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-health-sync]').click()
  await page.locator('[data-sync-import-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-sync-import-confirm]').click()
  const healthChooser = await healthChooserPromise
  await healthChooser.setFiles({
    name: 'health-export.json', mimeType: 'application/json', buffer: Buffer.from(healthExport),
  })
  await page.locator('[data-food-health-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-health-confirm]').click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('[data-yazio-input]').setInputFiles({
    name: 'nutrition_log.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Time,Meal,Product,Amount,Unit,Portions,Calories/g,Calories total,Protein/g,Fat/g,Carbs/g,Protein total,Fat total,Carbs total\n${testDay},${testDay} 10:30:00,snacks,Alma,120,gram,1,0.5,60,0.002,0.001,0.14,0.2,0.1,16.8`),
  })
  await page.waitForFunction(() => document.querySelector('[data-yazio-status]')?.textContent.includes('1 étkezés importálva'))
  await page.locator('[data-sync-refresh]').click()
  await page.waitForFunction(() => document.querySelector('[data-sync-status]')?.dataset.state === 'ready')
  assert.match(await page.locator('[data-sync-status]').textContent(), /helyi mentések/i)
  await page.screenshot({ path: 'mobile-sync.png', fullPage: true })

  await page.locator('.appbar [data-nav="home"]').click()

  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] .health-panel--food').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.statusbar').count(), 0, 'A statikus óra/akku sáv eltávolítva.')
  await page.locator('[data-page="hub-health"] [data-health-food-open]').click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  await page.locator('[data-food-meals] .meal').first().waitFor()
  assert.equal(await page.locator('[data-food-overview] [data-food-health-auto], [data-food-overview] [data-food-yazio-auto], [data-food-overview] [data-food-sync-refresh], [data-food-overview] [data-food-inbox]').count(), 0, 'Az import-, kézi szinkron- és megosztáskártyák ne maradjanak a Food főoldalon.')
  assert.equal(await page.locator('[data-fab]').isVisible(), false, 'A + gomb a főképernyőn nem jelenhet meg.')
  assert.equal(await page.locator('[data-food-meals] .meal').count(), 5, 'Mind az öt étkezésnek látszania kell.')
  assert.equal(await page.locator('[data-food-meals] .meal__icon svg').count(), 5, 'Mind az öt étkezésnek egységes SVG ikon kell.')
  assert.equal(await page.locator('[data-water-open] .water-card__icon svg').count(), 1, 'A vízkártyának SVG ikon kell.')
  // The daily summary was promoted to the Health dashboard.
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"] [data-health-stats]').click()
  await page.locator('[data-food-stats-sheet].is-open').waitFor({ state: 'visible' })
  const statsLayout = await page.locator('[data-food-stats-sheet]').evaluate(sheet => ({ top: sheet.getBoundingClientRect().top, bottom: sheet.getBoundingClientRect().bottom, height: innerHeight }))
  assert.deepEqual(statsLayout, { top: 0, bottom: 844, height: 844 }, 'A statisztika teljes képernyős oldal legyen.')
  await page.locator('[data-food-stats-range]').selectOption('30')
  await page.locator('[data-food-stats-nutrient]').selectOption('protein')
  assert.match(await page.locator('[data-food-stats-visuals]').textContent(), /Fehérje/)
  await page.locator('[data-food-stats-range]').selectOption('custom')
  assert.equal(await page.locator('[data-food-stats-custom]').isVisible(), true)
  await page.locator('[data-food-stats-from]').fill(testDay)
  await page.locator('[data-food-stats-to]').fill(testDay)
  await page.locator('[data-food-stats-range]').selectOption('all')
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true)
  await page.waitForFunction(() => !document.querySelector('[data-food-stats-sheet]')?.classList.contains('is-open'))
  // Goals are now configured from Health-specific settings.
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-health-section="goals"]').click()
  await page.locator('[data-health-command="food-targets"]').click()
  await page.locator('[data-food-targets-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-target-energy]').fill('2100')
  await page.locator('[data-food-target-protein]').fill('120')
  await page.locator('[data-food-meal-limit="breakfast"]').fill('500')
  await page.locator('[data-food-target-save]').click()
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-health-section="goals"]').click()
  await page.locator('[data-health-command="food-targets"]').click()
  assert.equal(await page.locator('[data-food-target-energy]').inputValue(), '2100')
  assert.equal(await page.locator('[data-food-target-protein]').inputValue(), '120')
  assert.equal(await page.locator('[data-food-meal-limit="breakfast"]').inputValue(), '500')
  await page.setViewportSize({ width: 390, height: 600 })
  await page.locator('[data-food-meal-limit="dinner"]').focus()
  const targetsCompact = await page.evaluate(() => {
    const input = document.querySelector('[data-food-meal-limit="dinner"]').getBoundingClientRect()
    const footer = document.querySelector('[data-food-targets-sheet] .food-full-page__footer').getBoundingClientRect()
    return { inputBottom: input.bottom, footerTop: footer.top, footerBottom: footer.bottom, viewportHeight: innerHeight }
  })
  assert.ok(targetsCompact.inputBottom <= targetsCompact.footerTop, 'A billentyűzetméretű nézetben a szerkesztett célmezőt ne takarja a mentés gombja.')
  assert.ok(targetsCompact.footerBottom <= targetsCompact.viewportHeight, 'A célmentés gomb maradjon a viewporton belül.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-food-targets-back]').click()
  await page.screenshot({ path: 'mobile-food-icons.png', fullPage: true })
  await page.locator('[data-food-meals] .meal').first().click()
  assert.equal(await page.locator('[data-fab]').isVisible(), true, 'A + gomb az étkezés részletein jelenjen meg.')
  await page.locator('[data-food-detail-add]').click()
  await page.locator('[data-food-add-sheet].is-open').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector('[data-food-add-sheet]').getBoundingClientRect()
    const lastAction = [...document.querySelectorAll('[data-food-add-sheet] .quick-action')].at(-1).getBoundingClientRect()
    const results = document.querySelector('[data-food-search-results]')
    return { sheetTop: sheet.top, sheetBottom: sheet.bottom, sheetWidth: sheet.width, lastActionBottom: lastAction.bottom, viewportHeight: innerHeight, viewportWidth: innerWidth, resultsOverflow: getComputedStyle(results).overflowY }
  })
  console.log(JSON.stringify({ sheetLayout }))
  assert.equal(sheetLayout.sheetTop, 0, 'Az ételfelvétel oldalnak a képernyő tetején kell kezdődnie.')
  assert.equal(sheetLayout.sheetBottom, sheetLayout.viewportHeight, 'Az ételfelvétel oldalnak ki kell töltenie a képernyőmagasságot.')
  assert.equal(sheetLayout.sheetWidth, sheetLayout.viewportWidth, 'Az ételfelvétel oldalnak ki kell töltenie a képernyőszélességet.')
  assert.equal(sheetLayout.resultsOverflow, 'auto', 'A találatlista önállóan legyen görgethető.')
  assert.ok(sheetLayout.lastActionBottom <= sheetLayout.viewportHeight, 'Az ételfelvétel utolsó gyorsgombja nem látható.')
  const foodPageUrl = page.url()
  await page.locator('[data-food-add-back]').click()
  await page.waitForFunction(() => !document.querySelector('[data-food-add-sheet]')?.classList.contains('is-open'))
  assert.equal(await page.locator('[data-food-detail]').isVisible(), true, 'A fejléc vissza gombja az eredeti étkezéshez térjen vissza.')
  await page.locator('[data-fab]').click()
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true, 'Az Android rendszer-vissza kezelje az ételfelvétel oldalt.')
  await page.waitForFunction(() => !document.querySelector('[data-food-add-sheet]')?.classList.contains('is-open'))
  await page.locator('[data-fab]').click()
  await page.locator('[data-food-search]').fill('rizs')
  await page.getByText(/További találatok/).waitFor()
  await page.setViewportSize({ width: 390, height: 600 })
  const compactLayout = await page.evaluate(() => {
    const results = document.querySelector('[data-food-search-results]')
    const actions = document.querySelector('[data-food-add-sheet] .quick-grid').getBoundingClientRect()
    results.scrollTop = results.scrollHeight
    return { canScroll: results.scrollHeight > results.clientHeight, scrollTop: results.scrollTop, actionsBottom: actions.bottom, viewportHeight: innerHeight }
  })
  assert.equal(compactLayout.canScroll, true, 'Kisebb, billentyűzet melletti magasságon a találatok legyenek görgethetők.')
  assert.ok(compactLayout.scrollTop > 0, 'A találatlista ténylegesen görgethető legyen.')
  assert.ok(compactLayout.actionsBottom <= compactLayout.viewportHeight, 'A gyorsműveletek ne takarják a találatokat kisebb magasságon sem.')
  await page.setViewportSize({ width: 390, height: 844 })
  // The four quick actions replaced the old USDA / all / favorites filter tabs.
  assert.equal(await page.locator('[data-food-quick]').count(), 4,
    'A négy Food gyorsgomb jelenjen meg a régi szűrőfülek helyett.')
  assert.equal(await page.locator('[data-food-search-filter]').count(), 0,
    'A régi kereső-szűrőfülek ne térjenek vissza.')
  const entriesBeforeFood = await page.locator('[data-food-entries] .food-entry-card').count()
  await page.locator('[data-food-search-results] .sheet-result__main').first().click()
  await page.locator('[data-food-edit-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-edit-save]').click()
  assert.equal(await page.locator('[data-food-entries] .food-entry-card').count(), entriesBeforeFood + 1,
    'A keresett ételnek naplózhatónak kell maradnia.')
  await page.locator('[data-food-detail-add]').click()
  await page.locator('[data-food-search]').fill('rizs')
  await page.getByText(/További találatok/).waitFor()
  await page.locator('[data-food-search-results] .sheet-result__favorite:not([hidden])').first().click()
  await page.locator('[data-food-quick="favorites"]').click()
  assert.equal(await page.locator('[data-food-quick="favorites"]').getAttribute('aria-pressed'), 'true')
  assert.ok(await page.locator('[data-food-search-results] .sheet-result__main').count() > 0,
    'A Kedvencek gyorsgomb a megjelölt ételt mutassa.')
  await page.locator('[data-food-quick="custom"]').click()
  await page.locator('[data-food-custom-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(page.url(), foodPageUrl, 'A Saját étel gyorsgomb maradjon a Food modulban.')
  await page.locator('[data-food-custom-name]').fill('Mobil tesztétel')
  await page.locator('[data-food-custom-energy]').fill('123')
  await page.locator('[data-food-custom-protein]').fill('4')
  await page.locator('[data-food-custom-carbohydrate]').fill('20')
  await page.locator('[data-food-custom-fat]').fill('3')
  await page.locator('[data-food-custom-save]').click()
  await page.locator('[data-food-edit-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-food-edit-save]').click()
  await page.locator('[data-food-entries]').getByText('Mobil tesztétel').waitFor()
  const customCard = page.locator('[data-food-entries] .food-entry-card', { hasText: 'Mobil tesztétel' }).first()
  await customCard.locator('[data-entry-edit]').click()
  await page.locator('[data-food-edit-amount]').fill('150')
  await page.locator('[data-food-edit-save]').click()
  await page.locator('[data-food-entries] .food-entry-card', { hasText: 'Mobil tesztétel' }).first().getByText(/150 g/).waitFor()
  const beforeRepeat = await page.locator('[data-food-entries] .food-entry-card').count()
  await page.locator('[data-food-entries] .food-entry-card', { hasText: 'Mobil tesztétel' }).first().locator('[data-entry-repeat]').click()
  assert.equal(await page.locator('[data-food-entries] .food-entry-card').count(), beforeRepeat + 1)
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('[data-food-entries] .food-entry-card', { hasText: 'Mobil tesztétel' }).first().locator('[data-entry-delete]').click()
  assert.equal(await page.locator('[data-food-entries] .food-entry-card').count(), beforeRepeat + 1,
    'Elutasított megerősítésnél ne törlődjön a bejegyzés.')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('[data-food-entries] .food-entry-card', { hasText: 'Mobil tesztétel' }).first().locator('[data-entry-delete]').click()
  assert.equal(await page.locator('[data-food-entries] .food-entry-card').count(), beforeRepeat)
  await page.locator('[data-food-back]').click()
  await page.locator('[data-food-open-recipes]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-food-recipe-tabs] [role="tab"]').count(),5)
  await page.locator('[data-food-recipe-tab="ingredient"]').click()
  await page.locator('[data-food-recipe-panel="ingredient"]').waitFor({state:'visible'})
  await page.locator('[data-food-recipe-tab="image"]').click()
  await page.locator('[data-food-recipe-panel="image"]').waitFor({state:'visible'})
  await page.locator('[data-food-recipe-tab="import"]').click()
  await page.locator('[data-food-recipe-panel="import"]').waitFor({state:'visible'})
  await page.locator('[data-food-recipe-editor-back]').click()
  await page.locator('[data-food-recipes-back]').click()

  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="water"] [data-water-add="250"]').click()
  assert.ok(await page.locator('[data-water-log] .water-log__icon svg').count() >= 1, 'A víznapló sorainak SVG ikon kell.')
  assert.equal((await page.locator('[data-water-total]').textContent()).replace(/\s/g, ''), '550ml')
  assert.match(await page.locator('[data-water-remaining]').textContent(), /1.?450 ml/)
  await page.locator('[data-water-log] button').filter({ hasText: '300 ml' }).evaluate(button => button.click())
  assert.equal((await page.locator('[data-water-total]').textContent()).replace(/\s/g, ''), '250ml', 'A Health-víz törölhető legyen.')

  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="more"] [data-nav="sync"]').click()
  const retryChooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-health-sync]').click()
  await page.locator('[data-sync-import-sheet].is-open').waitFor({ state: 'visible' })
  await page.locator('[data-sync-import-confirm]').click()
  const retryChooser = await retryChooserPromise
  await retryChooser.setFiles({ name: 'health-export.json', mimeType: 'application/json', buffer: Buffer.from(healthExport) })
  await page.locator('[data-food-health-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-food-health-record]:checked').count(), 1, 'A törölt víz rekord újra importálható legyen.')
  await page.locator('[data-food-health-confirm]').click()
  await page.waitForFunction(() => !document.querySelector('[data-food-health-sheet]')?.classList.contains('is-open'))
  await page.locator('.appbar [data-nav="home"]').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-health-food-open]').click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  await page.locator('[data-water-open]').click()
  assert.equal((await page.locator('[data-water-total]').textContent()).replace(/\s/g, ''), '550ml')
  await page.screenshot({ path: 'mobile-water.png', fullPage: true })

  await page.locator('.appbar [data-nav="home"]').click()
  await page.locator('[data-menu-group="utility"]').click()
  await page.locator('[data-page="hub-utility"] [data-menu-destination="ebook"]').click()
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
