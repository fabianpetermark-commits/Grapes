import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4184/Grapes/design/android-mobile-preview.html'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4184', '--strictPort'], {
  cwd: projectRoot,
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', chunk => {
    serverOutput = (serverOutput + chunk.toString()).slice(-4000)
  })
}
let browser

try {
  let lastProbe = 'Nem érkezett válasz.'
  let serverReady = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) break
    try {
      const response = await fetch(url)
      if (response.ok) {
        serverReady = true
        break
      }
      lastProbe = `HTTP ${response.status} (${response.url})`
    } catch (error) {
      lastProbe = error.message
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  if (!serverReady) {
    throw new Error(`A Home mobil tesztszervere nem érhető el: ${lastProbe}; Vite kilépési kód: ${server.exitCode ?? 'fut'}; Vite kimenet:\n${serverOutput || '(nincs kimenet)'}`)
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  await context.addInitScript(() => { window.__GRAPES_RECEIPT_OCR_TEST__ = async image => image.includes('Yg==') ? 'Tej 2 x 1 l 998 Ft\nVégösszeg 998 Ft' : image.includes('Yw==') ? 'ALDI Bolt\nKenyér 499 Ft\nSzendvics\nVégösszeg 499 Ft\nBankkártya 499 Ft' : 'Végösszeg 5990 Ft' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('grapes-projects', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' })
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    const project = {
      id: 'food-tracker-local-food-profile', module: 'Ételnapló', name: 'Ételnapló',
      data: {
        version: 2, profile: { id: 'local-food-profile', name: 'Helyi profil', email: '', photo: '' },
        customFoods: [{ id: 'm2-chicken', name: 'Csirkemell', baseUnit: 'g' }],
        recipes: [{ id: 'm2-recipe', foodId: 'm2-prepared', ownerProfileId: 'local-food-profile', name: 'Csirkés étel', category: 'Ebéd', ingredients: [{ id: 'm2-ingredient', foodId: 'm2-chicken', amount: 500, unit: 'g' }], yieldCount: 4, yieldUnit: 'serving', revision: 1, createdAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z' }],
        diaryEntries: [{ id: 'm2-entry', profileId: 'local-food-profile', mealType: 'lunch', occurredAt: '2026-10-19T12:00:00.000Z', amount: 1, unit: 'serving', snapshot: { foodId: 'm2-prepared', name: 'Csirkés étel', category: 'Ebéd', source: { type: 'recipe', id: 'm2-recipe' }, baseAmount: 100, baseUnit: 'g', nutrients: { energyKcal: 100 } } }],
      },
    }
    await new Promise((resolveWrite, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put(project)
      tx.objectStore('projects').put({ id: 'finance-tracker-current', module: 'Pénzügyi Napló', name: 'Pénzügyi napló', data: { version: 2, currency: 'HUF', transactions: [
        { id: 'receipt-total', type: 'expense', amount: 5990, date: '2026-10-19', category: 'Élelmiszer', receipt: { name: 'osszeg.png', type: 'image/png', size: 1, data: 'data:image/png;base64,YQ==' } },
        { id: 'receipt-lines', type: 'expense', amount: 998, date: '2026-10-19', category: 'Élelmiszer', receipt: { name: 'tetelek.png', type: 'image/png', size: 1, data: 'data:image/png;base64,Yg==' } },
        { id: 'receipt-manual', type: 'expense', amount: 499, date: '2026-10-19', category: 'Élelmiszer', receipt: { name: 'manual.png', type: 'image/png', size: 1, data: 'data:image/png;base64,Yw==' } },
      ] } })
      tx.oncomplete = resolveWrite
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  assert.equal(await page.locator('[data-nav="home"]').count(), 1)
  assert.equal(await page.locator('[data-module="food"]').count(), 1)
  assert.equal(await page.locator('[data-module="finance"]').count(), 1)
  await page.locator('[data-page="home"] [data-module="household"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-household-root]').textContent(), /Ezen az eszközön tárolva/)

  await page.locator('[data-household-tab="shopping"]').click()
  await page.locator('[data-household-add="shopping"]').click()
  await page.locator('[data-household-form] [name="name"]').fill('Csirkemell')
  await page.locator('[data-household-form] [name="quantity"]').fill('1')
  await page.locator('[data-household-form] [name="unit"]').selectOption('kg')
  await page.locator('[data-household-form] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-items] .household-card').count(), 1)
  await page.locator('[data-household-check]').click()
  assert.match(await page.locator('[data-household-items]').textContent(), /Elintézve/)
  await page.locator('[data-household-tab="inventory"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 0, 'A bevásárlólista nem készlet.')

  await page.locator('[data-household-add="inventory"]').click()
  await page.locator('[data-household-form] [name="name"]').fill('Csirkemell')
  await page.locator('[data-household-form] [name="quantity"]').fill('1')
  await page.locator('[data-household-form] [name="unit"]').selectOption('kg')
  await page.locator('[data-household-form] [name="storageLocation"]').selectOption('fridge')
  await page.locator('[data-household-form] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1)

  await page.locator('[data-household-split-id]').click()
  await page.locator('[data-household-split] [name="fridgeQuantity"]').fill('600')
  assert.equal(await page.locator('[data-household-split] [name="unit"]').inputValue(), 'g')
  assert.match(await page.locator('[data-household-split-preview]').textContent(), /600 g hűtő · 400 g fagyasztó/)
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1, 'Az előnézet nem írhat készletet.')
  await page.locator('[data-household-split] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 2)
  assert.match(await page.locator('[data-household-lots]').textContent(), /0,6 kg/)
  assert.match(await page.locator('[data-household-lots]').textContent(), /0,4 kg/)
  await page.locator('[data-household-undo]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1)
  assert.match(await page.locator('[data-household-lots]').textContent(), /1 kg/)

  await page.locator('[data-household-split-id]').click()
  await page.locator('[data-household-preset="half"]').click()
  await page.locator('[data-household-split] button[type="submit"]').click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-page="home"] [data-module="household"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 2, 'A készlet nem maradt meg újraindítás után.')
  await page.locator('[data-household-tab="shopping"]').click()
  assert.match(await page.locator('[data-household-items]').textContent(), /Elintézve/)
  await page.locator('[data-household-tab="inventory"]').click()

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))
    assert.ok(layout.content <= layout.viewport, `A Home vízszintesen kilóg ${width}px szélességen.`)
  }
  await page.locator('[data-household-add="inventory"]').click()
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true)
  assert.equal(await page.locator('[data-household-form]').isVisible(), false)
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true)
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="household"]').isVisible(), false)
  assert.ok((await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))?.includes('Csirkemell'))
  const homeBeforeRecipe = await page.evaluate(() => localStorage.getItem('grapes-home-household-v1'))
  await page.locator('[data-page="home"] [data-module="household"]').click()
  await page.locator('[data-household-tab="recipes"]').click()
  await page.locator('[data-household-recipe-items] .household-recipe-card').waitFor()
  assert.match(await page.locator('[data-household-recipe-items]').textContent(), /Csirkés étel/)
  assert.match(await page.locator('[data-household-recipe-items]').textContent(), /Ellenőrizendő/)
  assert.match(await page.locator('[data-household-recipe-items]').textContent(), /lehetséges névegyezés/)
  await page.locator('[data-household-cook-recipe="m2-recipe"]').click()
  await page.locator('[data-household-cooking] [name="unit"]').selectOption('g')
  await page.locator('[data-household-cooking] [name="quantity"]').fill('300')
  assert.match(await page.locator('[data-household-cooking-preview]').textContent(), /Mentés csak megerősítés után/)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')), homeBeforeRecipe, 'A főzési előnézet nem írhat készletet.')
  await page.locator('[data-household-cooking] button[type="submit"]').click()
  const afterCooking = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(afterCooking.prepared.length, 1)
  assert.equal(afterCooking.prepared[0].portionsRemaining, 4)
  assert.equal(afterCooking.inventory.reduce((sum, lot) => sum + lot.quantityBase, 0), 700)
  await page.locator('[data-household-undo]').click()
  const afterUndoCooking = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(afterUndoCooking.prepared.length, 0)
  assert.equal(afterUndoCooking.inventory.reduce((sum, lot) => sum + lot.quantityBase, 0), 1000)
  await page.locator('[data-household-cook-recipe="m2-recipe"]').click()
  await page.locator('[data-household-cooking] [name="unit"]').selectOption('g')
  await page.locator('[data-household-cooking] [name="quantity"]').fill('300')
  await page.locator('[data-household-cooking] button[type="submit"]').click()
  await page.locator('[data-household-tab="inventory"]').click()
  await page.locator('[data-household-link-prepared]').click()
  await page.locator('[data-household-link] [name="foodEntryId"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-household-link-preview]').textContent(), /4 → 3 adag/)
  const beforeLink = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(beforeLink.prepared[0].portionsRemaining, 4)
  await page.locator('[data-household-link] button[type="submit"]').click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('grapes-home-household-v1') || '{}').prepared?.[0]?.portionsRemaining === 3)
  const afterLink = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(afterLink.prepared[0].portionsRemaining, 3)
  assert.deepEqual(afterLink.inventory, beforeLink.inventory, 'A Food-napló hozzárendelése nem vonhat nyers készletet.')
  await page.locator('[data-household-undo]').click()
  const afterUndoLink = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(afterUndoLink.prepared[0].portionsRemaining, 4)
  assert.deepEqual(afterUndoLink.inventory, beforeLink.inventory)
  await page.locator('[data-household-tab="receipts"]').click()
  await page.locator('[data-household-receipt-items] .household-card').first().waitFor()
  const beforeReceipt = await page.evaluate(() => localStorage.getItem('grapes-home-household-v1'))
  await page.locator('[data-household-scan-receipt="receipt-total"]').click()
  await page.locator('[data-household-alert]').getByText(/Végösszegből nem lesz készlet/).waitFor()
  assert.equal(await page.locator('[data-household-receipt-candidates] .household-card').count(), 0)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')), beforeReceipt)
  await page.locator('[data-household-scan-receipt="receipt-lines"]').click()
  await page.locator('[data-household-review-line]').waitFor()
  assert.match(await page.locator('[data-household-receipt-candidates]').textContent(), /Ellenőrizendő/)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')), beforeReceipt)
  await page.locator('[data-household-review-line]').click()
  assert.equal(await page.locator('[data-household-receipt-form] [name="quantity"]').inputValue(), '2')
  await page.locator('[data-household-receipt-form] [name="storageLocation"]').selectOption('fridge')
  await page.locator('[data-household-receipt-form] button[type="submit"]').click()
  const afterReceipt = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  assert.equal(afterReceipt.inventory.find(lot => lot.sourceType === 'finance-receipt' && lot.sourceId.startsWith('receipt-lines:ocr-'))?.quantityBase, 2000)
  assert.equal(await page.locator('[data-household-review-line]').isDisabled(), true)
  await page.locator('[data-household-scan-receipt="receipt-lines"]').click()
  await page.locator('[data-household-review-line]').waitFor()
  assert.equal(await page.locator('[data-household-review-line]').isDisabled(), true, 'Azonos bizonylatsor nem vehető fel kétszer.')
  const beforeManual = await page.evaluate(() => localStorage.getItem('grapes-home-household-v1'))
  await page.locator('[data-household-scan-receipt="receipt-manual"]').click()
  await page.locator('[data-household-receipt-candidates] > .household-card').getByText('Kenyér', { exact: true }).waitFor()
  assert.match(await page.locator('[data-household-receipt-candidates]').textContent(), /Kenyér/)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')), beforeManual, 'A mennyiség nélküli OCR előnézet nem módosíthat készletet.')
  await page.locator('[data-household-receipt-candidates] > .household-card [data-household-review-line]').click()
  assert.equal(await page.locator('[data-household-receipt-form] [name="name"]').inputValue(), 'Kenyér')
  assert.equal(await page.locator('[data-household-receipt-form] [name="quantity"]').inputValue(), '')
  assert.equal(await page.locator('[data-household-receipt-form] [name="unit"]').inputValue(), '')
  assert.equal(await page.locator('[data-household-receipt-form] [name="storageLocation"]').inputValue(), '')
  assert.equal(await page.locator('[data-household-receipt-form]').evaluate(form => form.checkValidity()), false)
  await page.locator('[data-household-receipt-form] [name="quantity"]').fill('1')
  await page.locator('[data-household-receipt-form] [name="unit"]').selectOption('db')
  await page.locator('[data-household-receipt-form] [name="storageLocation"]').selectOption('pantry')
  await page.locator('[data-household-receipt-form] button[type="submit"]').click()
  const manualSaved = JSON.parse(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))
  const breadLot = manualSaved.inventory.find(lot => lot.sourceType === 'finance-receipt' && lot.sourceId.startsWith('receipt-manual:ocr-'))
  assert.equal(breadLot.name, 'Kenyér')
  assert.equal(breadLot.quantityBase, 1)
  assert.equal(breadLot.storageLocation, 'pantry')
  await page.locator('[data-household-scan-receipt="receipt-manual"]').click()
  await page.locator('[data-household-receipt-candidates] > .household-card [data-household-review-line]').waitFor()
  assert.equal(await page.locator('[data-household-receipt-candidates] > .household-card [data-household-review-line]').isDisabled(), true, 'A kézzel kiegészített OCR-sor sem vehető fel kétszer.')
  await page.locator('[data-household-unmatched] summary').click()
  await page.locator('[data-household-unmatched] [data-household-review-line]').last().click()
  assert.equal(await page.locator('[data-household-receipt-form] [name="name"]').inputValue(), '')
  assert.equal(await page.locator('[data-household-receipt-form] [name="quantity"]').inputValue(), '')
  await page.locator('[data-household-receipt-form] [data-household-cancel]').click()
  const homeAfterUndo = await page.evaluate(() => localStorage.getItem('grapes-home-household-v1'))
  await page.locator('[data-household-tab="recipes"]').click()
  await page.locator('[data-household-open-recipe="m2-recipe"]').click()
  await page.locator('[data-food-recipe-detail]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-food-recipe-title]').textContent(), 'Csirkés étel')
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')), homeAfterUndo, 'Recept megnyitása nem módosíthat Home-készletet.')
  console.log('Home TEST browser flow: készlet, 600/400, lista, mentés, undo, visszalépés, 320–412 px rendben.')
  console.log('Home M2 Food bridge: helyi recept, ellenőrizendő készlet és írás nélküli Food-megnyitás rendben.')
  console.log('Home M2 főzés: előnézet, megerősített nyers levonás, készétel és visszavonás rendben.')
  console.log('Home M2 H-17: mentett Food-bejegyzés explicit kapcsolása, 4→3 adag és visszavonás rendben; nyers készlet változatlan.')
  console.log('Home M2 H-13/H-14: végösszegből nincs készlet; tételes OCR-sor csak megerősítve, egyszer kerül készletbe.')
  console.log('Home M2.1: ár alapú és nyers OCR-sor manuális javítása, kötelező egység/tárolóhely, ismétlésvédelem rendben.')
} finally {
  await browser?.close()
  server.kill()
}
