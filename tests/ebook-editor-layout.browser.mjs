import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((path) => path && existsSync(path))
if (!browserPath) throw new Error('Chromium-alapú böngésző nem található.')
const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { cwd: projectRoot, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'ebook-layout-test' }, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch('http://127.0.0.1:4174')).ok) break } catch {}
    if (attempt === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, timeout: 20000, args: ['--disable-gpu', '--no-sandbox'] })
  for (const width of [360, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('grapes-ebook-view')) sessionStorage.setItem('grapes-ebook-view', 'organizer')
      sessionStorage.setItem('grapes-drive-session', JSON.stringify({ clientId: 'ebook-layout-test', accessToken: 'test', expiresAt: Date.now() + 3600000, scopes: 'https://www.googleapis.com/auth/drive.file' }))
    })
    await context.route('https://www.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }))
    await context.route('https://accounts.google.com/**', (route) => route.abort())
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4174/?module=ebook', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.locator('#ebook-metadata-panel').waitFor({ state: 'visible', timeout: 20000 })
    const measured = await page.evaluate(() => {
      const root = document.documentElement
      const panel = document.querySelector('#ebook-metadata-panel')
      const save = document.querySelector('#ebook-metadata-save').getBoundingClientRect()
      const edge = panel.getBoundingClientRect().right
      const overflowing = [...panel.querySelectorAll('*')].map((el) => ({ node: el.tagName.toLowerCase(), id: el.id, className: typeof el.className === 'string' ? el.className : '', right: Math.round(el.getBoundingClientRect().right - edge), scroll: el.scrollWidth - el.clientWidth })).filter((item) => item.right > 1 || item.scroll > 1).sort((a, b) => b.scroll - a.scroll).slice(0, 5)
      return { overflow: root.scrollWidth - innerWidth, panelOverflow: panel.scrollWidth - panel.clientWidth, saveWidth: save.width, saveHeight: save.height, saveRight: save.right, overflowing }
    })
    assert.ok(measured.overflow <= 1 && measured.panelOverflow <= 1, `${width}px: vízszintes túlcsordulás: ${JSON.stringify(measured)}`)
    assert.ok(measured.saveWidth >= 44 && measured.saveHeight >= (width <= 768 ? 44 : 32) && measured.saveRight <= width + 1, `${width}px: mentés nem érhető el: ${JSON.stringify(measured)}`)
    console.log(`✓ E-book szerkesztő ${width}px`)

    await page.route('https://www.googleapis.com/**', (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') || ''
      const files = query.includes('.grapes-ebook-metadata') ? []
        : query.includes("name = 'Grapes E-book Library'") ? [{ id: 'folder', name: 'Grapes E-book Library' }]
          : query.includes("'folder' in parents") ? [{ id: 'book', name: 'Dune.pdf', size: '2048', mimeType: 'application/pdf', isAppAuthorized: true }]
            : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) })
    })
    await page.evaluate(() => sessionStorage.setItem('grapes-ebook-view', 'library'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-edit-book="book"]').click()
    await page.locator('#ebook-metadata-panel').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#ebook-manager-view').getAttribute('data-ebook-mode'), 'detail')
    assert.equal(await page.locator('#ebook-metadata-book').inputValue(), 'book')
    assert.equal(await page.locator('.ebook-library__metadata-picker').isVisible(), false)
    assert.equal(await page.locator('.ebook-library__grid').isVisible(), false)
    const detail = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      panelOverflow: document.querySelector('#ebook-metadata-panel').scrollWidth - document.querySelector('#ebook-metadata-panel').clientWidth,
      save: document.querySelector('#ebook-metadata-save').getBoundingClientRect().toJSON(),
      back: document.querySelector('#ebook-detail-back').getBoundingClientRect().toJSON(),
    }))
    assert.ok(detail.overflow <= 1 && detail.panelOverflow <= 1, `${width}px: az adatlap túlcsordul: ${JSON.stringify(detail)}`)
    assert.ok(detail.save.width >= 44 && detail.save.right <= width + 1 && detail.back.height >= 44, `${width}px: adatlapműveletek nem érhetők el: ${JSON.stringify(detail)}`)
    if (width === 360) {
      await page.locator('#ebook-metadata-title').fill('Dűne')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.locator('#ebook-detail-back').click()
      assert.equal(await page.locator('#ebook-manager-view').getAttribute('data-ebook-mode'), 'detail')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.locator('#ebook-back-to-menu-btn').click()
      assert.equal(await page.locator('body').getAttribute('data-screen'), 'ebook')
      page.once('dialog', (dialog) => dialog.accept())
    }
    await page.locator('#ebook-detail-back').click()
    assert.equal(await page.locator('#ebook-manager-view').getAttribute('data-ebook-mode'), 'library')
    console.log(`✓ Könyvenkénti adatlap ${width}px`)
    await context.close()
  }
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
