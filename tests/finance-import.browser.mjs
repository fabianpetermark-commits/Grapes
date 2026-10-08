import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((path) => path && existsSync(path))
if (!executablePath) throw new Error('Chromium böngésző szükséges az Excel-import böngészőtesztjéhez.')

function workbookBuffer() {
  const workbook = XLSX.utils.book_new()
  const monthly = XLSX.utils.aoa_to_sheet([
    ['Jan', '', '', 'Feb', ''],
    ['Tétel', 'Összeg', '', 'Tétel', 'Összeg'],
    ['Telekom', 42300, '', 'FIZU', -516540],
    ['Összesen', { f: 'SUM(B3:B3)', v: 42300 }, '', 'Összesen', { f: 'SUM(E3:E3)', v: -516540 }],
  ])
  monthly['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
  ]
  XLSX.utils.book_append_sheet(workbook, monthly, 'Havi kiadások 2027')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Tétel', 'Összeg'], ['Vésztartalék', 50000], ['Részösszeg', { f: 'SUM(B2:B2)', v: 50000 }],
  ]), 'Félretett')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Egyenleg', { f: '42300-516540', v: -474240 }],
  ]), 'Áttekintés')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'finance-import-test' }, stdio: 'ignore',
})
let browser
try {
  for (let index = 0; index < 80; index += 1) {
    try { if ((await fetch('http://127.0.0.1:4175')).ok) break } catch {}
    if (index === 79) throw new Error('A tesztszerver nem indult el.')
    await new Promise((done) => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem('grapes-drive-session', JSON.stringify({
    clientId: 'finance-import-test', accessToken: 'finance-import-token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file', account: { name: 'Test', email: 'test@example.com' },
  })))
  await context.route('https://www.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }))
  await context.route('https://accounts.google.com/**', (route) => route.abort())
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`browser:error: ${error.message}`))
  await page.goto('http://127.0.0.1:4175/?module=finance')
  await page.waitForFunction(() => document.querySelector('#finance-save-status')?.textContent === 'Kész')
  await page.locator('#finance-import-btn').click()
  assert.equal(await page.locator('[data-finance-tab="import"]').getAttribute('aria-selected'), 'true')
  await page.locator('#finance-workbook-input').setInputFiles({
    name: 'Havi_koltesek_formazva-okgpt.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbookBuffer(),
  })
  await page.locator('.finance__import-block').first().waitFor()
  assert.equal(await page.locator('.finance__import-block').count(), 3)
  assert.equal(await page.locator('.finance__import-block').filter({ hasText: 'Áttekintés' }).count(), 0)

  const january = page.locator('.finance__import-block').filter({ hasText: '2027-01 felismerve' })
  const february = page.locator('.finance__import-block').filter({ hasText: '2027-02 felismerve' })
  const savings = page.locator('.finance__import-block').filter({ hasText: 'Félretett' })
  await january.getByLabel('Alapértelmezett kategória').selectOption({ label: 'Számlák' })
  await february.getByLabel('Importálás célja').selectOption('income')
  await savings.getByLabel('Alapértelmezett hónap').fill('2027-01')
  await page.locator('#finance-import-review').click()
  await page.locator('.finance__import-review-table tbody tr').first().waitFor()
  assert.equal(await page.locator('.finance__import-review-table tbody tr').count(), 3)
  assert.match(await page.locator('#finance-import-summary').textContent(), /3 importálható/)
  assert.match(await page.locator('.finance__import-review-table tbody').textContent(), /2027-01-01/)
  await page.locator('#finance-import-commit').click()
  await page.locator('[data-finance-tab="overview"][aria-selected="true"]').waitFor()
  assert.equal(await page.locator('#finance-rows tr').count(), 2)
  assert.match(await page.locator('#finance-savings-total').textContent(), /50[.\s]000/)

  await page.waitForTimeout(600)
  await page.locator('[data-finance-tab="import"]').click()
  await page.locator('#finance-workbook-input').setInputFiles({
    name: 'Havi_koltesek_formazva-okgpt.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbookBuffer(),
  })
  await page.locator('.finance__import-block').first().waitFor()
  await page.locator('.finance__import-block').filter({ hasText: '2027-02 felismerve' }).getByLabel('Importálás célja').selectOption('income')
  await page.locator('.finance__import-block').filter({ hasText: 'Félretett' }).getByLabel('Alapértelmezett hónap').fill('2027-01')
  await page.locator('#finance-import-review').click()
  assert.equal(await page.locator('.finance__import-duplicate').count(), 3)
  await page.locator('#finance-import-commit').click()
  await page.getByText(/lehetséges duplikációról döntened kell/).waitFor()
  assert.equal(await page.locator('[data-finance-tab="import"][aria-selected="true"]').count(), 1)

  await page.setViewportSize({ width: 360, height: 800 })
  const mobileLayout = await page.locator('#finance-app').evaluate((node) => ({
    clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
    wide: [...node.querySelectorAll('*')].filter((item) => item.getBoundingClientRect().right > node.clientWidth + 1)
      .slice(0, 8).map((item) => `${item.tagName}.${item.className}:${Math.round(item.getBoundingClientRect().right)}`),
  }))
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.clientWidth + 1, JSON.stringify(mobileLayout))
  assert.ok(await page.locator('#finance-import-commit').evaluate((node) => node.getBoundingClientRect().height >= 44))

  await page.locator('#finance-import-reset').click()
  await page.locator('#finance-workbook-input').setInputFiles({
    name: 'grapes-export.csv', mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFFDátum;Típus;Kategória;Összeg;Pénznem;Megjegyzés\n2027-03-01;Kiadás;Élelmiszer;12000;HUF;Bevásárlás\n2027-03-02;Bevétel;Munkabér;500000;HUF;Fizetés', 'utf8'),
  })
  await page.locator('.finance__import-block').first().waitFor()
  assert.equal(await page.locator('.finance__import-block').count(), 1)
  assert.equal(await page.locator('.finance__import-block').getByLabel('Importálás célja').inputValue(), 'auto')

  console.log('✓ Univerzális pénzügyi Excel-import: blokkok, előnézet, mentés és duplikációs döntés')
} finally {
  await browser?.close()
  server.kill()
}
