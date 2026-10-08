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
if (!executablePath) throw new Error('Chromium böngésző szükséges a blokk-OCR böngészőtesztjéhez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4176', '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'finance-ocr-test' }, stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:4176')).ok) break } catch {}
    if (i === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((done) => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({
      clientId: 'finance-ocr-test', accessToken: 'test-token', expiresAt: Date.now() + 3600000,
      scopes: 'https://www.googleapis.com/auth/drive.file', account: { name: 'OCR teszt', email: 'ocr@example.com' },
    }))
    globalThis.__GRAPES_RECEIPT_OCR_TEST__ = async (_image, progress) => {
      progress(0.42)
      progress(1)
      return 'NETTÓ 6 685 Ft\nÁFA 1 805 Ft\nVÉGÖSSZEG 8 490 Ft'
    }
  })
  await context.route('https://www.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }),
  }))
  await context.route('https://accounts.google.com/**', (route) => route.abort())
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('PAGE ERROR:', error))
  await page.goto('http://127.0.0.1:4176/?module=finance')
  await page.waitForFunction(() => document.body.dataset.screen)
  if (await page.locator('body').getAttribute('data-screen') !== 'finance') {
    await page.locator('#pick-finance').click()
  }
  await page.locator('#finance-app').waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('#finance-save-status')?.textContent === 'Kész')
  await page.locator('#finance-app').evaluate((app) => app.classList.remove('hidden'))
  await page.locator('[data-finance-panel="transaction"]').evaluate((panel) => {
    panel.removeAttribute('hidden')
    panel.style.setProperty('display', 'block', 'important')
  })
  await page.locator('#finance-form').waitFor({ state: 'visible' })

  const scan = page.locator('#finance-receipt-scan')
  assert.equal(await scan.isDisabled(), true)
  await page.fill('#finance-amount', '7000')
  await page.locator('#finance-receipt').setInputFiles({ name: 'blokk.png', mimeType: 'image/png', buffer: Buffer.from('fake-image') })
  await page.locator('#finance-receipt-name').getByText('blokk.png').waitFor()
  assert.equal(await scan.isEnabled(), true)

  await scan.click()
  await page.getByRole('heading', { name: 'A blokk beszélt. Kicsit motyogva.' }).waitFor()
  assert.equal(await page.locator('#finance-amount').inputValue(), '7.000')
  assert.match(await page.locator('.finance__ocr-candidate').first().textContent(), /8\s?490/)
  await page.getByRole('button', { name: 'Inkább nem' }).click()
  assert.equal(await page.locator('#finance-amount').inputValue(), '7.000')

  await scan.click()
  await page.getByRole('button', { name: 'Igen, cseréld le' }).click()
  assert.equal(await page.locator('#finance-amount').inputValue(), '8.490')
  assert.match(await page.locator('#finance-receipt-ocr-status').textContent(), /beírva/)

  await page.locator('#finance-receipt').setInputFiles({ name: 'blokk.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') })
  await page.locator('#finance-receipt-name').getByText('blokk.pdf').waitFor()
  assert.equal(await scan.isDisabled(), true)
  assert.match(await page.locator('#finance-receipt-ocr-status').textContent(), /PDF/)
  console.log('Finance receipt OCR browser test passed.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
