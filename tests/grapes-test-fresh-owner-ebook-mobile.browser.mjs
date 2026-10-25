import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(executablePath, 'Chrome required for normal mobile E-book owner A-B-A')
const port = 4234
const base = `http://127.0.0.1:${port}/Grapes/`
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'

async function makeEpub() {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
  zip.file('OPS/package.opf', '<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Helyi könyv</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="one"/></spine></package>')
  zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Saját fejezet</a></li></ol></nav></body></html>')
  zip.file('OPS/one.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Saját fejezet</h1>${'<p>Saját, helyi EPUB tartalom a Grapes olvasóban.</p>'.repeat(80)}</body></html>`)
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base + 'design/android-mobile-preview.html')).ok) break } catch {}
    if (server.exitCode !== null || i === 119) throw Error('E-book normal mobile fixture unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true,
    args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('grapes-local-mode', '1')
    window.GrapesAndroid = {
      postMessage(message) {
        const { method, requestId } = JSON.parse(message)
        const subject = localStorage.getItem('__ebook_qa_subject') ||
          '00000000-0000-4000-8000-000000000001'
        const signedIn = localStorage.getItem('__ebook_qa_logged_out') !== '1'
        const payload = method === 'getTestAuthEnabled' ? String(signedIn)
          : method === 'getTestAuthSubject' && signedIn ? subject : ''
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('grapes:android-result',
          { detail: { requestId, ok: true, payload } })))
      },
    }
  })
  let driveRequests = 0
  await ctx.route('https://www.googleapis.com/**', route => {
    driveRequests++
    return route.abort()
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const epub = await makeEpub()
  await page.goto(base + 'design/android-mobile-preview.html')
  const shelf = page.locator('[data-page="ebook"]')
  async function openShelf() {
    await page.locator('[data-menu-group="utility"]').click()
    await page.locator('[data-page="hub-utility"] [data-menu-destination="ebook"]').click()
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-page="ebook"]')
      return node && !node.hidden && !node.inert &&
        getComputedStyle(node).visibility !== 'hidden'
    }, { timeout: 15000 })
  }
  await openShelf()
  assert.ok((await shelf.textContent()).includes('A saját könyvtárad még üres'))
  await page.evaluate(() => localStorage.setItem('grapes-ebook-reading-progress-v1',
    '{"legacyShared":true}'))
  // Real mobile file input, not a direct repository mutation.
  await page.locator('[data-ebook-file]').setInputFiles({
    name: 'A-sajat.epub', mimeType: 'application/epub+zip', buffer: epub,
  })
  await page.waitForFunction(() =>
    document.querySelector('[data-ebook-status]')?.textContent.includes('mentve a saját helyi könyvtárba.'),
  { timeout: 15000 })
  assert.ok((await shelf.textContent()).includes('A-sajat'))
  const aSnapshot = await page.evaluate(async () => {
    const { openGrapesTestFreshEbook } =
      await import('/Grapes/src/ebook/grapes-test-fresh-ebook.js')
    const s = await openGrapesTestFreshEbook({enabled:true})
    const rows = await s.listBooks()
    return { ownerId:s.ownerId, books:rows.map(x=>x.name),
      bytes:(await s.readFile(rows[0].id)).size }
  })
  assert.equal(aSnapshot.ownerId, A)
  assert.deepEqual(aSnapshot.books, ['A-sajat.epub'])
  assert.ok(aSnapshot.bytes > 100)

  await shelf.locator('[data-ebook-featured] .continue-btn').click()
  try {
    await page.getByText('Saját, helyi EPUB tartalom a Grapes olvasóban.').first().waitFor({ timeout: 8000 })
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      readerStatus: document.querySelector('[data-reader-status]')?.textContent,
      readerHidden: document.querySelector('[data-page="reader"]')?.hidden,
      readerVisibility: document.querySelector('[data-page="reader"]')?.style.visibility,
      pickerHidden: document.querySelector('[data-reader-picker]')?.hidden,
      shellHidden: document.querySelector('[data-reader-shell]')?.hidden,
      chapter: document.querySelector('[data-reader-page]')?.textContent?.slice(0, 180),
    }))
    console.error('EBOOK_DIAGNOSTIC', JSON.stringify({ diagnostic, errors }))
    throw error
  }
  assert.equal(await page.locator('[data-page="reader"]').isVisible(), true)
  await page.locator('[data-reader-page]').evaluate(node => {
    node.scrollTop = Math.max(1, (node.scrollHeight - node.clientHeight) * .7)
    node.dispatchEvent(new Event('scroll'))
  })
  await page.waitForFunction(async () => {
    const { openGrapesTestFreshEbook } =
      await import('/Grapes/src/ebook/grapes-test-fresh-ebook.js')
    const s = await openGrapesTestFreshEbook({ enabled:true })
    return (await s.listBooks())[0]?.reading?.overallPercent > 0
  }, { timeout: 15000 })

  await page.evaluate(B => localStorage.setItem('__ebook_qa_subject', B), B)
  await page.reload()
  await openShelf()
  assert.ok((await shelf.textContent()).includes('A saját könyvtárad még üres'))
  assert.ok(!(await shelf.textContent()).includes('A-sajat'))
  await page.locator('[data-ebook-file]').setInputFiles({
    name: 'B-sajat.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Only B may read this.'),
  })
  await page.waitForFunction(() =>
    document.querySelector('[data-ebook-status]')?.textContent.includes('mentve a saját helyi könyvtárba.'),
  {timeout: 15000})
  assert.ok((await shelf.textContent()).includes('B-sajat'))
  const bSnapshot = await page.evaluate(async () => {
    const { openGrapesTestFreshEbook } =
      await import('/Grapes/src/ebook/grapes-test-fresh-ebook.js')
    const session = await openGrapesTestFreshEbook({enabled:true})
    const books = await session.listBooks()
    return {ownerId:session.ownerId, names:books.map(b=>b.name),
      text:await (await session.readFile(books[0].id)).text()}
  })
  assert.deepEqual(bSnapshot, {ownerId:B,names:['B-sajat.txt'],
    text:'Only B may read this.'})
  // The old Drive-transfer workflow would create public reader permissions.
  await shelf.locator('[data-ebook-view="transfer"]').first().click()
  assert.equal(await shelf.isVisible(), true)
  assert.equal(await page.locator('[data-page="transfer"]').isVisible(), false)

  await page.evaluate(A => localStorage.setItem('__ebook_qa_subject', A), A)
  await page.reload()
  await openShelf()
  assert.ok((await shelf.textContent()).includes('A-sajat'))
  assert.ok(!(await shelf.textContent()).includes('B-sajat'))
  const returned = await page.evaluate(async () => {
    const { openGrapesTestFreshEbook } =
      await import('/Grapes/src/ebook/grapes-test-fresh-ebook.js')
    const session = await openGrapesTestFreshEbook({enabled:true})
    const books = await session.listBooks()
    return {owner:session.ownerId, count:books.length,
      percent:books[0].reading.overallPercent,
      legacy:localStorage.getItem('grapes-ebook-reading-progress-v1')}
  })
  assert.equal(returned.owner,A)
  assert.equal(returned.count,1)
  assert.ok(returned.percent > 0)
  assert.equal(returned.legacy,'{"legacyShared":true}')
  assert.equal(driveRequests,0, 'fresh owner mobile E-book must not call Google Drive')
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: normal Android E-book shelf imports real local files, reads EPUB, saves progress A→B→A.')
  console.log('PASS: Drive transfer denied, no Google Drive request or legacy progress mutation.')
} finally {
  await browser?.close()
  server.kill()
}
