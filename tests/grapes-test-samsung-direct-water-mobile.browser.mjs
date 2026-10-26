import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(v=>v&&existsSync(v))
assert.ok(chrome,'Chrome required')
const port=4242,url=`http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<130;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(server.exitCode!==null||i===129)throw Error('Samsung direct UI missing')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:410,height:900}})
  await ctx.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const owner=localStorage.getItem('__sdk_subject')||'00000000-0000-4000-8000-000000000001'
      const granted=localStorage.getItem('__sdk_granted')==='1'
      const amount=Number(localStorage.getItem('__sdk_count')||1)
      const records=Array.from({length:amount},(_,i)=>({
        type:'hydration',externalId:`samsunghealth:com.sec.android.app.shealth:drink-${i}`,
        sourcePackage:'com.sec.android.app.shealth',
        startTime:`2026-10-25T09:${String(15+i).padStart(2,'0')}:00.000Z`,
        endTime:`2026-10-25T09:${String(15+i).padStart(2,'0')}:00.000Z`,
        volumeMilliliters:250+i*100,
      }))
      let payload=''
      if(method==='getTestAuthEnabled')payload='true'
      else if(method==='getTestAuthSubject')payload=owner
      else if(method==='getSamsungWaterStatus')payload=JSON.stringify({
        available:true,permitted:granted,reason:''
      })
      else if(method==='readSamsungHealthData'){
        localStorage.setItem('__sdk_granted','1')
        payload=JSON.stringify({schemaVersion:1,
          producer:'hu.grapes.healthconnect',generatedAt:new Date().toISOString(),records})
      }
      else if(method==='readSamsungHealthDataSilent'){
        localStorage.setItem('__sdk_silent_reads',String(
          1+Number(localStorage.getItem('__sdk_silent_reads')||0)))
        if(!granted)throw Error('Silent read must not prompt')
        payload=JSON.stringify({schemaVersion:1,
          producer:'hu.grapes.healthconnect',generatedAt:new Date().toISOString(),records})
      }
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{
        detail:{requestId,ok:true,payload}})))
    }}
  })
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  async function openSync(){
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    await page.waitForFunction(()=>document.querySelector('[data-samsung-sync-action]')
      ?.textContent==='Közvetlen',{timeout:20000})
  }
  const readStored=()=>page.evaluate(()=>{
    const raw=localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001')
    return raw?JSON.parse(raw)['2026-10-25']?.entries?.map(e=>e.amount):null
  })
  await openSync()
  assert.equal(await page.locator('[data-samsung-auto-water]').isDisabled(),true)
  await page.locator('[data-samsung-sync-action]').click()
  await page.locator('[data-water-health-sheet].is-open').waitFor()
  assert.match(await page.locator('[data-water-health-sheet] h2').textContent(),/Közvetlen/)
  await page.locator('[data-water-health-read]').click()
  await page.waitForFunction(()=>document.querySelector('[data-water-health-summary]')
    ?.textContent?.includes('1 új vízbejegyzés'),{timeout:20000})
  await page.locator('[data-water-health-confirm]').click()
  await page.waitForFunction(()=>Boolean(localStorage.getItem(
    'grapes-water-v2:00000000-0000-4000-8000-000000000001')),{timeout:20000})
  assert.deepEqual(await readStored(),[250])
  await page.waitForFunction(()=>!document.querySelector('[data-samsung-auto-water]').disabled)
  await page.evaluate(()=>localStorage.setItem('__sdk_count','2'))
  page.once('dialog',dialog=>dialog.accept())
  await page.locator('[data-samsung-auto-water]').check()
  await page.waitForFunction(()=>{
    const days=JSON.parse(localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001')||'{}')
    return days['2026-10-25']?.entries?.length===2
  },{timeout:20000})
  assert.deepEqual(await readStored(),[250,350])
  const reads=await page.evaluate(()=>Number(localStorage.getItem('__sdk_silent_reads')||0))
  assert.ok(reads>=1,'silent read did not happen')
  await page.evaluate(B=>localStorage.setItem('__sdk_subject',B),B)
  await page.reload()
  await openSync()
  assert.equal(await page.locator('[data-samsung-auto-water]').isChecked(),false)
  const b=await page.evaluate(B=>localStorage.getItem('grapes-water-v2:'+B),B)
  assert.equal(b,null,'B must remain unclaimed')
  await page.evaluate(A=>localStorage.setItem('__sdk_subject',A),A)
  await page.reload()
  await openSync()
  assert.equal(await page.locator('[data-samsung-auto-water]').isChecked(),true)
  assert.deepEqual(await readStored(),[250,350])
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: Samsung direct manual grant, user opt-in auto silent Water CAS, A-B-A isolation')
}finally{await browser?.close();server.kill()}
