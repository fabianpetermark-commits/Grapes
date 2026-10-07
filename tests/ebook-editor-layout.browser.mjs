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
    await page.evaluate(() => document.querySelector('#pick-ebook-organizer').click())
    await page.waitForFunction(() => document.querySelector('#ebook-manager-view')?.dataset.ebookMode === 'organizer', null, { timeout: 20000 })
    await page.locator('#ebook-metadata-panel').waitFor({ state: 'visible', timeout: 20000 })
    const measured = await page.evaluate(() => {
      const root = document.documentElement
      const panel = document.querySelector('#ebook-metadata-panel')
      const workspace = document.querySelector('.ebook-library__metadata-workspace').getBoundingClientRect()
      const globalActions = document.querySelector('#ebook-editor-global-actions').getBoundingClientRect()
      const save = document.querySelector('#ebook-editor-save').getBoundingClientRect()
      const open = document.querySelector('#ebook-editor-open').getBoundingClientRect()
      const tabs = document.querySelector('#ebook-editor-tabs').getBoundingClientRect()
      const edge = panel.getBoundingClientRect().right
      const overflowing = [...panel.querySelectorAll('*')].map((el) => ({ node: el.tagName.toLowerCase(), id: el.id, className: typeof el.className === 'string' ? el.className : '', right: Math.round(el.getBoundingClientRect().right - edge), scroll: el.scrollWidth - el.clientWidth })).filter((item) => item.right > 1 || item.scroll > 1).sort((a, b) => b.scroll - a.scroll).slice(0, 5)
      return { overflow: root.scrollWidth - innerWidth, panelOverflow: panel.scrollWidth - panel.clientWidth, saveWidth: save.width, saveHeight: save.height, saveRight: save.right, saveCenterOffset: Math.abs((save.left + save.right) / 2 - (workspace.left + workspace.right) / 2), workspace: [workspace.left, workspace.right], globalActions: [globalActions.left, globalActions.right], mode: document.querySelector('#ebook-manager-view').dataset.ebookMode, activeTab: document.querySelector('#ebook-manager-view').dataset.ebookTab, tabOrder: [...document.querySelectorAll('#ebook-editor-tabs [role="tab"]')].map((tab) => tab.id), display: getComputedStyle(document.querySelector('#ebook-editor-global-actions')).display, grid: getComputedStyle(document.querySelector('#ebook-editor-global-actions')).gridTemplateColumns, justify: getComputedStyle(document.querySelector('#ebook-editor-save')).justifySelf, openTop: open.top, tabsBottom: tabs.bottom, openInTopbar: document.querySelector('.ebook-library__editor-topbar').contains(document.querySelector('#ebook-editor-open')), overflowing }
    })
    assert.ok(measured.overflow <= 1 && measured.panelOverflow <= 1, `${width}px: vízszintes túlcsordulás: ${JSON.stringify(measured)}`)
    assert.ok(measured.saveWidth >= 44 && measured.saveHeight >= (width <= 768 ? 44 : 32) && measured.saveRight <= width + 1, `${width}px: mentés nem érhető el: ${JSON.stringify(measured)}`)
    assert.ok(measured.saveCenterOffset <= 2, `${width}px: a mentés nincs középen: ${JSON.stringify(measured)}`)
    assert.equal(measured.openInTopbar, true, `${width}px: az EPUB megnyitása nincs a felső fülsávban`)
    assert.equal(measured.activeTab, 'metadata', `${width}px: nem az Adatlap az alapértelmezett nézet`)
    assert.deepEqual(measured.tabOrder, ['ebook-editor-metadata-tab', 'ebook-editor-text-tab', 'ebook-editor-font-tab'])
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
    await page.locator('[data-download="book"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#ebook-manager-view').getAttribute('data-ebook-mode'), 'library')
    assert.equal(await page.locator('[data-edit-book]').count(), 0)
    assert.equal(await page.locator('#ebook-metadata-panel').isVisible(), false)
    console.log(`✓ Könyvtár szerkesztési művelet nélkül ${width}px`)
    await context.close()
  }
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
