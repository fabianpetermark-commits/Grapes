import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for Water durability UI test')
const base = 'http://127.0.0.1:4198'
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4198', '--strictPort'],
{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1' } })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before Water test')
    try { if ((await fetch(base)).ok) break } catch {}
    if (attempt === 79) throw new Error('Vite did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    localStorage.setItem('grapes-local-mode', '1')
    localStorage.setItem('grapes-water-v1', '{damaged legacy bytes')
  })
  const page = await context.newPage()
  await page.goto(base + '/Grapes/design/android-mobile-preview.html')
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-water-storage-status]').textContent(), /nem olvasható/)
  assert.equal(await page.locator('[data-page="water"] [data-water-add="250"]').isDisabled(), true)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), '{damaged legacy bytes')
  await page.locator('[data-water-export]').click()
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), '{damaged legacy bytes')
  const restored = { '2026-10-24': { goal: 2000, entries: [
    { id: 'synthetic', amount: 250, at: '2026-10-24T08:00:00.000Z' }] } }
  await page.evaluate(() => { window.confirm = () => true })
  await page.locator('[data-water-backup-input]').setInputFiles({
    name: 'synthetic-water.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ grapesWaterBackup: true, version: 1,
      exportedAt: '2026-10-24T08:00:00.000Z', data: restored }))
  })
  await page.waitForFunction(() => localStorage.getItem('grapes-water-v1')?.includes('synthetic'))
  const evidence = await page.evaluate(() => ({
    original: Object.keys(localStorage).filter(key => key.startsWith('grapes-water-recovery-v1:'))
      .map(key => localStorage.getItem(key)),
    current: JSON.parse(localStorage.getItem('grapes-water-v1'))
  }))
  assert.ok(evidence.original.includes('{damaged legacy bytes'))
  assert.deepEqual(evidence.current, restored)
  assert.equal(await page.locator('[data-page="water"] [data-water-add="250"]').isDisabled(), false)
  await page.evaluate(() => {
    const previous = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'grapes-water-v1') throw new Error('synthetic quota')
      return previous.call(this, key, value)
    }
  })
  await page.locator('[data-page="water"] [data-water-add="250"]').click()
  assert.match(await page.locator('.toast').textContent(), /synthetic quota/)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('grapes-water-v1'))), restored)
  await context.close()
  console.log('TEST Water: damaged bytes preserved, write blocked, verified restore retained original')
} finally { await browser?.close(); server.kill() }
