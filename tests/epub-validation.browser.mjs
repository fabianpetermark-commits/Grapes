import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import JSZip from 'jszip'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((path) => path && existsSync(path))
if (!browserPath) throw new Error('Chromium-alapú böngésző nem található.')

const zip = new JSZip()
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
zip.file('OPS/package.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:test</dc:identifier><dc:title>Teszt</dc:title><dc:language>hu</dc:language><meta property="dcterms:modified">2026-10-07T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Tartalom</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Fejezet</a></li></ol></nav></body></html>')
zip.file('OPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fejezet</title></head><body><h1>Fejezet</h1><p>Szöveg.</p></body></html>')
const epub = await zip.generateAsync({ type: 'base64', mimeType: 'application/epub+zip' })

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch('http://127.0.0.1:4175/Grapes/')).ok) break } catch {}
    if (attempt === 99) throw new Error('A tesztszerver nem indult el.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, timeout: 20000, args: ['--disable-gpu', '--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4175/Grapes/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  const result = await page.evaluate(async (base64) => {
    const { validateEpub } = await import('/Grapes/src/ebook/epub-validation.js')
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return validateEpub(new Blob([bytes], { type: 'application/epub+zip' }), 'fixture.epub')
  }, epub)
  assert.equal(typeof result.valid, 'boolean')
  assert.equal(typeof result.summary.errors, 'number')
  assert.ok(Array.isArray(result.messages))
  console.log(`✓ Böngészős EPUBCheck lefutott (${result.summary.errors} hiba, ${result.summary.warnings} figyelmeztetés)`)
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
