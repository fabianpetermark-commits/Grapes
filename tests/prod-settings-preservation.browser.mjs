import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = 4269
const url = `http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p))
assert.ok(chrome, 'Chromium is needed to verify the real PROD Settings page')
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port',
    String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 99 || server.exitCode !== null) throw Error('Vite not started')
    await new Promise(r => setTimeout(r, 100))
  }
  browser = await chromium.launch({executablePath:chrome, headless:true,
    args:['--no-sandbox']})
  const ctx = await browser.newContext({viewport:{width:390,height:844}})
  const page = await ctx.newPage()
  await page.goto(url, {waitUntil:'networkidle'})
  await page.locator('[data-local]').click()
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-page="more"]').waitFor({state:'visible'})
  assert.equal((await page.locator('[data-page="more"] h1').textContent()).trim(),
    'Beállítások', 'Approved title, no redundant Továbbiak title')
  assert.deepEqual(await page.locator('[data-page="more"] .grapes-settings-card h2')
    .allTextContents(), ['Fiók és Otthon','Adatkapcsolatok','Megjelenés','Adatkezelés'])

  // Existing PROD interactive controls stay in place; no mock sign in.
  assert.equal(await page.locator('[data-account-login]').count(), 1)
  assert.equal(await page.locator('[data-prod-auth-signout]').count(), 1)
  assert.equal(await page.locator('[data-prod-auth-signout]').isVisible(), false)
  assert.equal(await page.locator('[data-page="more"] [data-nav="sync"]').count(),1,
    'Preserve the original Settings -> full Sync entry point')
  assert.equal(await page.locator('[data-page="more"] [data-nav="projects"]').count(),1)

  for (const provider of ['drive','health','samsung','yazio']) {
    const row = page.locator('[data-page="more"] [data-settings-provider="'+provider+'"]')
    assert.equal(await row.count(),1)
    assert.equal(await row.isVisible(),true)
  }
  for (const provider of ['drive','health','samsung']) {
    const row = page.locator('[data-page="more"] [data-settings-provider="'+provider+'"]')
    assert.equal(await row.locator('[role="img"][aria-label="Kapcsolat állapota még nem ellenőrzött"]').count(),1,
      'Unknown must be expressed by a warning triangle, not a false error')
  }
  assert.equal(await page.locator('[data-page="more"] [data-settings-provider="yazio"] [role="img"]').count(),0,
    'YAZIO import must not pretend to be a current online connection')
  // Direct provider navigation does not start an import or permission dialog.
  const destinations={drive:'[data-connect-drive]',health:'[data-health-sync]',
    samsung:'[data-samsung-sync-action]',yazio:'[data-yazio-import]'}
  for(const [provider,target] of Object.entries(destinations)){
    await page.locator('[data-page="more"] [data-settings-provider="'+provider+'"]').click()
    await page.locator('[data-page="sync"]').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-page="sync"] '+target).isVisible(),true,
      'Existing action missing from live Sync page: '+provider)
    await page.locator('.appbar [data-nav="more"]').click()
    await page.locator('[data-page="more"]').waitFor({state:'visible'})
  }
  await page.locator('[data-page="more"] [data-nav="projects"]').click()
  await page.locator('[data-page="projects"]').waitFor({state:'visible'})
  await page.locator('.appbar [data-nav="more"]').click()
  await page.locator('[data-settings-open-home]').click()
  await page.locator('[data-page="household"]').waitFor({state:'visible'})
  // Previous root route to Health + Food remains available.
  await page.locator('.appbar [data-nav="home"]').click()
  const healthRail=page.locator('[data-main-rail] [data-main-nav="health"]')
  if(await healthRail.count()) await healthRail.click()
  else await page.locator('[data-page="home"] [data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"]').waitFor({state:'visible'})
  console.log('PASS: PROD Settings v1.2 grouped; Drive/Health/Samsung/YAZIO real shortcuts; older Auth, projects, Home, Health retained.')
} finally {
  await browser?.close()
  server.kill()
}
