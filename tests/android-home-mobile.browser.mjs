import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4184/Grapes/design/android-mobile-preview.html'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4184', '--strictPort'], {
  cwd: projectRoot,
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', chunk => {
    serverOutput = (serverOutput + chunk.toString()).slice(-4000)
  })
}
let browser

try {
  let lastProbe = 'Nem érkezett válasz.'
  let serverReady = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) break
    try {
      const response = await fetch(url)
      if (response.ok) {
        serverReady = true
        break
      }
      lastProbe = `HTTP ${response.status} (${response.url})`
    } catch (error) {
      lastProbe = error.message
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  if (!serverReady) {
    throw new Error(`A Home mobil tesztszervere nem érhető el: ${lastProbe}; Vite kilépési kód: ${server.exitCode ?? 'fut'}; Vite kimenet:\n${serverOutput || '(nincs kimenet)'}`)
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-page="home"]').waitFor({ state: 'visible', timeout: 7000 }).catch(async error => {
    const state = await page.evaluate(() => ({
      appHidden: document.querySelector('#app')?.hidden,
      loginHidden: document.querySelector('#login')?.hidden,
      household: Boolean(document.querySelector('[data-household-root]')),
      scripts: [...document.scripts].map(x => x.src),
      localMode: localStorage.getItem('grapes-local-mode'),
    }))
    throw new Error('Home bootstrap: ' + JSON.stringify({ state, pageErrors, message: error.message }))
  })
  assert.equal(await page.locator('[data-nav="home"]').count(), 1)
  assert.equal(await page.locator('[data-menu-group]').count(), 5)
  await page.locator('[data-menu-group="home"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-household-root]').textContent(), /Helyi adatok/)
  assert.equal(await page.locator('[data-household-tabs]').count(),0)
  assert.equal(await page.locator('[data-household-shopping]').isVisible(),true)
  assert.equal(await page.locator('[data-household-inventory]').isVisible(),true)
  assert.equal(await page.locator('[data-household-suggestions]').isVisible(),true)

  // Keep an untouched baseline screenshot for visual review before the test mutates Home data.
  mkdirSync('artifacts/ui-visual-audit', { recursive: true })
  await page.screenshot({ path: 'artifacts/ui-visual-audit/home-390.png', fullPage: true })

  await page.locator('[data-household-shopping] [data-household-add="shopping"]').click()
  await page.locator('[data-household-form] [name="name"]').fill('Csirkemell')
  await page.locator('[data-household-form] [name="quantity"]').fill('1')
  await page.locator('[data-household-form] [name="unit"]').selectOption('kg')
  await page.locator('[data-household-form] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-items] .household-card').count(), 1)
  await page.locator('[data-household-check]').click()
  assert.match(await page.locator('[data-household-items]').textContent(), /Elintézve/)
  assert.equal(await page.locator('[data-household-inventory]').isVisible(),true)
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 0, 'A bevásárlólista nem készlet.')

  await page.locator('[data-household-add="inventory"]').click()
  await page.locator('[data-household-form] [name="name"]').fill('Csirkemell')
  await page.locator('[data-household-form] [name="quantity"]').fill('1')
  await page.locator('[data-household-form] [name="unit"]').selectOption('kg')
  await page.locator('[data-household-form] [name="storageLocation"]').selectOption('fridge')
  await page.locator('[data-household-form] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1)

  await page.locator('[data-household-split-id]').click()
  await page.locator('[data-household-split] [name="fridgeQuantity"]').fill('600')
  assert.equal(await page.locator('[data-household-split] [name="unit"]').inputValue(), 'g')
  assert.match(await page.locator('[data-household-split-preview]').textContent(), /600 g hűtő · 400 g fagyasztó/)
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1, 'Az előnézet nem írhat készletet.')
  await page.locator('[data-household-split] button[type="submit"]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 2)
  assert.match(await page.locator('[data-household-lots]').textContent(), /0,6 kg/)
  assert.match(await page.locator('[data-household-lots]').textContent(), /0,4 kg/)
  await page.locator('[data-household-undo]').click()
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 1)
  assert.match(await page.locator('[data-household-lots]').textContent(), /1 kg/)

  await page.locator('[data-household-split-id]').click()
  await page.locator('[data-household-preset="half"]').click()
  await page.locator('[data-household-split] button[type="submit"]').click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-menu-group="home"]').click()
  await page.locator('[data-page="household"]').waitFor({state:'visible'})
  assert.equal(await page.locator('[data-household-lots] .household-card').count(), 2, 'A készlet nem maradt meg újraindítás után.')
  assert.match(await page.locator('[data-household-items]').textContent(), /Elintézve/)

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))
    assert.ok(layout.content <= layout.viewport, `A Home vízszintesen kilóg ${width}px szélességen.`)
  }
  await page.locator('[data-household-add="inventory"]').click()
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true)
  assert.equal(await page.locator('[data-household-form]').isVisible(), false)
  assert.equal(await page.evaluate(() => window.grapesHandleAndroidBack()), true)
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="household"]').isVisible(), false)
  assert.ok((await page.evaluate(() => localStorage.getItem('grapes-home-household-v1')))?.includes('Csirkemell'))
  console.log('Home TEST browser flow: készlet, 600/400, lista, mentés, undo, visszalépés, 320–412 px rendben.')
} finally {
  await browser?.close()
  server.kill()
}
