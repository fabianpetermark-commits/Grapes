import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(v=>v&&existsSync(v))
assert.ok(chrome,'Chromium required for Samsung CSV owner Water test')
const port=4241,url=`http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const fileContent=[
  'com.samsung.health.water_intake.datauuid,com.samsung.health.water_intake.start_time,com.samsung.health.water_intake.amount,com.samsung.health.water_intake.pkg_name',
  'samsung-water-1,1792919700000,250,com.sec.android.app.shealth',
  'samsung-water-2,1792920300000,300,com.sec.android.app.shealth'
].join('\n')
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<130;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(server.exitCode!==null||i===129)throw Error('Samsung water UI fixture unavailable')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:410,height:900}})
  await ctx.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const subject=localStorage.getItem('__samsung_owner')||
        '00000000-0000-4000-8000-000000000001'
      const payload=method==='getTestAuthEnabled'?'true':
        method==='getTestAuthSubject'?subject:''
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{
        detail:{requestId,ok:true,payload}})))
    }}
  })
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.log('SAMSUNG CSV PAGEERROR',e.message)})
  await page.goto(url)
  await page.waitForTimeout(700)
  console.log('SAMSUNG CSV DOM',await page.evaluate(()=>({
    loginHidden:document.querySelector('#login')?.hidden,
    appHidden:document.querySelector('#app')?.hidden,
    navVisible:[...document.querySelectorAll('[data-nav="more"]')].map(x=>({display:getComputedStyle(x).display,html:x.outerHTML.slice(0,90)})),
  })))
  async function openSamsung() {
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    const button=page.locator('[data-samsung-sync-action]')
    assert.equal(await button.textContent(),'CSV-import')
    await button.click()
    await page.locator('[data-water-health-sheet].is-open').waitFor()
    assert.match(await page.locator('[data-water-health-sheet] h2').textContent(),/Samsung Health/)
    await page.locator('[data-samsung-water-csv-input]').setInputFiles({
      name:'com.samsung.health.water_intake.20261026.csv',
      mimeType:'text/csv',buffer:Buffer.from(fileContent,'utf8')
    })
    await page.waitForFunction(()=>document.querySelector('[data-water-health-summary]')
      ?.textContent?.includes('vízbejegyzés'),{timeout:20000})
  }
  await openSamsung()
  assert.match(await page.locator('[data-water-health-summary]').textContent(),/2 új vízbejegyzés/)
  assert.equal(await page.locator('[data-water-health-record]').count(),2)
  // Import exactly one water entry to show that selection is manual.
  await page.locator('[data-water-health-record]').nth(1).uncheck()
  await page.locator('[data-water-health-confirm]').click()
  await page.waitForFunction(()=>Boolean(localStorage.getItem(
    'grapes-water-v2:00000000-0000-4000-8000-000000000001')))
  const a=await page.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001'))
    return d['2026-10-25']?.entries?.map(e=>({amount:e.amount,key:e.externalKey}))
  })
  assert.deepEqual(a,[{amount:250,key:'samsunghealth:com.sec.android.app.shealth:samsung-water-1'}])
  await page.evaluate(B=>localStorage.setItem('__samsung_owner',B),B)
  await page.reload()
  await openSamsung()
  assert.match(await page.locator('[data-water-health-summary]').textContent(),/2 új vízbejegyzés/)
  await page.keyboard.press('Escape')
  await page.evaluate(A=>localStorage.setItem('__samsung_owner',A),A)
  await page.reload()
  await openSamsung()
  assert.match(await page.locator('[data-water-health-summary]').textContent(),/1 már importálva/)
  assert.match(await page.locator('[data-water-health-summary]').textContent(),/1 új vízbejegyzés/)
  assert.equal(await page.locator('[data-water-health-record]').nth(0).isDisabled(),true)
  assert.equal(await page.locator('[data-water-health-record]').nth(1).isDisabled(),false)
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: real mobile Samsung CSV picker/preview, selected Water save, A-B-A duplicate guard')
}finally{await browser?.close();server.kill()}
