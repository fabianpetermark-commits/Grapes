import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium required for TEST One Home outbox status')
const port=4291
const url='http://127.0.0.1:'+port+'/Grapes/tests/fixtures/grapes-test-outbox.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
let browser
try {
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Vite died')
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99)throw Error('Vite did not start')
    await new Promise(done=>setTimeout(done,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const page=await browser.newPage({viewport:{width:360,height:800}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  await page.evaluate(async ({A,H})=>{
    const {createHomeMobile}=await import('/Grapes/src/home/home-mobile.js')
    const {createEmptyFamilyHome,stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
    // Upgrade over v42: legacy Home key can contain incompatible v2 data.
    // The new TEST family view must not read, migrate, or touch this record.
    localStorage.setItem('grapes-home-household-v1',
      '{"schemaVersion":2,"priorQaRevision":8,"legacy":"KEEP_BYTES"}')
    const el=document.createElement('main')
    el.setAttribute('data-household-root','')
    el.id='qa-one-home'
    document.body.append(el)
    window.__qaHomeOffline=true
    window.__qaHomeActor=A
    window.__qaHomeWrites=0
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.__qaHomeOffline})
    let remote=createEmptyFamilyHome(H,A)
    let cached={ownerId:A,householdId:H,role:'owner',revision:0,state:structuredClone(remote)}
    let jobs=[]
    const sync={
      ownerId:A,
      pending:async()=>structuredClone(jobs),
      cached:async()=>structuredClone(cached),
      refresh:async()=>{
        cached={ownerId:A,householdId:H,role:'owner',revision:remote.revision,state:structuredClone(remote)}
        return structuredClone(cached)
      },
      queue:async(id,command)=>{
        const staged=stageFamilyHomeCommand({householdId:id,actorId:A,role:'owner',
          state:cached.state,command})
        const job={ownerId:A,householdId:H,operationId:staged.operationId,
          expectedRevision:staged.expectedRevision,candidate:staged.candidate,status:'pending'}
        if(jobs.some(x=>x.status!=='committed'))throw Error('Pending operation exists')
        jobs.push(job)
        return structuredClone(job)
      },
      retry:async()=>{
        window.__qaHomeWrites++
        const job=jobs.find(x=>x.status==='pending')
        if(!job)return null
        job.status='committed'
        remote=structuredClone(job.candidate)
        return {status:'committed',serverRevision:remote.revision}
      },
    }
    window.__qaInstance=createHomeMobile(el,localStorage,{
      familySync:{enabled:true,writesEnabled:true,householdId:H,
        expectedUserId:A,getActiveOwner:async()=>window.__qaHomeActor,sync},
    })
    window.__qaInstance.load()
  },{A,H})
  const home=page.locator('#qa-one-home')
  await home.locator('[data-household-sync][data-status="offline"]').waitFor()
  assert.equal(await home.locator('[data-household-shopping]').isVisible(),true)
  assert.equal(await home.locator('[data-household-inventory]').isVisible(),true)
  assert.equal(await home.locator('[data-household-suggestions]').isVisible(),true)
  await home.locator('[data-household-add="shopping"]').first().click()
  const form=home.locator('[data-household-form]')
  await form.locator('[name="name"]').fill('Közös tej')
  await form.locator('[name="quantity"]').fill('2')
  await form.locator('[name="unit"]').selectOption('l')
  await form.locator('button[type="submit"]').click()
  await home.locator('[data-household-sync][data-status="pending"]').waitFor()
  assert.match(await home.locator('[data-household-sync-text]').textContent(),/1 módosítás/)
  assert.equal(await home.locator('[data-household-shopping-count]').textContent(),'1')
  assert.equal(await home.locator('[data-household-inventory-count]').textContent(),'0')
  assert.equal(await page.evaluate(()=>window.__qaHomeWrites),0)
  assert.equal(await home.locator('[data-household-add="shopping"]').first().isDisabled(),true)
  const before=await page.evaluate(()=>localStorage.getItem('grapes-home-household-v1'))
  assert.equal(before,'{"schemaVersion":2,"priorQaRevision":8,"legacy":"KEEP_BYTES"}',
    'Legacy v42 TEST data must be preserved byte-for-byte')
  await page.evaluate(()=>{window.__qaHomeOffline=false;window.dispatchEvent(new Event('online'))})
  await home.locator('[data-household-sync][data-status="synced"]').waitFor()
  assert.equal(await page.evaluate(()=>window.__qaHomeWrites),1)
  assert.equal(await home.locator('[data-household-inventory-count]').textContent(),'0')
  await home.locator('[data-household-check]').first().click()
  await page.waitForFunction(()=>window.__qaHomeWrites===2)
  await home.locator('[data-household-sync][data-status="synced"]').waitFor()
  assert.equal(await page.evaluate(()=>window.__qaHomeWrites),2)
  assert.equal(await home.locator('[data-household-inventory-count]').textContent(),'0',
    'Megvettem must never add stock')
  await page.evaluate(()=>{window.__qaHomeActor='00000000-0000-4000-8000-000000000002';
    window.dispatchEvent(new Event('online'))})
  await home.locator('[data-household-sync][data-status="unverified"]').waitFor()
  assert.equal(await home.locator('[data-household-shopping-count]').textContent(),'0',
    'A previous family data must disappear after owner switch')
  assert.equal(await home.locator('[data-household-add="shopping"]').first().isDisabled(),true)
  assert.equal(await page.evaluate(()=>localStorage.getItem('grapes-home-household-v1')),before,
    'Neither queue/retry nor A→B switch can touch the previous QA v42 storage')
  assert.deepEqual(errors,[])
  console.log('PASS: One Home TEST offline queue/amber status, verified reconnect/green, no silent stock, owner switch denied; untouched local v1')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
