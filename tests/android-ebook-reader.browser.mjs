import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:43130'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

async function epubFixture() {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
  zip.file('OPS/package.opf', '<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Valódi könyv</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>')
  zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Első fejezet</a></li><li><a href="two.xhtml">Második fejezet</a></li></ol></nav></body></html>')
  zip.file('OPS/one.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Első fejezet</h1>${'<p>Valódi EPUB szöveg a telefonos olvasó teszteléséhez.</p>'.repeat(35)}</body></html>`)
  zip.file('OPS/two.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Második fejezet</h1><p>A könyv folytatása.</p></body></html>')
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' }))
}

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '43130', '--strictPort'], { cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'ebook-reader-test' }, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  const epub = await epubFixture()
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
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({ clientId: 'ebook-reader-test', accessToken: 'token', expiresAt: Date.now() + 3600000, scopes: 'https://www.googleapis.com/auth/drive.file', account: { email: 'reader@example.com' } }))
  })
  const savedProgress = []
  await context.route('https://www.googleapis.com/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const query = url.searchParams.get('q') || ''
    if (request.method() === 'PATCH' && url.pathname.includes('/upload/drive/v3/files/progress')) {
      savedProgress.push(JSON.parse(request.postData() || '{}'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    if (url.pathname.endsWith('/files/book-1') && url.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, contentType: 'application/epub+zip', body: epub })
    let body = { files: [] }
    if (query.includes("name = 'Grapes E-book Library'")) body = { files: [{ id: 'library' }] }
    else if (query.includes("name = '.grapes-ebook-metadata.json'")) body = { files: [{ id: 'metadata' }] }
    else if (query.includes("name = '.grapes-ebook-reading-progress.json'")) body = { files: [{ id: 'progress' }] }
    else if (query.includes("'library' in parents")) body = { files: [{ id: 'book-1', name: 'Valodi.epub', size: '5000', modifiedTime: '2026-10-14T18:00:00Z', mimeType: 'application/epub+zip', isAppAuthorized: true }] }
    else if (url.pathname.endsWith('/files/metadata')) body = { version: 2, books: { 'book-1': { title: 'Valódi könyv', author: 'Teszt Szerző' } } }
    else if (url.pathname.endsWith('/files/progress')) body = { version: 1, books: { 'book-1': { chapterId: 'one', chapterIndex: 0, chapterProgress: .35, overallPercent: 18, updatedAt: '2026-10-14T19:00:00Z' } } }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseUrl}/Grapes/design/android-mobile-preview.html`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-module="ebook"]').first().click()
  await page.getByRole('button', { name: 'Olvasás folytatása' }).waitFor()
  await page.getByRole('button', { name: 'Olvasás folytatása' }).click()
  await page.getByText('Valódi EPUB szöveg a telefonos olvasó teszteléséhez.').first().waitFor()
  assert.equal(await page.locator('[data-page="reader"]').isVisible(), true)
  assert.equal(await page.locator('[data-reader-chapter] option').count(), 2)
  assert.equal(await page.locator('[data-page="reader"]').evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.screenshot({ path: 'mobile-ebook-reader.png', fullPage: true })
  await page.locator('[data-reader-page]').evaluate(node => { node.scrollTop = Math.max(1, node.scrollHeight * .7); node.dispatchEvent(new Event('scroll')) })
  await page.waitForTimeout(1500)
  assert.equal(savedProgress.length > 0, true)
  assert.equal(savedProgress.at(-1).books['book-1'].chapterId, 'one')
  await page.locator('[data-page="reader"] [data-ebook-view="transfer"]').click()
  assert.equal(await page.locator('[data-page="transfer"]').isVisible(), true)
  assert.equal(await page.getByText('Keresés a teljes Drive-ban').count(), 0)
  await page.screenshot({ path: 'mobile-ebook-transfer.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('Android EPUB reader and clean transfer view: OK')
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
