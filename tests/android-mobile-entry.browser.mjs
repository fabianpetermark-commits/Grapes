import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4180'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)

if (!executablePath) throw new Error('Nem található Chromium-alapú böngésző.')

const server = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4180', '--strictPort'], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`A Vite nem indult el.\n${output}`)
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`A Vite nem lett elérhető időben.\n${output}`)
}

await waitForServer()
const browser = await chromium.launch({ executablePath, headless: true })

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'GrapesAndroid', { value: { postMessage() {} }, configurable: true })
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('#continue-local').click()
  await page.locator('#pick-mobile-preview').waitFor({ state: 'visible' })
  await page.locator('#pick-mobile-preview').click()
  await page.waitForURL('**/design/android-mobile-preview.html')
  await page.locator('[data-local]').click()
  await page.locator('[data-module="food"]').last().click()
  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#app-title').textContent(), 'Víz')
  console.log('Android-only mobile preview entry and Water flow: OK')
} finally {
  await browser.close()
  server.kill()
}
