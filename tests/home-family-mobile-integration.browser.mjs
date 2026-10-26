import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(chrome,'Chromium required for family Home UI integration')
const port=4261
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
const url='http://127.0.0.1:'+port+'/Grapes/tests/fixtures/grapes-test-outbox.html'
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
let browser
try {
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(server.exitCode!==null||i===99)throw Error('Vite family Home unavailable')
    await new Promise(ok=>setTimeout(ok,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:390,height:900}})
  const page=await ctx.newPage(), errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url)
  await page.evaluate(async ({A,H})=>{
    const {createHomeFamilyUI}=await import('/Grapes/src/home/home-family-mobile.js')
    const {createEmptyFamilyHome,stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
    const {createHomeFamilyOutbox}=await import('/Grapes/src/home/home-family-outbox.js')
    const remote=createEmptyFamilyHome(H,A)
    const QA={active:A,offline:false,forceConflict:false,
      attempts:new Map(),remote, role:'owner',writes:0}
    function clientFor(owner) {
      const gateway={
        verify:async()=>{if(QA.active!==owner)throw Error('account switched');return owner},
        list:async()=>[{householdId:H,revision:QA.remote.revision,name:'Közös otthon',
          role:owner===A?'owner':'viewer'}],
        read:async()=>{if(QA.offline)throw Error('offline')
          return {householdId:H,revision:QA.remote.revision,
            role:owner===A?'owner':'viewer',state:structuredClone(QA.remote)}},
        stage:({current,command})=>stageFamilyHomeCommand({
          state:current.state,householdId:H,actorId:owner,role:current.role,command}),
        compareAndSwap:async(stage)=>{
          if(QA.offline)throw Error('offline')
          const conflict=QA.forceConflict || stage.expectedRevision!==QA.remote.revision
          const status=conflict?'conflict':'committed'
          if(!conflict){ QA.remote=structuredClone(stage.candidate);QA.writes++ }
          QA.attempts.set(stage.operationId,{householdId:H,status,revision:QA.remote.revision,
            expectedRevision:stage.expectedRevision,candidate:structuredClone(stage.candidate)})
          return {committed:!conflict,revision:QA.remote.revision}
        },
        readAttempt:async(op)=>QA.attempts.get(op)||null,
        create:async()=>{throw Error('unneeded')},
        acceptInvite:async()=>{throw Error('unneeded')},
      }
      return {ownerId:owner, gateway,
        assertActiveOwner:async()=>{if(QA.active!==owner)throw Error('account switched');return owner}}
    }
    const root=document.createElement('section')
    root.setAttribute('data-household-family','')
    document.body.append(root)
    const ui=createHomeFamilyUI(root,{
      openNative:async()=>clientFor(QA.active),makeOutbox:createHomeFamilyOutbox})
    window.familyQA={QA,ui,root}
    await ui.load(A)
  },{A,H})
  const panel=page.locator('[data-household-family]')
  await panel.locator('[data-family-select]').selectOption(H)
  await panel.locator('[data-family-shopping] [name=name]').fill('Tej')
  await panel.locator('[data-family-shopping] [name=quantity]').fill('2')
  await panel.locator('[data-family-shopping] [name=unit]').selectOption('l')
  await panel.locator('[data-family-shopping] button[type=submit]').click()
  await panel.getByText('Tej',{exact:true}).first().waitFor()
  assert.equal(await page.evaluate(()=>window.familyQA.QA.remote.shopping.length),1)
  await panel.locator('[data-family-check]').click()
  await page.waitForFunction(()=>window.familyQA.QA.remote.inventory.length===1)
  const first=await page.evaluate(()=>({
    amount:window.familyQA.QA.remote.inventory[0].quantityBase,
    status:window.familyQA.QA.remote.shopping[0].status,
    updated:window.familyQA.QA.writes}))
  assert.deepEqual(first,{amount:2000,status:'checked',updated:2})
  assert.equal(await panel.locator('[data-family-stock]').count(),1)

  // Offline order: queued locally, no automatic speculative second operation.
  await page.evaluate(()=>{window.familyQA.QA.offline=true})
  await panel.locator('[data-family-shopping] [name=name]').fill('Só')
  await panel.locator('[data-family-shopping] [name=quantity]').fill('1')
  await panel.locator('[data-family-shopping] [name=unit]').selectOption('kg')
  await panel.locator('[data-family-shopping] button[type=submit]').click()
  await panel.locator('[data-family-retry]').waitFor()
  assert.equal(await panel.locator('[data-family-shopping]').count(),0)
  assert.equal(await page.evaluate(()=>window.familyQA.QA.remote.shopping.length),1)
  await page.evaluate(()=>{window.familyQA.QA.offline=false})
  await panel.locator('[data-family-retry]').click()
  await panel.getByText('Só',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.familyQA.QA.remote.shopping.length),2)

  // An independent remote mutation must retain conflict, never last-write-wins.
  await page.evaluate(()=>{window.familyQA.QA.forceConflict=true})
  await panel.locator('[data-family-stock] [name=name]').fill('Rizs')
  await panel.locator('[data-family-stock] [name=quantity]').fill('1')
  await panel.locator('[data-family-stock] [name=unit]').selectOption('kg')
  await panel.locator('[data-family-stock] button[type=submit]').click()
  await panel.getByText(/Ütközés másik családtag/).waitFor()
  assert.equal(await page.evaluate(()=>window.familyQA.QA.remote.inventory.length),1)
  assert.equal(await panel.locator('[data-family-shopping]').count(),0)

  // Switch A -> B on the same device: no private or pending A queue should leak.
  await page.evaluate(async B=>{
    const {QA,ui}=window.familyQA
    ui.clear()
    QA.active=B
    await ui.load(B)
  },B)
  await panel.locator('[data-family-select]').selectOption(H)
  await panel.getByText('Csak megtekintési jogosultság.').waitFor()
  assert.equal(await panel.locator('[data-family-shopping]').count(),0)
  assert.equal(await panel.locator('[data-family-retry]').count(),0)
  assert.equal(await panel.getByText('Rizs',{exact:true}).count(),0)
  assert.equal(await page.evaluate(()=>window.familyQA.QA.remote.shopping.length),2)
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,
      'horizontal overflow at '+width)
  }
  assert.deepEqual(errors,[])
  console.log('PASS: real Chromium family TEST panel; verified shared CAS purchase, offline replay, conflict retention, viewer B isolation, responsive')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
