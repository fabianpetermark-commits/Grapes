// Optional live diagnostic. Does not import or save user data and is not a CI assertion.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const brokerUrl = readFileSync('.github/workflows/release-android.yml', 'utf8').match(/VITE_FOOD_BROKER_URL: (\S+)/)?.[1]
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4196', '--strictPort'], { env: { ...process.env, VITE_FOOD_BROKER_URL: brokerUrl }, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:4196')).ok) break } catch {}
    if (i === 79) throw new Error('Vite nem indult.')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4196/Grapes/design/android-mobile-preview.html')
  const results = await page.evaluate(async () => {
    const api = await import('/Grapes/src/food/food-api.js')
    const results = await Promise.allSettled([
      api.searchOpenFoodFactsProducts('keksz', { signal: AbortSignal.timeout(20000) }),
      api.searchFatSecretProducts('keksz', { timeoutMs: 20000 }),
    ])
    return results.map((result, index) => ({ provider: ['Open Food Facts', 'FatSecret'][index], status: result.status, ...(result.status === 'fulfilled' ? { count: result.value.count, names: result.value.products.slice(0, 3).map(item => item.name) } : { error: result.reason.message }) }))
  })
  console.log(JSON.stringify(results, null, 2))
} finally { await browser?.close(); server.kill() }
