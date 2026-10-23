import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previewUrl = 'http://127.0.0.1:4198/Grapes/design/android-mobile-preview.html'
const chrome = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('A recipe browser testhez Chromium szükséges.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host',
  '127.0.0.1', '--port', '4198', '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(previewUrl)).ok) break } catch {}
    if (attempt === 99) throw new Error('A Food recept tesztszervere nem indult el.')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  // Exercise the realistic Android WebView fallback when BarcodeDetector is unavailable.
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }) })
  page.on('pageerror', error => console.error('Recipe browser page error:', error.message))
  await page.route('https://world.openfoodfacts.org/api/v2/product/5998888888888.json', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 1, product: { code: '5998888888888', product_name_hu: 'Teszt keksz',
        nutriments: { 'energy-kcal_100g': 410, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 16 } },
    }),
  }))
  await page.route('https://api.nal.usda.gov/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"foods":[]}',
  }))
  await page.route('https://search.openfoodfacts.org/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      count: 1, page: 1, hits: [{
        code: '5998888888888', product_name_hu: 'Teszt keksz',
        categories_tags: ['hu:keksz'], countries_tags: ['en:hungary'],
        product_quantity_unit: 'g',
        nutriments: { 'energy-kcal_100g': 410, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 16 },
      }],
    }),
  }))

  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click()
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-health-food-open]').click()
  await page.locator('[data-page="food"]').waitFor({ state: 'visible' })
  await page.locator('[data-food-meals] .meal').first().waitFor()
  await page.locator('[data-food-open-recipes]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible', timeout: 10000 })
    .catch(async error => {
      const state = await page.evaluate(() => ({
        food: document.querySelector('[data-page="food"]')?.hidden,
        recipes: document.querySelector('[data-food-recipes-view]')?.hidden,
        title: document.querySelector('[data-food-recipe-editor-title]')?.textContent,
        sheet: document.querySelector('[data-food-recipe-edit-sheet]')?.className,
        status: document.querySelector('[data-food-recipe-editor-status]')?.textContent,
      }))
      console.error('Recipe editor did not open:', JSON.stringify(state))
      throw error
    })
  assert.equal(await page.locator('[data-food-recipe-tab="basics"]').getAttribute('aria-selected'),
    'true','Alapadatok alapértelmezetten aktív.')
  assert.equal(await page.locator('[data-food-recipe-panel="ingredient"]').isVisible(),false)
  assert.equal(await page.locator('[data-food-recipe-panel="list"]').isVisible(),false)
  const alignment = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).closest('label').getBoundingClientRect()
    const a = rect('[data-food-recipe-yield-unit]')
    const b = rect('[data-food-recipe-unit-weight]')
    const c = rect('[data-food-recipe-nutrient-carbohydrate]')
    const d = rect('[data-food-recipe-nutrient-fat]')
    return { yieldTop: a.top, weightTop: b.top, yieldWidth: a.width, weightWidth: b.width,
      carbohydrateTop: c.top, fatTop: d.top, carbohydrateWidth: c.width, fatWidth: d.width }
  })
  assert.ok(Math.abs(alignment.yieldTop - alignment.weightTop) < 3,
    'Egységtömeg és hozam egysége mezők egy sorban legyenek: ' + JSON.stringify(alignment))
  await page.locator('[data-food-recipe-tab="ingredient"]').click()
  const nutrientAlignment = await page.evaluate(() => {
    const a = document.querySelector('[data-food-recipe-nutrient-carbohydrate]').closest('label').getBoundingClientRect()
    const b = document.querySelector('[data-food-recipe-nutrient-fat]').closest('label').getBoundingClientRect()
    return { topA:a.top,topB:b.top,widthA:a.width,widthB:b.width }
  })
  assert.ok(Math.abs(nutrientAlignment.topA-nutrientAlignment.topB)<3)
  assert.ok(Math.abs(nutrientAlignment.widthA-nutrientAlignment.widthB)<5)
  assert.ok(Math.abs(alignment.carbohydrateTop - alignment.fatTop) < 3,
    'Szénhidrát és zsír mezők egy sorban legyenek: ' + JSON.stringify(alignment))
  assert.ok(Math.abs(alignment.carbohydrateWidth - alignment.fatWidth) < 5)
  await page.locator('[data-food-recipe-tab="basics"]').click()
  await page.locator('[data-food-recipe-name-input]').fill('Keresővel készített tesztrecept')
  await page.locator('[data-food-recipe-tab="ingredient"]').click()
  const input = page.locator('[data-food-recipe-ingredient-search]')
  const dropdown = page.locator('[data-food-recipe-ingredient-food]')
  assert.equal(await dropdown.inputValue(), '', 'Keresés nélkül ne válasszunk hozzávalót.')

  await input.fill('vöröshagyma')
  const onion = dropdown.locator('option', { hasText: /Vöröshagyma/ }).first()
  await onion.waitFor({ state: 'attached' })
  const onionValue = await onion.getAttribute('value')
  assert.ok(onionValue?.startsWith('catalog:'), 'Az offline USDA-találat közvetlenül legyen választható.')
  assert.equal(await dropdown.inputValue(), '', 'Gépeléskor ne válasszuk ki automatikusan az első találatot.')
  await dropdown.selectOption(onionValue)
  assert.equal(await page.locator('[data-food-recipe-ingredient-unit]').inputValue(), 'g')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Vöröshagyma/)
  assert.equal(await input.inputValue(), '', 'Hozzáadás után ürüljön a keresőmező.')

  await input.fill('Teszt keksz')
  const cookie = dropdown.locator('option', { hasText: /Teszt keksz/ }).first()
  await cookie.waitFor({ state: 'attached', timeout: 18000 })
  assert.equal(await dropdown.inputValue(), '', 'Online találat sem választható ki automatikusan.')
  await dropdown.selectOption(await cookie.getAttribute('value'))
  await page.locator('[data-food-recipe-ingredient-amount]').fill('45')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Teszt keksz/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Összesen:/)
  // A user should not need to enter both yield and finished/unit weights.
  await page.locator('[data-food-recipe-tab="basics"]').click()
  await page.locator('[data-food-recipe-weight-input]').fill('750')
  await page.locator('[data-food-recipe-yield-unit]').selectOption('slice')
  await page.locator('[data-food-recipe-unit-weight]').fill('25')
  const yieldInput = page.locator('[data-food-recipe-yield-input]')
  assert.equal(await yieldInput.inputValue(), '30', 'Hozam azonnal jelenjen meg: 750 / 25 = 30 szelet.')
  assert.match(await page.locator('[data-food-recipe-yield-hint]').textContent(), /Automatikusan számolva/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /30 szelet/)
  // An explicit count wins while weight changes. Clearing the count restores
  // automatic calculation without changing the manually entered unit weight.
  await yieldInput.fill('24')
  await page.locator('[data-food-recipe-weight-input]').fill('800')
  assert.equal(await yieldInput.inputValue(), '24', 'A kézi hozamot súlymódosítás nem írhatja felül.')
  assert.match(await page.locator('[data-food-recipe-yield-hint]').textContent(), /Kézi hozam/)
  await yieldInput.fill('')
  assert.equal(await yieldInput.inputValue(), '32', 'A hozam törlése visszakapcsolja az automatikus számítást.')
  await page.locator('[data-food-recipe-weight-input]').fill('750')
  assert.equal(await yieldInput.inputValue(), '30')
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /30 szelet/)
  assert.doesNotMatch(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek:/)
  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Keresővel készített tesztrecept' })
    .waitFor({ state: 'visible' })

  const savedCard = await page.locator('[data-food-recipes] .food-recipe--compact').first().textContent()
  assert.match(savedCard, /kcal\/szelet/)
  assert.doesNotMatch(savedCard, /— kcal\/szelet/)
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-food-recipe-yield-input]').inputValue(), '30')
  await page.locator('[data-food-recipe-tab="ingredient"]').click()
  await input.fill('voroshagyma')
  const savedOnion = dropdown.locator('option', { hasText: /Vöröshagyma/ }).first()
  await savedOnion.waitFor({ state: 'attached' })
  assert.ok((await savedOnion.getAttribute('value'))?.startsWith('food-'),
    'A recepthez hozzáadott USDA-étel legközelebb már mentett hozzávaló legyen.')
  // Saved ingredients must expose editable nutrients per 100 g without
  // rewriting the previously saved catalogue record.
  await dropdown.selectOption(await savedOnion.getAttribute('value'))
  const kcal = page.locator('[data-food-recipe-nutrient-energyKcal]')
  assert.ok((await kcal.inputValue()).length > 0, 'Saved USDA nutrients should pre-fill the editable field.')
  const originalKcal = await kcal.inputValue()
  await kcal.fill('135')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('dkg')
  await page.locator('[data-food-recipe-ingredient-amount]').fill('2')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /2 dkg/)
  await input.fill('vöröshagyma')
  await savedOnion.waitFor({ state: 'attached' })
  await dropdown.selectOption(await savedOnion.getAttribute('value'))
  assert.equal(await kcal.inputValue(), originalKcal,
    'Per-recipe nutrient overrides must not overwrite the saved USDA food.')

  // No search result is required when adding a new, manual ingredient.
  await input.fill('Kézi teszt hozzávaló 20261017')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('tbsp')
  await page.locator('[data-food-recipe-ingredient-amount]').fill('2')
  await page.locator('[data-food-recipe-conversion-label]:visible').waitFor()
  await page.locator('[data-food-recipe-conversion-amount]').fill('12')
  await kcal.fill('210')
  await page.locator('[data-food-recipe-nutrient-protein]').fill('')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Kézi teszt hozzávaló 20261017/)
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /2 evőkanál/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Összesen:/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek:.*Kézi teszt hozzávaló/s)
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Hiányzó adatok/)

  // Recipe scanner must stay inline without switching to full catalogue.
  const popup = page.waitForEvent('dialog')
  const clickScan = page.locator('[data-food-recipe-scan]').click()
  await (await popup).accept('5998888888888')
  await clickScan
  await dropdown.locator('option', { hasText: /Teszt keksz/ }).first().waitFor({ state: 'attached' })
  await page.waitForFunction(() => Boolean(document.querySelector('[data-food-recipe-ingredient-food]')?.value))
  assert.notEqual(await dropdown.inputValue(), '', 'Scanned product must be selected explicitly by the scanner.')
  assert.equal(await page.locator('[data-food-add-sheet].is-open').count(), 0,
    'Inline scanner must not open the full catalog.')
  assert.equal(await page.locator('[data-food-recipe-edit-sheet].is-open').count(), 1,
    'Recipe editor must remain open after barcode scan.')
  assert.equal(await page.locator('[data-food-recipe-open-catalog]').count(), 0,
    'The former full catalogue button must be removed.')
  await page.locator('[data-food-recipe-ingredient-unit]').selectOption('kg')
  assert.equal(await page.locator('[data-food-recipe-conversion-label]').isVisible(), false,
    'Metric conversions should not ask for invented per-food sizes.')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Teszt keksz/)

  const warningDialog = page.waitForEvent('dialog')
  const saveWithUnknown = page.locator('[data-food-recipe-editor-save]').click()
  const dialog = await warningDialog
  assert.match(dialog.message(), /hiányzik tápérték/i)
  assert.match(dialog.message(), /Kézi teszt hozzávaló 20261017/)
  await dialog.accept()
  await saveWithUnknown
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Keresővel készített tesztrecept' }).waitFor()
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-tab="list"]').click()
  await page.locator('[data-food-recipe-ingredients]').getByText('Kézi teszt hozzávaló 20261017').waitFor()

  // Regression for the user-reported Puha kenyér: older manual Só/Cukor/Víz
  // ingredients were saved without nutrients, causing — macros for the whole
  // recipe. Recover them explicitly without changing unrelated recipes.
  await page.locator('[data-food-recipe-editor-back]').click()
  await page.locator('[data-food-recipe-back]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor()
  await page.locator('[data-food-recipe-name-input]').fill('Puha kenyér helyreállítás')
  await page.locator('[data-food-recipe-weight-input]').fill('750')
  await page.locator('[data-food-recipe-yield-unit]').selectOption('slice')
  await page.locator('[data-food-recipe-unit-weight]').fill('25')
  assert.equal(await page.locator('[data-food-recipe-yield-input]').inputValue(), '30')
  await page.locator('[data-food-recipe-tab="ingredient"]').click()

  for (const [name, amount] of [['Só', '5'], ['Cukor', '5'], ['Víz', '350']]) {
    await input.fill(name)
    // Deliberately do NOT select the new offline result, reproducing the
    // previously saved manual ingredient with unknown macros.
    assert.equal(await dropdown.inputValue(), '')
    await page.locator('[data-food-recipe-ingredient-amount]').fill(amount)
    await page.locator('[data-food-recipe-ingredient-add]').click()
  }
  await input.fill('BL55')
  const flourOption = dropdown.locator('option', { hasText: /Búzafinomliszt BL55/ }).first()
  await flourOption.waitFor({ state: 'attached' })
  await dropdown.selectOption(await flourOption.getAttribute('value'))
  await page.locator('[data-food-recipe-ingredient-amount]').fill('400')
  await page.locator('[data-food-recipe-ingredient-add]').click()
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek/)
  await page.locator('[data-food-recipe-tab="list"]').click()
  const repairButton = page.locator('[data-food-recipe-nutrients-repair]')
  await repairButton.waitFor({ state: 'visible' })
  assert.match(await repairButton.textContent(), /3 ismert hozzávaló/)

  // Cancel must never change a saved or unsaved ingredient.
  const cancelDialog = page.waitForEvent('dialog')
  const firstClick = repairButton.click()
  await (await cancelDialog).dismiss()
  await firstClick
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(), /Hiányzó adatok/)
  // Accept creates recipe-local copies; the user must still save the recipe.
  const acceptDialog = page.waitForEvent('dialog')
  const secondClick = repairButton.click()
  const repairConfirmation = await acceptDialog
  assert.match(repairConfirmation.message(), /Só, Cukor, Víz/)
  await repairConfirmation.accept()
  await secondClick
  assert.equal(await repairButton.isVisible(), false)
  assert.doesNotMatch(await page.locator('[data-food-recipe-ingredients]').textContent(), /Hiányzó adatok/)
  assert.doesNotMatch(await page.locator('[data-food-recipe-summary]').textContent(), /Hiányzó tápértékek/)
  assert.match(await page.locator('[data-food-recipe-summary]').textContent(), /30 szelet/)
  assert.doesNotMatch(await page.locator('[data-food-recipe-summary]').textContent(), /Összesen: — kcal/)

  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('[data-food-recipe-title]').filter({ hasText: 'Puha kenyér helyreállítás' }).waitFor()
  const repairedCard = page.locator('[data-food-recipes] .food-recipe--compact').first()
  assert.match(await repairedCard.textContent(), /Puha kenyér helyreállítás/)
  assert.match(await repairedCard.textContent(), /kcal\/szelet/)
  assert.doesNotMatch(await repairedCard.textContent(), /— kcal\/szelet/)
  console.log('Recipe staple repair: Só/Cukor/Víz offline, explicit consent, nonzero bread macros, 30 slices OK')

  // Full-page food search: a single favorite must never stretch to fill an
  // enormous blank box; the height remains the same for many local records.
  await page.locator('[data-food-recipe-back]').click()
  await page.locator('[data-food-recipes-back]').click()
  await page.locator('[data-food-meals] .meal').first().click()
  await page.locator('[data-food-detail-add]').click()
  await page.locator('[data-food-add-sheet].is-open').waitFor({ state: 'visible' })
  const searchArea = page.locator('[data-food-search-results]')
  const initialLayout = await searchArea.evaluate(el => ({
    height: Math.round(el.getBoundingClientRect().height),
    rowHeight: Math.round(el.querySelector('.sheet-result')?.getBoundingClientRect().height || 0),
  }))
  const newBread = searchArea.locator('.sheet-result', { hasText: 'Puha kenyér helyreállítás' }).first()
  await newBread.locator('.sheet-result__favorite').click()
  await page.locator('[data-food-quick="favorites"]').click()
  const favoriteLayout = await searchArea.evaluate(el => ({
    height: Math.round(el.getBoundingClientRect().height),
    rowHeight: Math.round(el.querySelector('.sheet-result')?.getBoundingClientRect().height || 0),
  }))
  assert.equal(initialLayout.height, favoriteLayout.height,
    'A találatlista magassága ne függjön a rekordok számától.')
  assert.ok(favoriteLayout.height >= 220 && favoriteLayout.height <= 320, JSON.stringify(favoriteLayout))
  assert.ok(favoriteLayout.rowHeight < 85,
    'Az egyetlen kedvenc sora ne nyúljon meg a teljes lista magasságára.')

  // Search for manually added sugar after offline nutrient repair: the best
  // complete entry should be visible, with every old version recoverable.
  await page.locator('[data-food-quick="favorites"]').click()
  await page.locator('[data-food-search]').fill('cukor')
  const variants = page.locator('[data-food-search-results] .food-search-variants-toggle')
  await variants.first().waitFor({ state: 'visible' })
  assert.match(await variants.first().textContent(), /További 1 változat/)
  const completeSugar = searchArea.locator('.sheet-result', { hasText: 'Cukor' }).first()
  assert.match(await completeSugar.textContent(), /387 kcal/)
  await variants.first().click()
  assert.equal(await searchArea.locator('.food-search-legacy-variant').count(), 1,
    'A régi hiányos verzió továbbra is elérhető, nem törlődik.')
  assert.match(await searchArea.locator('.food-search-legacy-variant').textContent(), /nincs kalóriaadat/)

  // Live scanner stays in the same slot below the filters. Only its close
  // action gets the same styled touch target as the surrounding controls.
  assert.equal(await page.evaluate(() => {
    const panel = document.querySelector('[data-food-live-scanner]')
    const results = document.querySelector('[data-food-search-results]')
    return Boolean(panel.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING)
  }), true)
  await page.evaluate(() => { document.querySelector('[data-food-live-scanner]').hidden = false })
  const close = page.locator('[data-food-live-stop]')
  await close.waitFor({ state: 'visible' })
  const closeStyle = await close.evaluate(el => ({
    width: el.getBoundingClientRect().width,
    radius: getComputedStyle(el).borderRadius,
    border: getComputedStyle(el).borderStyle,
  }))
  assert.ok(closeStyle.width > 250 && closeStyle.border === 'solid' && closeStyle.radius !== '0px',
    'Az olvasó bezárása teljes szélességű, egységes stílusú érintőgomb legyen.')
  await close.click()
  assert.equal(await page.locator('[data-food-live-scanner]').isVisible(), false)

  // Full end-to-end recipe draft import and local image. No remote save
  // occurs until the user explicitly saves the recipe.
  await page.locator('[data-food-add-back]').click()
  await page.locator('[data-food-back]').click()
  await page.locator('[data-food-open-recipes]').click()
  await page.locator('[data-food-recipes-new]').click()
  await page.locator('[data-food-recipe-edit-sheet].is-open').waitFor({state:'visible'})
  assert.equal(await page.locator('[data-food-recipe-tabs] [role="tab"]').count(),5)
  assert.equal(await page.locator('[data-food-recipe-panel="basics"]').isVisible(),true)
  assert.equal(await page.locator('[data-food-recipe-panel="import"]').isVisible(),false)
  await page.locator('[data-food-recipe-tab="import"]').click()
  await page.locator('[data-food-recipe-import-text]').fill(
    'Importált puha kenyér\\nHozzávalók:\\n400 g búzafinomliszt\\n5 g cukor\\n5 g só\\nElkészítés:\\nKeverd és süsd.'
      .replaceAll('\\n','\n'))
  await page.locator('[data-food-recipe-import-read]').click()
  await page.locator('[data-food-recipe-import-preview]').waitFor({state:'visible'})
  assert.match(await page.locator('[data-food-recipe-import-preview]').textContent(),/3/)
  await page.locator('[data-food-recipe-tab="basics"]').click()
  assert.equal(await page.locator('[data-food-recipe-name-input]').inputValue(),'',
    'Beolvasás után még ne módosuljon a recept a jóváhagyás előtt.')
  await page.locator('[data-food-recipe-tab="import"]').click()
  await page.locator('[data-food-recipe-import-apply]').click()
  assert.equal(await page.locator('[data-food-recipe-tab="list"]').getAttribute('aria-selected'),'true')
  assert.match(await page.locator('[data-food-recipe-ingredients]').textContent(),/cukor/i)
  await page.locator('[data-food-recipe-tab="basics"]').click()
  assert.equal(await page.locator('[data-food-recipe-name-input]').inputValue(),'Importált puha kenyér')
  await page.locator('[data-food-recipe-tab="image"]').click()
  const photo=await page.screenshot()
  await page.locator('[data-food-recipe-image-file]').setInputFiles({
    name:'recept.png',mimeType:'image/png',buffer:photo,
  })
  await page.locator('[data-food-recipe-image-preview]').waitFor({state:'visible',timeout:10000})
  assert.match(await page.locator('[data-food-recipe-image-preview]').getAttribute('src'),/^data:image\/jpeg;base64,/)
  // The file button is one source picker, not a second full import form.
  await page.locator('[data-food-recipe-tab="import"]').click()
  await page.locator('[data-food-recipe-import-file]').setInputFiles({
    name:'masik-recept.txt',mimeType:'text/plain',
    buffer:Buffer.from('Mákos tészta\nHozzávalók:\n100 g mák\nElkészítés:\nKeverd össze.'),
  })
  await page.locator('[data-food-recipe-import-preview]').waitFor({state:'visible'})
  assert.match(await page.locator('[data-food-recipe-import-preview]').textContent(),/Mákos tészta/)
  await page.locator('[data-food-recipe-tab="basics"]').click()
  assert.equal(await page.locator('[data-food-recipe-name-input]').inputValue(),'Importált puha kenyér',
    'Új fájl puszta kiválasztása nem írhatja át a korábbi átvett piszkozatot.')
  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('[data-food-recipe-title]').filter({hasText:'Importált puha kenyér'}).waitFor()
  await page.locator('[data-food-recipe-detail-image]').waitFor({state:'visible'})
  assert.match(await page.locator('[data-food-recipe-detail-image]').getAttribute('src'),/^data:image\/jpeg;base64,/)
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-tab="image"]').click()
  await page.locator('[data-food-recipe-image-preview]').waitFor({state:'visible'})
  // PDF-style rich clipboard content: paragraphs, numbered steps and bold
  // labels survive Save, re-opening and the recipe detail view. Unsafe markup
  // never executes or gets stored as a rendered node.
  await page.locator('[data-food-recipe-tab="basics"]').click()
  await page.locator('[data-food-recipe-instructions-input]').focus()
  await page.evaluate(() => {
    const editor = document.querySelector('[data-food-recipe-instructions-input]')
    editor.innerHTML = ''
    const event = new Event('paste', { bubbles:true, cancelable:true })
    Object.defineProperty(event,'clipboardData',{value:{
      getData: type => type === 'text/html'
        ? '<p>1. <strong>Összeállítás:</strong> Keverd össze.</p><p>2. <span style="font-weight:700">Sütés:</span> 200 °C.</p><img src=x onerror="window.__badPaste = true"><script>window.__badPaste = true</script>'
        : '1. Összeállítás: Keverd össze.\\n2. Sütés: 200 °C.',
    }})
    editor.dispatchEvent(event)
  })
  const richEditor = page.locator('[data-food-recipe-instructions-input]')
  assert.equal(await richEditor.locator('strong').count(), 2)
  assert.equal(await richEditor.locator('img,script').count(), 0)
  assert.equal(await page.evaluate(() => Boolean(window.__badPaste)),false)
  await page.locator('[data-food-recipe-editor-save]').click()
  await page.locator('.food-recipe-instructions-output').waitFor()
  const detail = page.locator('.food-recipe-instructions-output')
  assert.ok((await detail.innerHTML()).includes('<strong>Összeállítás:</strong>'))
  assert.ok((await detail.textContent()).includes('2. Sütés:'))
  await page.locator('[data-food-recipe-edit]').click()
  await page.locator('[data-food-recipe-tab="basics"]').click()
  assert.equal(await page.locator('[data-food-recipe-instructions-input] strong').count(),2)
  assert.match(await page.locator('[data-food-recipe-instructions-input]').innerText(),/Összeállítás:/)
  console.log('Rich recipe instructions: PDF-like paste, sanitization, save/reopen and paragraph layout OK')

  console.log('Recipe tabs/import: JSON/text file preview, explicit apply, saved local picture and reopen OK')

  console.log('Food add UX: fixed-height results, safe duplicates, styled scanner close, five recipe tabs OK')
  console.log('Recipe ingredient editor: search, editable nutrients, manual fallback, conversions and inline barcode OK')
} finally {
  await browser?.close()
  server.kill()
}
