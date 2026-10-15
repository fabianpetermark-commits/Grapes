import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4198', '--strictPort'], { stdio: 'ignore' })
const url = 'http://127.0.0.1:4198/Grapes/design/android-mobile-preview.html'
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 79) throw new Error('Vite nem indult el.')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.yazioCalls = []; window.failYazio = false
    window.GrapesAndroid = { postMessage(raw) {
      const { method, args, requestId } = JSON.parse(raw)
      if (method !== 'yazio') return
      window.yazioCalls.push(args[0]) // No credential logging, even in tests.
      let payload = {}
      if (args[0] === 'login') payload = { session: 'test-session' }
      if (args[0] === 'day') payload = { products: [{ id: 'test-entry', product_id: 'egg', amount: 50, date: args[2] + ' 08:30:00', daytime: 'breakfast' }] }
      if (args[0] === 'product') payload = { name: 'Teszt tojás', base_unit: 'g', nutrients: { 'energy.energy': 1.43 } }
      const ok = !(window.failYazio && args[0] === 'day')
      setTimeout(() => window.dispatchEvent(new CustomEvent('grapes:android-result', { detail: { requestId, ok, payload: JSON.stringify(payload), error: 'Teszt: YAZIO elérhetetlen' } })), 10)
    } }
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-local]').click(); await page.locator('[data-nav="sync"]').click()
  const openAndFill = async () => {
    await page.locator('[data-yazio-import]').click()
    const form = page.locator('[data-yazio-api-form]')
    await form.locator('[name=email]').fill('test@example.com')
    await form.locator('[name=password]').fill('test-only-password')
    await form.locator('[name=from]').fill('2026-10-14')
    await form.locator('[name=to]').fill('2026-10-14')
    return form
  }
  let form = await openAndFill()
  await page.locator('[data-yazio-api-guide-open]').click()
  assert.match(await page.locator('[data-yazio-guide-title]').innerText(), /E-mailes YAZIO-fiók/)
  for (let index = 0; index < 5; index++) await page.locator('[data-yazio-guide-next]').click()
  assert.match(await page.locator('[data-yazio-guide-title]').innerText(), /Szinkronizálás a Grapesben/)
  await page.locator('[data-yazio-guide-close]').click()
  assert.equal(await page.locator('[data-yazio-api-guide]').isVisible(), false)
  await form.getByRole('button', { name: 'Szinkronizálás' }).click()
  await page.locator('[data-food-yazio-sheet].is-open').waitFor()
  assert.equal(await form.locator('[name=password]').inputValue(), '')
  assert.match(await page.locator('[data-yazio-records]').innerText(), /Teszt tojás/)
  const download = page.waitForEvent('download')
  await page.locator('[data-yazio-confirm]').click(); await download
  await page.waitForFunction(() => !document.querySelector('[data-food-yazio-sheet]').classList.contains('is-open'))
  const project = await page.evaluate(async () => {
    const { loadLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    return (await loadLocalProject('food-tracker-local-food-profile')).data
  })
  assert.equal(project.diaryEntries.length, 1)
  assert.equal(project.diaryEntries[0].snapshot.nutrients.energyKcal, 71.5)
  assert.ok(!JSON.stringify(project).includes('test-only-password'))
  await page.waitForFunction(() => window.yazioCalls.includes('logout'))
  form = await openAndFill()
  await form.getByRole('button', { name: 'Szinkronizálás' }).click()
  await page.locator('[data-food-yazio-sheet].is-open').waitFor()
  assert.match(await page.locator('[data-yazio-summary]').innerText(), /1 korábbi/)
  await page.locator('[data-yazio-cancel]').click()
  await page.waitForFunction(() => window.yazioCalls.filter(x => x === 'logout').length === 2)
  await page.evaluate(() => { window.failYazio = true })
  form = await openAndFill(); await form.getByRole('button', { name: 'Szinkronizálás' }).click()
  await page.locator('[data-yazio-api-status]').filter({ hasText: 'elérhetetlen' }).waitFor()
  assert.equal(await page.locator('[data-food-yazio-sheet]').getAttribute('aria-hidden'), 'true')
  await page.waitForFunction(() => window.yazioCalls.filter(x => x === 'logout').length === 3)
  assert.deepEqual(errors, [])
  console.log('YAZIO API mobilfolyam: belépés, jelszótörlés, előnézet, mentés, duplikáció és hibaút rendben (szimulált API).')
} finally { await browser?.close(); server.kill() }
