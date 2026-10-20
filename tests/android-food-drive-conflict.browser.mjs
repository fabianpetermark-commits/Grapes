import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4189/Grapes/design/android-mobile-preview.html'
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium szükséges a Food Drive-konfliktus böngészős teszthez.')
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'food-test-client' }, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 99) throw new Error('A Food Drive-konfliktus tesztszervere nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  await context.addInitScript(() => sessionStorage.setItem('grapes-drive-session', JSON.stringify({
    clientId: 'food-test-client', accessToken: 'synthetic-token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file', account: { id: 'same', name: 'Synthetic', email: 'synthetic@example.invalid' },
  })))
  const local = { version: 1, profile: { id: 'same', name: 'Synthetic' }, targets: [{ id: 'target', effectiveFrom: '2020-01-01', values: { energyKcal: 2100 } }],
    customFoods: [], recipes: [], diaryEntries: [], favorites: [], recentFoods: [], recipeLibraries: [], importBatches: [], sharingContacts: [], processedShareIds: [], syncState: { localDirty: false }, settings: {} }
  const remote = structuredClone(local)
  remote.targets[0].values.energyKcal = 2200
  let patchCount = 0
  await context.route('https://www.googleapis.com/**', route => {
    const request = route.request(), target = new URL(request.url())
    if (request.method() === 'PATCH') patchCount += 1
    let body
    if (target.pathname === '/drive/v3/files' && target.searchParams.get('q')?.includes('mimeType')) body = { files: [{ id: 'folder' }] }
    else if (target.pathname === '/drive/v3/files') body = { files: [{ id: 'shared', name: 'Ételnapló.grapes.json', mimeType: 'application/json', version: '2' }] }
    else if (target.pathname === '/drive/v3/files/shared' && target.searchParams.get('alt') === 'media') body = { grapesProject: true, module: 'Ételnapló', name: 'Ételnapló', data: remote, writeId: 'B-write' }
    else if (target.pathname === '/drive/v3/files/shared') body = { id: 'shared', name: 'Ételnapló.grapes.json', mimeType: 'application/json', version: '2' }
    else body = { files: [] }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const page = await context.newPage()
  page.on('dialog', dialog => dialog.accept())
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(async data => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('grapes-projects', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' })
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolveTx, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({ id: 'food-tracker-same', module: 'Ételnapló', name: 'Ételnapló', data, driveFileId: 'shared', driveVersion: '1', driveWriteId: 'baseline' })
      tx.oncomplete = resolveTx; tx.onabort = () => reject(tx.error)
    })
    db.close()
  }, local)
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-food-conflict-panel]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-food-sync-status]').textContent(), /Drive-ütközés/)
  assert.equal(patchCount, 0)
  const download = page.waitForEvent('download')
  await page.locator('[data-food-conflict-export-remote]').click()
  assert.match((await download).suggestedFilename(), /felho\.json$/)
  await page.locator('[data-food-conflict-use-remote]').click()
  await page.locator('[data-food-conflict-panel]').waitFor({ state: 'hidden' })
  await page.locator('[data-food-recovery-export]').waitFor({ state: 'visible' })
  const recoveryDownload = page.waitForEvent('download')
  await page.locator('[data-food-recovery-export]').click()
  assert.match((await recoveryDownload).suggestedFilename(), /helyreallito\.json$/)
  const records = await page.evaluate(async () => {
    const db = await new Promise(resolveDb => { const request = indexedDB.open('grapes-projects', 1); request.onsuccess = () => resolveDb(request.result) })
    return new Promise(resolveRows => { const tx = db.transaction('projects', 'readonly'); const request = tx.objectStore('projects').getAll(); request.onsuccess = () => { db.close(); resolveRows(request.result) } })
  })
  assert.equal(records.find(x => x.id === 'food-tracker-same').data.targets[0].values.energyKcal, 2200)
  assert.equal(records.find(x => x.id.startsWith('food-conflict-same-')).data.targets[0].values.energyKcal, 2100)
  assert.equal(patchCount, 0)
  await context.close()
  console.log('Food Drive-konfliktus: helyi adat megmarad, nincs automatikus PATCH, két példány exportálható és visszaállítható')
} finally { await browser?.close(); server.kill() }
