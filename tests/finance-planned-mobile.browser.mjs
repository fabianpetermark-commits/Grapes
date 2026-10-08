import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((path) => path && existsSync(path))
if (!executablePath) throw new Error('Chromium böngésző szükséges a mobilos pénzügyi teszthez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4177', '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'finance-test-client' }, stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:4177')).ok) break } catch {}
    if (i === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((done) => setTimeout(done, 100))
  }

  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
  await context.addInitScript(() => sessionStorage.setItem('grapes-drive-session', JSON.stringify({
    clientId: 'finance-test-client', accessToken: 'finance-test-token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file', account: { name: 'Test', email: 'test@example.com' },
  })))
  await context.route('https://www.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }),
  }))
  await context.route('https://accounts.google.com/**', (route) => route.abort())

  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4177/?module=finance')
  await page.waitForFunction(() => document.querySelector('#finance-save-status')?.textContent === 'Kész')
  await page.locator('[data-finance-tab="transaction"]').tap()
  await page.locator('#finance-form').waitFor({ state: 'visible' })

  const checkbox = page.locator('#finance-planned')
  const size = await checkbox.evaluate((input) => {
    const rect = input.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  assert.ok(size.width >= 20 && size.width <= 24)
  assert.ok(size.height >= 20 && size.height <= 24)

  await checkbox.tap()
  assert.equal(await checkbox.isChecked(), true)
  await page.locator('.finance__planned-toggle span').tap()
  assert.equal(await checkbox.isChecked(), false)

  console.log('✓ A tervezett kiadás jelölőnégyzete és teljes sora érintéssel kapcsolható mobilon')
  await context.close()
} finally {
  await browser?.close()
  server.kill()
}
