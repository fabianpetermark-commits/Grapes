import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for the Grapes TEST login review.')
const base = 'http://127.0.0.1:4185'
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4185', '--strictPort'], {cwd: root, stdio: ['ignore','pipe','pipe']})
let browser
try {
  for (let attempt=0; attempt<80; attempt++) {
    try {if ((await fetch(base+'/Grapes/login-auth-test.html')).ok) break} catch {}
    if (attempt===79) throw new Error('Vite TEST server did not start')
    await new Promise(done=>setTimeout(done,100))
  }
  browser = await chromium.launch({executablePath: browserPath, headless:true, args:['--no-sandbox']})
  for (const width of [320,360,390,412,1440]) {
    const context = await browser.newContext({viewport:{width,height:width===1440?900:640}})
    const page = await context.newPage()
    const outbound = []
    page.on('request', req => {if(!req.url().startsWith(base+'/')) outbound.push(req.url())})
    await page.goto(base+'/Grapes/login-auth-test.html')
    assert.equal(await page.title(),'Grapes TEST – Bejelentkezés')
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.login-page')).backgroundColor),'rgb(0, 0, 0)')
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.login-card')).backgroundColor),'rgb(8, 15, 20)')
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.submit-button')).backgroundColor),'rgb(59, 220, 242)')
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`TEST login horizontal overflow at ${width}px`)
    assert.equal(await page.locator('.submit-button').isDisabled(),true,'unconfigured TEST login must be disabled')
    assert.equal(await page.locator('#google-sign-in').isDisabled(),true,'unconfigured TEST Google redirect must be disabled')
    assert.equal(await page.locator('#grapes-sign-out').isHidden(),true)
    await page.locator('#grapes-username').fill('never-store@example.invalid')
    await page.locator('#grapes-password').fill('synthetic-test-only')
    await page.locator('#toggle-password').click()
    assert.equal(await page.locator('#grapes-password').getAttribute('type'),'text')
    await page.locator('#toggle-password').click()
    assert.equal(await page.locator('#grapes-password').getAttribute('type'),'password')
    assert.match(await page.locator('#grapes-feedback').textContent(),/még nincs konfigurálva/)
    assert.deepEqual(outbound,[],'disabled TEST preview must not call Supabase or Google')
    assert.deepEqual(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]})
    await context.close()
  }
  console.log('Grapes TEST disabled-by-default auth UI preserved at 320/360/390/412/1440px; no external requests or credential storage.')
} finally {
  await browser?.close()
  server.kill()
}
