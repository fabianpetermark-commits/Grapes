import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium-alapú böngésző nem található.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: projectRoot,
  env: { ...process.env, VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID: '', VITE_GOOGLE_CLIENT_ID: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let browserInstance
try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4175/Grapes/ebook.html')
      if (response.ok) { ready = true; break }
    } catch {}
    if (attempt === 79) throw new Error('Az önálló E-book tesztszerver nem indult el.')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(ready, true)
  browserInstance = await chromium.launch({ executablePath: browserPath, headless: true, timeout: 20000, args: ['--disable-gpu', '--no-sandbox'] })
  const context = await browserInstance.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto('http://127.0.0.1:4175/Grapes/ebook.html', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('#ebook-manager-view').waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('#ebook-drive-connect').waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('#ebook-reader-connect').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForFunction(() => {
    const status = document.querySelector('#ebook-status')?.textContent || ''
    return status && !status.includes('Drive kapcsolat ellenőrzése')
  }, null, { timeout: 20000 })
  const state = await page.evaluate(() => ({
    namespace: globalThis.__EBOOK_CONFIG__?.storageNamespace,
    folder: globalThis.__EBOOK_CONFIG__?.folderName,
    viewKey: globalThis.__EBOOK_CONFIG__?.viewStorageKey,
    mode: document.querySelector('#ebook-manager-view')?.dataset.ebookMode,
    rootOverflow: document.documentElement.scrollWidth - innerWidth,
    scripts: performance.getEntriesByType('resource').map(item => item.name).filter(name => name.endsWith('/src/main.js') || name.endsWith('/src/screens.js')),
    status: document.querySelector('#ebook-status')?.textContent || '',
  }))
  assert.equal(state.namespace, 'ebook-standalone-v1')
  assert.equal(state.folder, 'Standalone E-book Library')
  assert.equal(state.viewKey, 'ebook-standalone-view-v1')
  assert.equal(state.mode, 'library')
  assert.deepEqual(state.scripts, [])
  assert.ok(state.rootOverflow <= 1, `Vízszintes túlcsordulás: ${JSON.stringify(state)}`)
  assert.match(state.status, /Drive nincs konfigurálva/)
  await page.goto('http://127.0.0.1:4175/Grapes/ebook-reader-standalone.html', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('#pair-form').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1000)
  const readerState = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    disabled: document.querySelector('#pair-submit')?.disabled,
    storageKeys: Object.keys(localStorage),
    status: document.querySelector('#reader-status')?.textContent || '',
    scripts: performance.getEntriesByType('resource').map(item => item.name).filter(name => name.includes('ebook-reader-standalone.js') || name.includes('standalone-config.js')),
  }))
  assert.equal(readerState.title, 'Önálló E-book olvasó')
  assert.equal(readerState.disabled, true, JSON.stringify(readerState))
  assert.match(readerState.status, /nincs beállítva az önálló átviteli broker/, JSON.stringify(readerState))
  assert.ok(readerState.scripts.length >= 1, JSON.stringify(readerState))
  assert.ok(!readerState.storageKeys.some(key => key.startsWith('grapes-')))
  await page.waitForTimeout(300)
  assert.deepEqual(pageErrors, [], `Böngészőhibák: ${pageErrors.join('; ')}`)
  console.log('✓ Önálló E-book shell betölt, saját tárhelyet használ, és nem indítja a Grapes főalkalmazást.')
  await context.close()
} finally {
  await browserInstance?.close().catch(() => {})
  server.kill()
}
