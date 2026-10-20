import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4195', '--strictPort'], { stdio: 'ignore' })
const url = 'http://127.0.0.1:4195/Grapes/design/android-mobile-preview.html'
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 79) throw new Error('Vite nem indult el.')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle' }); await page.locator('[data-local]').click()
  await page.locator('[data-nav="sync"]').click()
  const rows = Array.from({ length: 151 }, (_, index) => ({ date: '2024-01-02', logged_at: '2024-01-02 12:00:00', meal: 'lunch', entry_id: `mobile-${index}`, source_id: 'p1', product: 'YAZIO alma', type: 'product', amount: 100, energy_kcal: 88.00001, protein_g: null, carbs_g: 19, fat_g: 0 }))
  const source = JSON.stringify({ meta: [{ tool_version: '0.2.0', from: '2024-01-01', to: '2024-01-03' }], tables: [{ name: 'nutrition_log' }], nutrition_log: rows, daily_summary: [], products: [], recipes: [], warnings: [] })
  const selectFile = () => page.locator('[data-yazio-input]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(source) })
  const readProject = () => page.evaluate(async () => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    return (await loadLocalProject('food-tracker-local-food-profile'))?.data
  })
  await selectFile()
  await page.locator('[data-food-yazio-sheet].is-open').waitFor()
  assert.equal((await readProject()).diaryEntries.length, 0, 'Az előnézet nem menthet naplórekordot.')
  assert.equal(await page.locator('[data-yazio-records] input').count(), 100)
  await page.locator('[data-yazio-next]').click()
  assert.equal(await page.locator('[data-yazio-records] input').count(), 51)
  await page.locator('[data-yazio-cancel]').click()
  assert.equal((await readProject()).diaryEntries.length, 0)
  await selectFile()
  await page.waitForTimeout(300)
  const sheetBounds = await page.locator('[data-food-yazio-sheet]').boundingBox()
  assert.ok(sheetBounds.y >= 0 && sheetBounds.y + sheetBounds.height <= 845, 'Az importpanelnek a kijelzőn belül kell maradnia.')
  await page.screenshot({ path: 'mobile-yazio-preview.png', fullPage: true })
  await page.evaluate(() => {
    window.originalYazioPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (value?.id?.includes(':yazio-backup:')) throw new DOMException('Teszt tárhelykvóta', 'QuotaExceededError')
      return window.originalYazioPut.call(this, value, ...args)
    }
  })
  await page.locator('[data-yazio-confirm]').click()
  await page.locator('[data-yazio-progress]').filter({ hasText: 'Teszt tárhelykvóta' }).waitFor()
  assert.equal((await readProject()).diaryEntries.length, 0, 'Sikertelen biztonsági mentés után nincs importírás.')
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalYazioPut })
  const download = page.waitForEvent('download')
  await page.locator('[data-yazio-confirm]').click()
  const backup = await download
  assert.match(backup.suggestedFilename(), /before-yazio/)
  await page.waitForFunction(() => !document.querySelector('[data-food-yazio-sheet]').classList.contains('is-open'))
  let project = await readProject()
  assert.equal(project.diaryEntries.length, 151)
  assert.equal(project.diaryEntries[0].snapshot.nutrients.protein, null)
  assert.equal(project.diaryEntries[0].snapshot.nutrients.energyKcal, 88.00001)
  assert.equal(project.importBatches[0].status, 'completed')
  await page.reload({ waitUntil: 'networkidle' })
  if (await page.locator('[data-local]').isVisible()) await page.locator('[data-local]').click()
  await page.locator('[data-nav="sync"]').click(); await selectFile()
  await page.locator('[data-food-yazio-sheet].is-open').waitFor()
  assert.match(await page.locator('[data-yazio-summary]').textContent(), /151 korábbi/)
  assert.equal(await page.locator('[data-yazio-records] input:checked').count(), 0)
  await page.locator('[data-yazio-cancel]').click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('[data-yazio-import]').click()
  await page.locator('[data-yazio-api-files]').click()
  await page.locator('[data-sync-import-sheet].is-open').waitFor()
  project = await readProject()
  console.log('YAZIO undo diagnostic', JSON.stringify({ batches: project.importBatches.length, recordIds: project.importBatches[0].recordIds.length, entryIds: project.diaryEntries.length, matchingIds: project.diaryEntries.filter(entry => project.importBatches[0].recordIds.includes(entry.id)).length, originBatchIds: [...new Set(project.diaryEntries.map(entry => entry.origin?.importBatchId))], batchId: project.importBatches[0].id }))
  console.log('YAZIO pure undo diagnostic', await page.evaluate(async () => { const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js'); const { undoYazioBatch } = await import('/Grapes/src/food/food-yazio-import.js'); const current = (await loadLocalProject('food-tracker-local-food-profile')).data; const batch = current.importBatches[0]; const result = undoYazioBatch(current, batch.id); return { removed: result.removed, modified: result.modified.length, remaining: result.project.diaryEntries.length } }))
  await page.locator('[data-yazio-undo]').click()
  await page.waitForFunction(async () => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    return (await loadLocalProject('food-tracker-local-food-profile'))?.data?.importBatches?.[0]?.status === 'undone'
  })
  project = await readProject()
  console.log('YAZIO post-undo diagnostic', JSON.stringify({ status: project.importBatches[0]?.status, entries: project.diaryEntries.length, matchingIds: project.diaryEntries.filter(entry => project.importBatches[0]?.recordIds?.includes(entry.id)).length }))
  assert.equal(project.diaryEntries.length, 0)
  await page.route('https://search.openfoodfacts.org/search**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1, hits: [{ code: '5991234567890', product_name_hu: 'OFF teszt', nutriments: { 'energy-kcal_100g': 100 } }] }) }))
  await page.locator('[data-nav="home"]').click()
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-menu-destination="food"]').click()
  await page.locator('[data-food-meals] .meal').first().click(); await page.locator('[data-fab]').click()
  await page.locator('[data-food-search]').fill('keksz')
  await page.locator('[data-food-search-results]').getByRole('button').filter({ hasText: 'OFF teszt' }).click()
  assert.equal((await readProject()).customFoods.length, 0, 'Online termék megnyitásakor még nem menthet a katalógusba.')
  await page.locator('[data-food-edit-save]').click()
  await page.waitForTimeout(500)
  project = await readProject()
  assert.equal(project.customFoods.length, 1)
  assert.equal(project.customFoods[0].source.type, 'openfoodfacts')
  assert.equal(project.diaryEntries[0].snapshot.source.id, '5991234567890')
  assert.deepEqual(errors, [])
  console.log('Android YAZIO: előnézet, lapozás, megszakítás, backup, 150+1-es köteg, újratöltés, duplikáció és visszavonás sikeres.')
} finally { await browser?.close(); server.kill() }
