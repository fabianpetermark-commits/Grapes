import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4193/Grapes/tests/fixtures/food-local-concurrency.html'
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium szükséges a Food IndexedDB versenyteszthez.')
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4193', '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 99) throw new Error('A Food IndexedDB versenyteszt szervere nem indult el.')
    await new Promise(resolveReady => setTimeout(resolveReady, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext()
  const a = await context.newPage(), b = await context.newPage()
  await Promise.all([a.goto(url), b.goto(url)])
  const profileId = 'synthetic-concurrent'
  const snapshot = entry => ({ profile: { id: profileId }, diaryEntries: [{ id: entry }], syncState: { localDirty: true } })
  await a.evaluate(async ({ profileId, baseline }) => {
    const { saveLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    await saveLocalProject({ id: `food-tracker-${profileId}`, module: 'Ételnapló', name: 'Ételnapló', data: baseline, saveToken: 'baseline', saveRevision: 1 })
  }, { profileId, baseline: snapshot('baseline') })
  const begin = async page => page.evaluate(async profileId => {
    const [{ createFoodSaveQueue }, localStore] = await Promise.all([
      import('/Grapes/src/food/food-save-queue.js'), import('/Grapes/src/storage/local-project-store.js'),
    ])
    const stored = await localStore.loadLocalProject(`food-tracker-${profileId}`)
    window.foodQueue = createFoodSaveQueue({ save: localStore.saveLocalFoodProject || localStore.saveLocalProject, storage: localStorage })
    window.foodQueue.observe(profileId, stored)
    return stored.saveToken
  }, profileId)
  assert.deepEqual(await Promise.all([begin(a), begin(b)]), ['baseline', 'baseline'])
  const write = (page, entry) => page.evaluate(async ({ entry, profileId }) => {
    try {
      await window.foodQueue.enqueue({ data: { profile: { id: profileId }, diaryEntries: [{ id: entry }], syncState: { localDirty: true } } })
      return 'saved'
    } catch (error) { return error.code || error.message }
  }, { entry, profileId })
  assert.equal(await write(a, 'A'), 'saved')
  const staleResult = await write(b, 'B')
  const records = await a.evaluate(async profileId => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    const db = await new Promise((resolveDb, reject) => { const req = indexedDB.open('grapes-projects', 1); req.onsuccess = () => resolveDb(req.result); req.onerror = () => reject(req.error) })
    const all = await new Promise((resolveRows, reject) => { const tx = db.transaction('projects', 'readonly'); const req = tx.objectStore('projects').getAll(); req.onsuccess = () => resolveRows(req.result); req.onerror = () => reject(req.error) })
    db.close()
    return { current: await loadLocalProject(`food-tracker-${profileId}`), recovery: all.filter(row => row.id.startsWith(`food-conflict-${profileId}-`)) }
  }, profileId)
  assert.equal(staleResult, 'FOOD_LOCAL_SAVE_CONFLICT')
  assert.equal(records.current.data.diaryEntries[0].id, 'A', 'A frissebb commitja nem írható felül')
  assert.equal(records.recovery.length, 1, 'B elvesztett pillanatképe külön IDB-rekordban megmarad')
  assert.equal(records.recovery[0].data.diaryEntries[0].id, 'B')
  await context.close()
  console.log('Food két böngészőoldal / közös IndexedDB: újabb commit megmarad, vesztes snapshot külön helyreállítható')
} finally { await browser?.close(); server.kill() }
