import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,'/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean).find(existsSync)
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4201','--strictPort'],{stdio:'ignore'})
const url='http://127.0.0.1:4201/Grapes/design/android-mobile-preview.html'
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
let browser
try{
  for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(raw){
      const {method,requestId,args}=JSON.parse(raw)
      const owner=localStorage.getItem('__samsung_owner')||'00000000-0000-4000-8000-000000000001'
      const available=localStorage.getItem('__samsung_missing')!=='1',permitted=localStorage.getItem('__samsung_permission')==='1'
      const result=(payload,ok=true,error='')=>queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{detail:{requestId,ok,payload,error}})))
      if(method==='getSamsungWaterStatus')return result(JSON.stringify({ownerId:owner,available,permitted,reason:available?'':'A Samsung Health Data SDK AAR nincs telepítve.'}))
      if(method==='readSamsungHealthData'||method==='readSamsungHealthDataSilent'){
        if(args[1]!==owner)return result('',false,'Owner changed')
        if(!available)return result('',false,'SDK missing')
        if(method==='readSamsungHealthDataSilent'&&!permitted)return result('',false,'No silent permission')
        localStorage.setItem('__samsung_permission','1')
        if(method==='readSamsungHealthDataSilent')localStorage.setItem('__silent',String(1+Number(localStorage.getItem('__silent')||0)))
        const records=Array.from({length:Number(localStorage.getItem('__samsung_count')||1)},(_,i)=>({type:'hydration',externalId:'samsunghealth:com.sec.android.app.shealth:water-'+i,sourcePackage:'com.sec.android.app.shealth',startTime:new Date().toISOString(),endTime:new Date().toISOString(),volumeMilliliters:250+i*100}))
        if(localStorage.getItem('__switch_during_read')==='1')localStorage.setItem('__samsung_owner','00000000-0000-4000-8000-000000000002')
        return result(JSON.stringify({schemaVersion:1,producer:'hu.grapes.healthconnect',generatedAt:new Date().toISOString(),ownerId:owner,records}))
      }
      return result('null')
    }}
  })
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  async function water(){await page.locator('.appbar [data-nav=home]').click();await page.locator('[data-main-shortcut=water]').click();await page.locator('[data-page=water]').waitFor({state:'visible'})}
  async function samsung(){await water();await page.locator('[data-page=water] [data-samsung-sync-action]').click();await page.locator('[data-page=samsung-water]').waitFor({state:'visible'})}
  const read=page.locator('[data-samsung-water-read]'),toggle=page.locator('[data-samsung-water-auto]')
  await samsung();assert.equal(await toggle.isDisabled(),true)
  await read.click();await page.waitForFunction(()=>document.querySelector('[data-samsung-water-status]').textContent.includes('1 új vízbejegyzés mentve'),null,{timeout:10000})
  await read.click();await page.waitForFunction(()=>document.querySelector('[data-samsung-water-status]').textContent.includes('0 új vízbejegyzés mentve; 1 ismétlődés'),null,{timeout:10000})
  await page.evaluate(()=>localStorage.setItem('__samsung_count','2'))
  page.once('dialog',d=>d.accept());await toggle.check()
  await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('grapes-water-v1')||'{}')).flatMap(d=>d.entries).length===2,null,{timeout:10000})
  assert.equal(await page.evaluate(()=>Number(localStorage.getItem('__silent'))),1)
  await water();assert.match(await page.locator('[data-water-total]').innerText(),/600/)
  await page.evaluate(B=>localStorage.setItem('__samsung_owner',B),B);await page.reload();await samsung()
  assert.equal(await toggle.isChecked(),false)
  await water();assert.equal(await page.locator('[data-water-total]').innerText(),'0 ml')
  await samsung();await read.click();await page.waitForFunction(()=>document.querySelector('[data-samsung-water-status]').textContent.includes('2 új vízbejegyzés mentve'),null,{timeout:10000})
  await page.evaluate(A=>localStorage.setItem('__samsung_owner',A),A);await page.reload();await samsung()
  assert.equal(await toggle.isChecked(),true)
  await water();assert.match(await page.locator('[data-water-total]').innerText(),/600/)
  const rows=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('grapes-water-v1'))).flatMap(d=>d.entries))
  assert.equal(rows.filter(r=>r.samsungOwnerId===A).length,2);assert.equal(rows.filter(r=>r.samsungOwnerId===B).length,2)
  // No SDK: direct must disable, own CSV remains a working alternative.
  await page.evaluate(()=>localStorage.setItem('__samsung_missing','1'));await page.reload();await samsung()
  assert.equal(await read.isDisabled(),true)
  assert.equal(await page.locator('[data-samsung-water-csv]').isDisabled(),false)
  page.once('dialog',d=>d.accept())
  await page.locator('[data-samsung-water-file]').setInputFiles({name:'com.samsung.health.water_intake.csv',mimeType:'text/csv',buffer:Buffer.from('datauuid,start_time,amount\ncsv-test,2026-10-25 12:00:00,300')})
  await page.waitForFunction(()=>document.querySelector('[data-samsung-water-status]').textContent.includes('1 új vízbejegyzés mentve'),null,{timeout:10000})
  mkdirSync('artifacts/samsung-208',{recursive:true})
  for(const width of [320,360,390,412]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Samsung overflow '+width);await page.screenshot({path:`artifacts/samsung-208/sdk-missing-${width}.png`})}
  // Permission revoked: preference can still be switched OFF; no silent read occurs.
  await page.evaluate(()=>{localStorage.removeItem('__samsung_missing');localStorage.removeItem('__samsung_permission')});await page.reload();await samsung()
  const silentBefore=await page.evaluate(()=>localStorage.getItem('__silent'))
  await toggle.uncheck();assert.equal(await toggle.isChecked(),false)
  assert.equal(await page.evaluate(()=>localStorage.getItem('__silent')),silentBefore)
  assert.deepEqual(errors,[])
  console.log('PASS: real Water UI + mocked native SDK; manual/dedup, opt-in silent refresh, A-B-A isolation, absent SDK CSV fallback, revoked permission, 320–412px')
}finally{await browser?.close();server.kill()}
