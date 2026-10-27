import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Real Android WebView HTML / JavaScript navigation test.
// All external APIs and native Auth are mocked; never mutates TEST or PROD.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(x => x && existsSync(x))
assert.ok(chrome, 'Chromium needed for the settings UI smoke test')
const port = 4264
const url = `http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || i === 119) throw Error('Settings preview not available')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({
    executablePath: chrome, headless: true, args: ['--no-sandbox'],
  })
  for (const width of [320, 360, 390, 412]) {
    const context = await browser.newContext({ viewport: { width, height: 740 } })
    await context.addInitScript(() => {
      localStorage.setItem('grapes-local-mode', '1')
      window.GrapesAndroid = {
        postMessage(message) {
          const { method, requestId } = JSON.parse(message)
          const payload = method === 'getTestAuthEnabled' ? 'true'
            : method === 'getTestAuthSubject'
              ? '00000000-0000-4000-8000-000000000001' : ''
          queueMicrotask(() => window.dispatchEvent(new CustomEvent(
            'grapes:android-result', { detail: { requestId, ok: true, payload } })))
        },
      }
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(url)
    const topSettings = page.locator('.appbar [data-nav="more"]')
    await topSettings.waitFor({state:'visible',timeout:12000})
    await topSettings.click()
    const settings = page.locator('[data-page="more"]')
    await settings.waitFor({ state:'visible' })
    assert.equal(await settings.locator('h1').count(), 1, 'One visible settings title')
    assert.equal((await settings.locator('h1').innerText()).trim(), 'Beállítások')
    assert.equal(await settings.locator('[data-settings-drive-status] svg:visible').count(), 1)
    assert.equal(await settings.locator('[data-settings-health-status] svg:visible').count(), 1)
    assert.equal(await settings.locator('[data-settings-samsung-status] svg:visible').count(), 1)
    assert.match(await settings.locator('[data-settings-drive-status]').getAttribute('aria-label'), /Drive/)
    assert.equal(await settings.locator('[data-settings-drive-status]').getAttribute('data-state'),'unverified')
    assert.equal(await settings.getByText('Ellenőrizetlen', {exact:true}).count(), 0)
    assert.equal(await settings.locator('[data-account-login]').count(), 1, 'Existing account action still wired')
    assert.equal(await settings.locator('[data-grapes-test-logout]').count(), 1, 'Existing Auth sign-out hook retained')
    assert.equal(await settings.locator('[data-grapes-test-food-qa]').count(), 1, 'Synthetic QA must stay available behind its gate')
    assert.equal(await settings.locator('[data-nav="sync"]').count(), 4, 'All provider rows navigate')
    // Last settings block must be scroll-reachable on a small phone.
    await settings.getByText('A Grapes névjegye').scrollIntoViewIfNeeded()
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth,
    }))
    assert.ok(geometry.width <= geometry.view + 2,
      `Settings overflow at ${width}px: ${JSON.stringify(geometry)}`)
    for (const label of ['Google Drive', 'Health Connect', 'Samsung Health', 'YAZIO']) {
      await settings.locator('[data-nav="sync"]').filter({has:page.getByText(label,{exact:true})}).click()
      await page.locator('[data-page="sync"]').waitFor({state:'visible'})
      assert.equal(await page.locator('[data-sync-refresh]').count(),1,'Actual sync action retained')
      await topSettings.click()
      await settings.waitFor({state:'visible'})
    }
    await settings.locator('[data-nav="projects"]').click()
    await page.locator('[data-page="projects"]').waitFor({state:'visible'})
    await topSettings.click()
    await settings.locator('[data-nav="household"]').click()
    await page.locator('[data-page="household"]').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-household-root]').count(),1,'Actual Home interface retained')
    assert.deepEqual(errors, [], `JS errors at ${width}px`)
    await context.close()
  }
  console.log('PASS: grouped Grapes Settings 320/360/390/412, provider navigation, genuine status indicators and existing account/QA/Home hooks.')
} finally {
  await browser?.close()
  server.kill()
}
