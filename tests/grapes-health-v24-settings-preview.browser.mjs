import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for TEST migration preview')
const base = 'http://127.0.0.1:4198'
const server = spawn(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4198', '--strictPort'
], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1',
    VITE_GRAPES_TEST_MIGRATION_PREVIEW_ENABLED: 'true' }
})
let browser
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before the preview test')
    try { if ((await fetch(base)).ok) break } catch {}
    if (attempt === 79) throw new Error('Vite did not start')
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  browser = await chromium.launch({
    executablePath: browserPath, headless: true, args: ['--no-sandbox']
  })
  const denied = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await denied.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const deniedPage = await denied.newPage()
  await deniedPage.goto(base + '/Grapes/design/android-mobile-preview.html')
  await deniedPage.locator('[data-nav="more"]').first().click()
  assert.equal(await deniedPage.locator('[data-grapes-test-migration-scan]').isHidden(), true,
    'web preview must keep TEST local scan hidden')
  await denied.close()

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('grapes-local-mode', '1')
    window.__backupChunks = []
    window.__backupFailed = false
    Object.defineProperty(window, 'GrapesAndroid', {
      configurable: true, value: { postMessage(raw) {
        const request = JSON.parse(raw)
        const respond = (ok, payload = '', error = '') => queueMicrotask(() =>
          window.dispatchEvent(new CustomEvent('grapes:android-result', {
            detail: { requestId: request.requestId, ok, payload, error }
          })))
        if (request.method === 'getTestAuthEnabled') return respond(true, 'true')
        if (request.method === 'beginFoodBackupExport') {
          window.__backupChunks = []
          return respond(true, 'synthetic-token')
        }
        if (request.method === 'appendFoodBackupExport') {
          window.__backupChunks.push(request.args[1])
          return respond(true, '{}')
        }
        if (request.method === 'cancelFoodBackupExport') return respond(true, '{}')
        if (request.method === 'finishFoodBackupExport') {
          if (window.__backupFailed) return respond(false, '', 'Synthetic interrupted write')
          const json = window.__backupChunks.join('')
          crypto.subtle.digest('SHA-256', new TextEncoder().encode(json)).then(digest => {
            const sha256 = [...new Uint8Array(digest)]
              .map(byte => byte.toString(16).padStart(2, '0')).join('')
            respond(true, JSON.stringify({ bytes: new Blob([json]).size, sha256 }))
          })
        }
      } }
    })
  })
  await context.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue()
    return route.fulfill({ status: 204, body: '' })
  })
  const page = await context.newPage()
  await page.goto(base + '/Grapes/design/android-mobile-preview.html')
  await page.locator('[data-nav="more"]').first().click()
  await page.locator('[data-grapes-test-migration-scan]').waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    const open = indexedDB.open('grapes-projects', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('projects', { keyPath: 'id' })
    const db = await new Promise((resolveDb, reject) => {
      open.onsuccess = () => resolveDb(open.result)
      open.onerror = () => reject(open.error)
    })
    await new Promise((resolveTx, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({
        id: 'food-tracker-synthetic', module: 'Ételnapló',
        data: { version: 2, profile: { id: 'synthetic' },
          diaryEntries: [{ id: 'private-entry', profileId: 'synthetic',
            payload: { email: 'private@example.invalid' } }],
          customFoods: [], recipes: [], targets: [], importBatches: [] }
      })
      tx.oncomplete = resolveTx
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    localStorage.setItem('grapes-water-v1', JSON.stringify({
      '2026-10-20': { goal: 2000, entries: [{
        id: 'water-1', amount: 250, at: '2026-10-20T12:00:00Z'
      }] }
    }))
  })
  const before = await page.evaluate(() => localStorage.getItem('grapes-water-v1'))
  const requests = []
  page.on('request', request => {
    if (!request.url().startsWith(base + '/')) requests.push(request.url())
  })
  await page.locator('[data-grapes-test-migration-scan]').click()
  await page.waitForFunction(() => document.querySelector(
    '[data-grapes-test-migration-status]')?.textContent?.includes('Csak előnézet.'))
  const visible = await page.locator('[data-grapes-test-migration-results]').innerText()
  assert.match(visible, /2 helyi forrás/)
  assert.match(visible, /Étkezési bejegyzés: 1/)
  assert.match(visible, /Víz napi cél/)
  assert.match(visible, /fiókhoz rendelés szükséges/)
  assert.doesNotMatch(visible, /private-entry|private@example|water-1|synthetic/)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), before)
  assert.deepEqual(requests, [])
  assert.equal(await page.locator('[data-grapes-test-migration-backup]').isVisible(), true)
  page.on('dialog', dialog => dialog.accept())
  await page.evaluate(() => { window.__backupFailed = true })
  await page.locator('[data-grapes-test-migration-backup]').click()
  await page.waitForFunction(() => document.querySelector(
    '[data-grapes-test-migration-status]')?.textContent?.includes('nem igazolható'))
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), before)
  await page.evaluate(() => { window.__backupFailed = false })
  await page.locator('[data-grapes-test-migration-backup]').click()
  await page.waitForFunction(() => document.querySelector(
    '[data-grapes-test-migration-status]')?.textContent?.includes('visszaolvasva és ellenőrizve'))
  const saved = await page.evaluate(() => JSON.parse(window.__backupChunks.join('')))
  assert.equal(saved.ownership, 'unclaimed')
  assert.equal(saved.sources.length, 2)
  assert.equal(saved.sources[0].document.data.diaryEntries[0].id, 'private-entry')
  assert.equal(saved.sources[1].raw, before)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), before)
  assert.deepEqual(requests, [])
  await context.close()
  console.log('TEST settings preview: explicit click, redacted counts, unchanged Water, no external request')
} finally {
  await browser?.close()
  server.kill()
}
