import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import JSZip from 'jszip'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((path) => path && existsSync(path))
if (!executablePath) throw new Error('Chromium-alapú böngésző nem található.')
const zip = new JSZip()
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
zip.file('OPS/package.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier><dc:title>Test book</dc:title><dc:language>hu</dc:language><meta property="dcterms:modified">2026-10-05T12:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
zip.file('OPS/nav.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">First chapter</a></li></ol></nav></body></html>')
zip.file('OPS/chapter.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>First chapter</title></head><body><h1>First chapter</h1><p>Old wording here.</p></body></html>')
let epub = Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
let revision = 'r1'
let uploaded = null
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4176', '--strictPort'], { cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'ebook-content-test', VITE_EBOOK_EPUB_WRITE_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:4176')).ok) break } catch {}
    if (i === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu', '--no-sandbox'] })
  for (const width of [360, 390, 768, 1024, 1440]) {
    const requests = []
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      sessionStorage.setItem('grapes-ebook-view', 'organizer')
      sessionStorage.setItem('grapes-drive-session', JSON.stringify({ clientId: 'ebook-content-test', accessToken: 'test', expiresAt: Date.now() + 3600000, scopes: 'https://www.googleapis.com/auth/drive.file' }))
    })
    await context.route('https://www.googleapis.com/**', async (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      if (method === 'GET' && url.pathname.endsWith('/files/book') && url.searchParams.has('fields')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'book', name: 'Test book.epub', size: String(epub.length), modifiedTime: revision, headRevisionId: revision, isAppAuthorized: true, capabilities: { canEdit: true } }) })
      if (url.pathname.endsWith('/files/book') && url.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, contentType: 'application/epub+zip', body: epub })
      if (method === 'PATCH' && url.pathname.endsWith('/files/book')) {
        uploaded = Buffer.from(route.request().postDataBuffer())
        epub = uploaded; revision = 'r2'
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'book', size: String(epub.length), modifiedTime: revision, headRevisionId: revision }) })
      }
      if (method === 'POST' || method === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'metadata-file', modifiedTime: 'now' }) })
      const q = url.searchParams.get('q') || ''
      requests.push([url.pathname, q])
      const files = q.includes('.grapes-ebook-metadata') ? []
        : q.includes("name = 'Grapes E-book Library'") ? [{ id: 'folder', name: 'Grapes E-book Library' }]
        : q.includes("'folder' in parents") ? [{ id: 'book', name: 'Test book.epub', size: String(epub.length), modifiedTime: revision, headRevisionId: revision, mimeType: 'application/epub+zip', isAppAuthorized: true }]
          : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) })
    })
    await context.route('https://accounts.google.com/**', (route) => route.abort())
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4176/?module=ebook', { waitUntil: 'domcontentloaded' })
    try { await page.locator('#ebook-metadata-book option[value="book"]').waitFor({ state: 'attached', timeout: 5000 }) }
    catch { throw new Error(JSON.stringify({ requests, status: await page.locator('#ebook-status').textContent().catch(() => ''), html: await page.locator('#ebook-metadata-book').innerHTML() })) }
    await page.locator('#ebook-metadata-book').selectOption('book')
    await page.locator('#ebook-editor-open').click()
    await page.locator('#ebook-editor-chapter option').waitFor({ state: 'attached', timeout: 20000 })
    assert.equal(await page.locator('#ebook-editor-text-pane').isVisible(), true)
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1)
    await page.locator('#ebook-editor-find').fill('Old wording')
    await page.locator('#ebook-editor-replace').fill('New wording')
    await page.locator('#ebook-editor-search').click()
    assert.match(await page.locator('#ebook-editor-match-summary').textContent(), /1 találat/)
    await page.locator('#ebook-editor-apply-matches').click()
    assert.equal(await page.locator('#ebook-editor-save').isEnabled(), true)
    if (width !== 1440) {
      await page.locator('#ebook-editor-undo').click()
      assert.equal(await page.locator('#ebook-editor-save').isEnabled(), false)
    } else {
      page.on('dialog', (dialog) => dialog.accept())
      await page.locator('#ebook-editor-save').click()
      try { await page.locator('#ebook-editor-status').getByText(/mentve a Drive-ba/).waitFor({ timeout: 5000 }) }
      catch { throw new Error(JSON.stringify({ status: await page.locator('#ebook-editor-status').textContent(), requests, uploaded: Boolean(uploaded) })) }
      assert.ok(uploaded)
      const updated = await JSZip.loadAsync(uploaded)
      assert.match(await updated.file('OPS/chapter.xhtml').async('string'), /New wording/)
    }
    await context.close()
  }
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
