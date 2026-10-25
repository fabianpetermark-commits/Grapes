import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(chrome,'Chromium required for Water Health mobile A-B-A')
const port=4238, url=`http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],
{cwd:root,stdio:'ignore'})
let browser
try {
  for(let n=0;n<130;n++){
    try{if((await fetch(url)).ok)break}catch{}
    if(server.exitCode!==null||n===129)throw Error('Water Health mobile fixture not served')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,
    args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:410,height:900}})
  await ctx.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const owner=localStorage.getItem('__water_health_subject')||
        '00000000-0000-4000-8000-000000000001'
      const auth=localStorage.getItem('__water_health_logout')!=='1'
      const payload=method==='getTestAuthEnabled'?String(auth):
        method==='getTestAuthSubject'&&auth?owner:
        method==='readHealthData'?JSON.stringify({
          schemaVersion:1,producer:'hu.grapes.healthconnect',
          generatedAt:'2026-10-25T10:00:00Z',records:[
            {type:'nutrition',externalId:'healthconnect:qa:meal1',
              sourcePackage:'com.samsung.android.app.healthdata',
              startTime:'2026-10-25T08:00:00Z',
              endTime:'2026-10-25T08:05:00Z',
              energyKcal:420,mealType:'breakfast'},
            {type:'hydration',externalId:'healthconnect:qa:water1',
              sourcePackage:'com.samsung.android.app.healthdata',
              startTime:'2026-10-25T09:15:00Z',
              endTime:'2026-10-25T09:15:00Z',volumeMilliliters:250},
          ]}):''
      if(method==='readHealthData')localStorage.setItem('__water_health_native_reads',
        String(Number(localStorage.getItem('__water_health_native_reads')||0)+1))
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{
        detail:{requestId,ok:true,payload}})))
    }}
  })
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  const sheet=page.locator('[data-water-health-sheet]')
  async function openWaterSync(){
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    await page.locator('[data-water-health-open]').click()
    await sheet.locator('[data-water-health-read]').click()
    for (let attempt=0; attempt<110; attempt++) {
      const result=await page.evaluate(()=>{
        const summary=document.querySelector('[data-water-health-summary]')?.textContent||''
        const status=document.querySelector('[data-water-health-status]')?.textContent||''
        return {summary,status}
      })
      if(result.summary.includes('vízbejegyzés'))return
      if(result.status.includes('leállt'))throw Error('Native Water Health read: '+JSON.stringify(result))
      await page.waitForTimeout(120)
    }
    throw Error('Water Health preview timed out: '+await sheet.locator('[data-water-health-status]').textContent())
  }
  await page.evaluate(()=>{
    localStorage.setItem('grapes-water-v1','LEGACY-WATER-MUST-STAY')
    localStorage.setItem('grapes-home-household-v1','LEGACY-HOME-MUST-STAY')
  })
  await openWaterSync()
  assert.match(await sheet.locator('[data-water-health-summary]').textContent(),/1 új vízbejegyzés/)
  assert.match(await sheet.locator('[data-water-health-summary]').textContent(),/1 étkezés kihagyva/)
  const rows=sheet.locator('[data-water-health-records] input')
  assert.equal(await rows.count(),2)
  assert.equal(await rows.nth(0).isDisabled(),true)
  assert.equal(await rows.nth(1).isDisabled(),false)
  assert.equal(await rows.nth(1).isChecked(),true)
  await sheet.locator('[data-water-health-confirm]').click()
  await page.waitForFunction(()=>{
    const raw=localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001')
    return raw && JSON.parse(raw)['2026-10-25']?.entries?.length===1
  },{timeout:20000})
  const a=await page.evaluate(()=>{
    const days=JSON.parse(localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001'))
    return {amount:days['2026-10-25'].entries[0].amount,
      externalKey:days['2026-10-25'].entries[0].externalKey,
      count:days['2026-10-25'].entries.length,
      legacy:localStorage.getItem('grapes-water-v1'),
      home:localStorage.getItem('grapes-home-household-v1')}
  })
  assert.deepEqual(a,{
    amount:250,externalKey:'healthconnect:qa:water1',count:1,
    legacy:'LEGACY-WATER-MUST-STAY',home:'LEGACY-HOME-MUST-STAY',
  })
  // B gets empty Water, with A untouched in a separate key.
  await page.evaluate(B=>localStorage.setItem('__water_health_subject',B),B)
  await page.reload()
  const emptyB=await page.evaluate(()=>{
    const raw=localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000002')
    return raw===null
  })
  assert.equal(emptyB,true)
  await openWaterSync()
  assert.match(await sheet.locator('[data-water-health-summary]').textContent(),/1 új vízbejegyzés/)
  await sheet.locator('[data-water-health-confirm]').click()
  await page.waitForFunction(()=>{
    const raw=localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000002')
    return raw && JSON.parse(raw)['2026-10-25']?.entries?.length===1
  },{timeout:20000})
  await page.evaluate(A=>localStorage.setItem('__water_health_subject',A),A)
  await page.reload()
  await openWaterSync()
  assert.match(await sheet.locator('[data-water-health-summary]').textContent(),/0 új vízbejegyzés/)
  assert.match(await sheet.locator('[data-water-health-summary]').textContent(),/1 már importálva/)
  assert.equal(await sheet.locator('[data-water-health-confirm]').isHidden(),true)
  const oldA=await page.evaluate(()=>{
    const a=JSON.parse(localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001'))
    return {count:a['2026-10-25'].entries.length,legacy:localStorage.getItem('grapes-water-v1')}
  })
  assert.deepEqual(oldA,{count:1,legacy:'LEGACY-WATER-MUST-STAY'})
  // A permission dialog may resume after native sign-out; preview must close
  // and no old account data may remain visible in the sheet.
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
  // In a visible document this is also a native-Auth revalidation boundary.
  assert.equal(await sheet.isVisible(),false)
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: actual mobile Water Health preview and selected save, A-B-A, no duplicates')
  console.log('PASS: meals excluded, old Water/Home untouched, foreground preview cleared')
}finally{await browser?.close();server.kill()}
