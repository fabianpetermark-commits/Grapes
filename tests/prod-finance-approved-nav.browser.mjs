import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(chrome, 'Chrome required for production Finance visual/functional regression')
const port = 4272
const host = 'http://127.0.0.1:' + port
const server = spawn(process.execPath,
  [resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1',
  '--port',String(port),'--strictPort'],
  { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_GOOGLE_CLIENT_ID:'finance-ui-test' } })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(host)).ok) break } catch {}
    if (server.exitCode !== null || i === 99) throw Error('Finance Vite server unavailable')
    await new Promise(done => setTimeout(done,100))
  }
  browser = await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  for (const width of [320,360,390,412]) {
    const ctx = await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true})
    await ctx.addInitScript(() => {
      sessionStorage.setItem('grapes-drive-session',JSON.stringify({
        clientId:'finance-ui-test',accessToken:'finance-fixture',expiresAt:Date.now()+3600000,
        scopes:'https://www.googleapis.com/auth/drive.file',
        account:{name:'Fixture',email:'fixture@example.test'}
      }))
    })
    await ctx.route('https://www.googleapis.com/**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({files:[]})
    }))
    await ctx.route('https://accounts.google.com/**',route=>route.abort())
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror',err => errors.push(err.message))
    await page.goto(host+'/?module=finance')
    await page.waitForFunction(()=>document.querySelector('#finance-save-status')?.textContent==='Kész',{timeout:15000})
    const nav=page.locator('.finance__tabs [data-finance-tab]')
    assert.equal(await nav.count(),5)
    const names={overview:'Áttekintés',transaction:'Új tétel',savings:'Megtakarítások',forecast:'Előrejelzés',import:'Importálás'}
    for (const [key,name] of Object.entries(names)) {
      const button=page.locator('[data-finance-tab="'+key+'"]')
      assert.equal(await button.getAttribute('aria-label'),name)
      assert.equal(await button.locator('svg.finance__tab-icon').count(),1)
      const rect=await button.boundingBox()
      assert.ok(rect && rect.width >= 42 && rect.height >= 44,
        'Finance '+key+' tap target too small on '+width+'px: '+JSON.stringify(rect))
      await button.click()
      assert.equal(await button.getAttribute('aria-selected'),'true')
      const panel=page.locator('[data-finance-panel="'+key+'"]')
      assert.ok(await panel.count() >= 1,'Missing original view '+key)
      assert.ok(await panel.first().isVisible(),'Real Finance '+key+' panel did not open')
    }
    assert.ok(await page.locator('[data-finance-tab="savings"] .finance__tab-icon path').count()>0)
    assert.ok(await page.locator('[data-finance-tab="import"] .finance__tab-icon path').count()>0)
    assert.equal(await page.locator('#finance-saving-submit').count(),1,'Existing savings submit preserved')
    assert.equal(await page.locator('#finance-import-btn').count(),1,'Existing import opener preserved')
    assert.equal(await page.locator('#finance-backup-export-btn').count(),1,'Backup export still present')
    assert.equal(await page.locator('#finance-drive-save').count(),1,'Drive save still present')
    const dims=await page.locator('.finance__tabs').evaluate(el=>({
      scroll:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button')].map(e=>e.getBoundingClientRect().width)
    }))
    assert.ok(dims.scroll <= dims.client+2,
      'Five-icon Finance rail must not scroll sideways: '+width+' '+JSON.stringify(dims))
    assert.deepEqual(errors,[],'Unexpected runtime errors at '+width+'px')
    await ctx.close()
  }
  console.log('PASS: five actual Finance tabs, Savings piggy icon, Import download glyph, unchanged backup/Drive/savings actions, 320/360/390/412 mobile')
} finally {
  await browser?.close()
  server.kill()
}
