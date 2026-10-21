import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium is required for the login preview browser test.')
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4181', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:4181/Grapes/login-preview.html')).ok) break } catch {}
    if (attempt === 79) throw new Error('Preview server did not start.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  for (const width of [320, 360, 390, 412, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 640 } })
    const page = await context.newPage()
    const outbound = []
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4181/')) outbound.push(request.url()) })
    await page.goto('http://127.0.0.1:4181/Grapes/login-preview.html')
    assert.equal(await page.title(), 'Grapes – Bejelentkezés')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.login-page')).backgroundColor), 'rgb(0, 0, 0)')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.login-card')).backgroundColor), 'rgb(8, 15, 20)')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.submit-button')).backgroundColor), 'rgb(59, 220, 242)')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px has horizontal overflow`)
    for (const selector of ['#google-sign-in', '#grapes-username', '#grapes-password', '#toggle-password', '.submit-button', '#forgot-password', '#register']) {
      const box = await page.locator(selector).boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${selector} is clipped at ${width}px`)
    }
    assert.equal(await page.getByRole('textbox', { name: 'Felhasználónév vagy e-mail-cím' }).count(), 1)
    assert.equal(await page.getByLabel('Jelszó', { exact: true }).count(), 1)
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'google-sign-in')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'grapes-username')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'grapes-password')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-password')
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('#grapes-password').getAttribute('type'), 'text')
    assert.equal(await page.locator('#toggle-password').getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('#toggle-password').getAttribute('aria-label'), 'Jelszó elrejtése')
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('#grapes-password').getAttribute('type'), 'password')
    await page.locator('#grapes-username').fill('preview@example.invalid')
    await page.locator('#grapes-password').fill('synthetic-test-only')
    await page.locator('.submit-button').click()
    assert.match(await page.locator('#grapes-feedback').textContent(), /nem történik fiókellenőrzés/)
    await page.locator('#google-sign-in').click()
    await page.locator('#forgot-password').click()
    await page.locator('#register').click()
    assert.deepEqual(outbound, [], 'Preview must make no external requests')
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] })
    await context.close()
  }
  console.log('Approved login preview: layout, colors, keyboard, password toggle, accessibility labels, and no credential transport/storage passed at 320/360/390/412/1440px.')
} finally {
  await browser?.close()
  server.kill()
}
