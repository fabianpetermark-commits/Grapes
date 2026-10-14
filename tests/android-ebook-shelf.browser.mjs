import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:43129'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '43129', '--strictPort'], { cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'ebook-shelf-test' }, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`A tesztszerver leállt (${server.exitCode}).`)
    try { if ((await fetch(baseUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'GrapesAndroid', { value: { postMessage() {} }, configurable: true })
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({
      clientId: 'ebook-shelf-test', accessToken: 'android-test-token', expiresAt: Date.now() + 3600000,
      scopes: 'https://www.googleapis.com/auth/drive.file', account: { name: 'Teszt', email: 'teszt@example.com' },
    }))
  })
  await context.route('https://www.googleapis.com/**', route => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q') || ''
    let body = { files: [] }
    if (query.includes("name = 'Grapes E-book Library'")) body = { files: [{ id: 'library' }] }
    else if (query.includes("name = '.grapes-ebook-metadata.json'")) body = { files: [{ id: 'metadata' }] }
    else if (query.includes("'library' in parents")) body = { files: [
      { id: 'book-1', name: 'eredeti-nev.epub', size: '2048', modifiedTime: '2026-10-14T18:00:00Z', mimeType: 'application/epub+zip', isAppAuthorized: true },
      { id: 'book-2', name: 'Masodik.pdf', size: '4096', modifiedTime: '2026-10-13T18:00:00Z', mimeType: 'application/pdf', isAppAuthorized: true },
    ] }
    else if (url.pathname.endsWith('/files/metadata')) body = { version: 2, books: { 'book-1': { title: 'Valódi könyv', author: 'Teszt Szerző' } } }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`${baseUrl}/Grapes/design/android-mobile-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  if (await page.locator('#app').isHidden()) throw new Error(JSON.stringify({ pageErrors, session: await page.evaluate(() => sessionStorage.getItem('grapes-drive-session')) }))
  await page.locator('[data-module="ebook"]').first().click()
  await page.locator('[data-ebook-books] .book-tile').first().waitFor()
  assert.equal(await page.locator('[data-ebook-books] .book-tile').count(), 2)
  assert.equal(await page.locator('[data-ebook-books] .book-tile strong').first().textContent(), 'Valódi könyv')
  assert.equal(await page.locator('[data-ebook-books] .book-tile small').first().textContent(), 'Teszt Szerző')
  assert.equal(await page.getByText('A csend térképe').count(), 0)
  assert.equal(await page.getByText('Valódi E-book könyvtár megnyitása').count(), 0)
  await page.locator('[data-ebook-books] .book-tile').first().click()
  await page.waitForURL('**/index.html?module=ebook&android-shell=1')
  assert.equal(await page.evaluate(() => sessionStorage.getItem('grapes-ebook-open-book')), 'book-1')
  console.log('Android Drive-backed E-book shelf: OK')
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
