import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium required')
const port=4237,base=`http://127.0.0.1:${port}/Grapes/`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],
{cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'design/android-mobile-preview.html')).ok)break}catch{}
    if(server.exitCode!==null||i===119)throw Error('Health mobile fixture unavailable')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:410,height:900}})
  await context.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    const records=[
      {type:'nutrition',externalId:'healthconnect:qa:meal-123',
        sourcePackage:'com.samsung.android.app.healthdata',startTime:'2026-10-25T08:00:00Z',
        endTime:'2026-10-25T08:05:00Z',name:'A Health reggeli',mealType:'breakfast',
        energyKcal:400,proteinGrams:20,carbohydrateGrams:50,fatGrams:10},
      {type:'hydration',externalId:'healthconnect:qa:water-123',
        sourcePackage:'com.samsung.android.app.healthdata',startTime:'2026-10-25T08:30:00Z',
        endTime:'2026-10-25T08:30:00Z',volumeMilliliters:250},
    ]
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const subject=localStorage.getItem('__health_subject')||
        '00000000-0000-4000-8000-000000000001'
      const auth=localStorage.getItem('__health_logout')!=='1'
      const payload=method==='getTestAuthEnabled'?String(auth)
        :method==='getTestAuthSubject'&&auth?subject
        :method==='readHealthData'?JSON.stringify({schemaVersion:1,
          producer:'hu.grapes.healthconnect',generatedAt:'2026-10-25T09:00:00Z',
          records}):''
      if(method==='readHealthData')localStorage.setItem('__health_reads',
        String(Number(localStorage.getItem('__health_reads')||0)+1))
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{
        detail:{requestId,ok:true,payload}})))
    }}
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'design/android-mobile-preview.html')
  async function openSync(){
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    await page.locator('[data-health-sync]').click()
    await page.locator('[data-sync-import-sheet].is-open').waitFor()
    assert.match(await page.locator('[data-sync-import-copy]').textContent(),
      /külön jóváhagyás/)
    await page.locator('[data-sync-import-confirm]').click()
    await page.locator('[data-food-health-sheet].is-open').waitFor({timeout:20000})
  }
  await page.evaluate(()=>{
    localStorage.setItem('grapes-water-v1','LEGACY-WATER-UNTOUCHED')
    localStorage.setItem('grapes-home-household-v1','LEGACY-HOME-UNTOUCHED')
  })
  await openSync()
  const summary=await page.locator('[data-food-health-summary]').textContent()
  assert.match(summary,/1 új/)
  assert.match(summary,/1 vízadat zárolva/)
  const rows=page.locator('[data-food-health-records] [data-food-health-record]')
  assert.equal(await rows.count(),2)
  assert.equal(await rows.nth(0).isDisabled(),false)
  assert.equal(await rows.nth(1).isDisabled(),true)
  await page.locator('[data-food-health-confirm]').click()
  await page.waitForFunction(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const data=await (await openGrapesTestFreshFood({enabled:true})).load()
    return data.diaryEntries.length===1
  },{timeout:20000})
  const a=await page.evaluate(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const d=await (await openGrapesTestFreshFood({enabled:true})).load()
    return {owner:d.profile.id,entries:d.diaryEntries.length,
      food:d.diaryEntries[0]?.snapshot.name,
      amount:d.diaryEntries[0]?.snapshot.nutrients.energyKcal,
      water:localStorage.getItem('grapes-water-v1'),
      home:localStorage.getItem('grapes-home-household-v1')}
  })
  assert.deepEqual(a,{owner:A,entries:1,food:'A Health reggeli',
    amount:400,water:'LEGACY-WATER-UNTOUCHED',home:'LEGACY-HOME-UNTOUCHED'})
  await page.evaluate(B=>localStorage.setItem('__health_subject',B),B)
  await page.reload()
  const b=await page.evaluate(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const d=await (await openGrapesTestFreshFood({enabled:true})).load()
    return {owner:d.profile.id,entries:d.diaryEntries.length}
  })
  assert.deepEqual(b,{owner:B,entries:0})
  await page.evaluate(A=>localStorage.setItem('__health_subject',A),A)
  await page.reload()
  await openSync()
  assert.match(await page.locator('[data-food-health-summary]').textContent(),/0 új/)
  assert.match(await page.locator('[data-food-health-summary]').textContent(),/1 már importálva/)
  assert.equal(await page.locator('[data-food-health-confirm]').isDisabled(),true)
  assert.deepEqual(errors,[])
  await context.close()
  console.log('PASS: real Health Connect Android flow A import, B empty, A duplicate preview')
  console.log('PASS: native opt-in, 1 nutrition persisted, hydration blocked, legacy untouched')
}finally{await browser?.close();server.kill()}
