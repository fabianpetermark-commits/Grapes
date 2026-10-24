import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for Food local CAS UI test')
const base = 'http://127.0.0.1:4197'
const server = spawn(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4197', '--strictPort'
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1',
    VITE_GRAPES_TEST_FOOD_LOCAL_CAS_ENABLED: 'true' } })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before Food CAS test')
    try { if ((await fetch(base)).ok) break } catch {}
    if (attempt === 79) throw new Error('Vite did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const a = await context.newPage()
  const b = await context.newPage()
  await a.goto(base + '/Grapes/design/android-mobile-preview.html')
  await a.evaluate(async () => {
    const [{ createEmptyFoodProject }, { saveLocalProject }] = await Promise.all([
      import('/Grapes/src/food/food-data.js'),
      import('/Grapes/src/storage/local-project-store.js')
    ])
    const profile = { id: 'local-food-profile', name: 'Synthetic' }
    await saveLocalProject({
      id: 'food-tracker-local-food-profile', module: 'Ételnapló',
      name: 'Ételnapló', data: createEmptyFoodProject(profile),
      saveToken: 'baseline', saveRevision: 1
    })
  })
  await b.goto(base + '/Grapes/design/android-mobile-preview.html')
  const openFood = async page => {
    await page.locator('[data-menu-group="health"]').click()
    await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
    await page.locator('[data-food-meals] .meal').first().waitFor({ state: 'visible' })
  }
  await openFood(a)
  await openFood(b)
  await b.evaluate(() => {
    window.__foodToastLog = []
    const toast = document.querySelector('.toast')
    new MutationObserver(() => window.__foodToastLog.push(toast.textContent))
      .observe(toast, { childList: true, characterData: true, subtree: true })
  })
  const saveTarget = async (page, value) => {
    await page.locator('[data-food-open-targets]').click()
    await page.locator('[data-food-targets-sheet].is-open').waitFor({ state: 'visible' })
    await page.locator('[data-food-target-energy]').fill(value)
    await page.locator('[data-food-target-save]').click()
  }
  await saveTarget(a, '2100')
  await a.waitForFunction(async () => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    return (await loadLocalProject('food-tracker-local-food-profile'))?.saveToken !== 'baseline'
  })
  const committed = await a.evaluate(async () => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    return loadLocalProject('food-tracker-local-food-profile')
  })
  await saveTarget(b, '2200')
  await b.waitForFunction(async () => {
    const db = await new Promise((resolveDb, reject) => {
      const open = indexedDB.open('grapes-projects', 1)
      open.onsuccess = () => resolveDb(open.result)
      open.onerror = () => reject(open.error)
    })
    const rows = await new Promise((resolveRows, reject) => {
      const tx = db.transaction('projects', 'readonly')
      const req = tx.objectStore('projects').getAll()
      req.onsuccess = () => resolveRows(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return rows.some(row => row.id.startsWith('food-conflict-local-food-profile-'))
  })
  const rows = await a.evaluate(async () => {
    const db = await new Promise(resolveDb => {
      const open = indexedDB.open('grapes-projects', 1)
      open.onsuccess = () => resolveDb(open.result)
    })
    const result = await new Promise(resolveRows => {
      const request = db.transaction('projects', 'readonly').objectStore('projects').getAll()
      request.onsuccess = () => resolveRows(request.result)
    })
    db.close()
    return result
  })
  const current = rows.find(row => row.id === 'food-tracker-local-food-profile')
  const recovery = rows.find(row => row.id.startsWith('food-conflict-local-food-profile-'))
  assert.equal(current.saveToken, committed.saveToken, 'stale tab must not replace the winner')
  assert.notDeepEqual(recovery.data.targets, current.data.targets, 'the losing edit must be recoverable')
  assert.match(await b.locator('[data-food-sync-status]').textContent(), /Helyi Food-mentés leállítva/)
  assert.equal(await b.evaluate(() => window.__foodToastLog.some(message =>
    message.includes('A napi célokat mentettük.'))), false,
    'a stale write must not show a saved-success toast')
  const preview = await a.evaluate(async () => {
    const [{ captureV24LocalHealthSources }, { summarizeV24HealthInventory },
      { prepareV24HealthBackup }] = await Promise.all([
      import('/Grapes/src/sync/grapes-health-v24-local-reader.js'),
      import('/Grapes/src/sync/grapes-health-v24-preview-summary.js'),
      import('/Grapes/src/sync/grapes-health-v24-verified-backup.js')
    ])
    const capture = await captureV24LocalHealthSources()
    const summary = summarizeV24HealthInventory(capture)
    const backup = await prepareV24HealthBackup(capture)
    return { summary, providers: JSON.parse(backup.json).sources.map(item => item.provider) }
  })
  assert.equal(preview.summary.sources, 2)
  assert.ok(preview.summary.blockers.some(item => item.label === 'Helyi Food-ütközés'))
  assert.deepEqual(preview.providers.sort(), ['indexeddb', 'indexeddb-recovery'])
  await context.close()
  console.log('TEST Food UI: two tabs retain winner and separate conflict snapshot')
} finally {
  await browser?.close()
  server.kill()
}
