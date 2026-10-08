import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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
if (!executablePath) throw new Error('Chromium böngésző szükséges a pénzügyi mentés böngészőtesztjéhez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4174', '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'finance-test-client' }, stdio: 'ignore',
})
let browser
let driveCreates = 0
let driveUpdates = 0
const driveUpdateUrls = []
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:4174')).ok) break } catch {}
    if (i === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((done) => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => sessionStorage.setItem('grapes-drive-session', JSON.stringify({
    clientId: 'finance-test-client', accessToken: 'finance-test-token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file', account: { name: 'Test', email: 'test@example.com' },
  })))
  await context.route('https://www.googleapis.com/**', (route) => {
    const request = route.request()
    if (request.url().includes('/upload/drive/v3/files') && request.method() === 'POST') {
      driveCreates += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'finance-file-1' }) })
    }
    if (request.url().includes('/upload/drive/v3/files/finance-file-1') && request.method() === 'PATCH') {
      driveUpdates += 1; driveUpdateUrls.push(request.url())
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) })
  })
  await context.route('https://accounts.google.com/**', (route) => route.abort())
  const page = await context.newPage()
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('http://127.0.0.1:4174/?module=finance')
  await page.locator('[data-finance-tab="transaction"]').click()
  await page.locator('#finance-form').waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('#finance-save-status')?.textContent === 'Kész')
  await page.selectOption('#finance-currency', 'EUR')
  await page.fill('#finance-amount', '7000')
  assert.equal(await page.locator('#finance-amount').inputValue(), '7.000')
  await page.fill('#finance-category', 'Teszt')
  await page.locator('#finance-receipt').setInputFiles({ name: 'szamla.pdf', mimeType: 'application/pdf', buffer: Buffer.from('abc') })
  await page.locator('#finance-receipt-name').getByText('szamla.pdf').waitFor()
  await page.locator('#finance-form button[type="submit"]').click()
  assert.equal(await page.locator('#finance-currency').isDisabled(), true)
  assert.equal(await page.locator('#finance-rows tr').count(), 1)
  await page.getByRole('button', { name: 'Tétel szerkesztése' }).click()
  assert.equal(await page.locator('#finance-amount').inputValue(), '7.000')
  await page.fill('#finance-amount', '7500')
  assert.equal(await page.locator('#finance-amount').inputValue(), '7.500')
  await page.locator('#finance-transaction-submit').click()
  assert.match(await page.locator('#finance-rows tr').textContent(), /7500/)
  await page.locator('[data-finance-tab="transaction"]').click()
  await page.locator('#finance-planned').check()
  await page.fill('#finance-amount', '3000')
  await page.fill('#finance-category', 'Tervezett teszt')
  await page.locator('#finance-transaction-submit').click()
  assert.equal(await page.locator('#finance-rows tr').count(), 2)
  assert.match((await page.locator('#finance-expense').textContent()).replace(/[.\s]/g, ''), /^7500/)
  assert.match(await page.locator('#finance-expense-count').textContent(), /1 tényleges · 1 tervezett/)
  assert.equal(await page.locator('.finance__type--planned').textContent(), 'Tervezett')
  assert.match((await page.locator('.finance__bar--planned').last().getAttribute('title')).replace(/[.\s]/g, ''), /3000/)
  await page.waitForTimeout(3000)
  assert.equal(driveCreates, 1)

  await page.locator('[data-finance-tab="savings"]').click()
  await page.fill('#finance-goal-name', 'Vésztartalék')
  await page.fill('#finance-goal-amount', '100000')
  assert.equal(await page.locator('#finance-goal-amount').inputValue(), '100.000')
  await page.locator('#finance-goal-form button[type="submit"]').click()
  await page.fill('#finance-saving-amount', '10000')
  assert.equal(await page.locator('#finance-saving-amount').inputValue(), '10.000')
  await page.selectOption('#finance-saving-goal', { label: 'Vésztartalék' })
  await page.locator('#finance-saving-form button[type="submit"]').click()
  await page.getByRole('button', { name: 'Megtakarítási mozgás szerkesztése' }).click()
  await page.fill('#finance-saving-amount', '12500')
  assert.equal(await page.locator('#finance-saving-amount').inputValue(), '12.500')
  await page.locator('#finance-saving-submit').click()
  await page.locator('[data-finance-tab="forecast"]').click()
  await page.selectOption('#finance-forecast-history', '12')
  await page.waitForTimeout(3000)
  assert.ok(driveUpdates >= 1)
  assert.ok(driveUpdateUrls.every((url) => url.includes('/finance-file-1')))
  await page.locator('[data-finance-tab="overview"]').click()
  assert.match(await page.locator('#finance-savings-total').textContent(), /12[.\s]500/)
  assert.match((await page.locator('.finance__bar--savings').last().getAttribute('title')).replace(/[.\s]/g, ''), /12500/)

  const firstDownload = page.waitForEvent('download')
  await page.locator('#finance-delete-all').click()
  await page.getByRole('button', { name: 'Igen, készíts mentést' }).click()
  const download = await firstDownload
  await page.getByRole('button', { name: /Igen, töröld mind/ }).click()
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  assert.equal(backup.data.currency, 'EUR')
  assert.equal(backup.data.transactions[0].receipt.data, 'data:application/pdf;base64,YWJj')
  assert.equal(backup.data.savingsGoals[0].name, 'Vésztartalék')
  assert.equal(backup.data.transactions[0].amount, 7500)
  assert.equal(backup.data.transactions.find((item) => item.planned)?.amount, 3000)
  assert.equal(backup.data.savingsEntries[0].amount, 12500)
  assert.equal(backup.data.forecastSettings.historyMonths, 12)
  await page.locator('#finance-rows tr').waitFor({ state: 'detached' })
  assert.equal(await page.locator('#finance-rows tr').count(), 0)

  await page.reload()
  await page.waitForFunction(() => document.querySelector('#finance-save-status')?.textContent === 'Kész')
  await page.locator('#finance-restore-last').click()
  await page.locator('#finance-rows tr').first().waitFor()
  assert.equal(await page.locator('#finance-currency').inputValue(), 'EUR')
  assert.equal(await page.locator('.finance__receipt-link').textContent(), 'szamla.pdf')
  const secondDownload = page.waitForEvent('download')
  await page.locator('#finance-delete-all').click()
  await page.getByRole('button', { name: 'Igen, készíts mentést' }).click()
  await secondDownload
  await page.getByRole('button', { name: /Igen, töröld mind/ }).click()
  await page.locator('#finance-rows tr').waitFor({ state: 'detached' })
  await page.locator('#finance-backup-input').setInputFiles(await download.path())
  await page.locator('#finance-rows tr').first().waitFor()
  assert.equal(await page.locator('.finance__receipt-link').textContent(), 'szamla.pdf')
  console.log('✓ Pénzügyi teljes mentés, törlés, helyi és fájlból történő visszaállítás bizonylattal')
  await context.close()
} finally {
  await browser?.close()
  server.kill()
}
