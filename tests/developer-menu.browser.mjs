import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4182'
const developerEmail = 'projectsoundmodel@gmail.com'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(path => path && existsSync(path))
if (!executablePath) throw new Error('Chromium böngésző szükséges a fejlesztői menü tesztjéhez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4182', '--strictPort'], {
  cwd: root,
  env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'developer-test-client', VITE_DEVELOPER_EMAIL: developerEmail },
  stdio: 'ignore',
})

function session(email) {
  return {
    clientId: 'developer-test-client', accessToken: 'token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file',
    account: { id: email, name: 'Teszt', email, photo: '' },
  }
}

let browser
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) break } catch {}
    if (attempt === 79) throw new Error('A fejlesztői menü tesztszervere nem indult el.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })

  const developer = await browser.newContext()
  await developer.addInitScript(value => sessionStorage.setItem('grapes-drive-session', JSON.stringify(value)), session(developerEmail))
  await developer.route('https://www.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }))
  const page = await developer.newPage()
  await page.goto(baseUrl)
  await page.locator('#developer-menu-toggle').waitFor({ state: 'visible' })
  await page.locator('#developer-menu-toggle').click()
  await page.locator('#developer-panel').waitFor({ state: 'visible' })
  await page.locator('[data-developer-module="food"]').uncheck()
  assert.equal(await page.locator('#pick-food').isVisible(), true)
  assert.equal(await page.locator('#pick-food').isDisabled(), true)
  await page.goto(`${baseUrl}/?module=food`)
  await page.locator('#splash-screen').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#food-app').isVisible(), false)
  await developer.close()

  const visitor = await browser.newContext()
  await visitor.addInitScript(value => sessionStorage.setItem('grapes-drive-session', JSON.stringify(value)), session('visitor@example.com'))
  await visitor.route('https://www.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }))
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(baseUrl)
  assert.equal(await visitorPage.locator('#developer-menu-toggle').isHidden(), true)
  await visitor.close()

  console.log('✓ A fejlesztői fiók kapcsolhat modult; a látogató nem látja a fejlesztői menüt')
} finally {
  await browser?.close()
  server.kill()
}
