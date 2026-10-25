import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium required for direct YAZIO')
const port=4240,url=`http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<120;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(server.exitCode!==null||i===119)throw Error('Direct YAZIO mobile fixture unavailable')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,
    args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:410,height:900}})
  await ctx.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId,args=[]}=JSON.parse(message)
      const owner=localStorage.getItem('__direct_qa_owner')||
        '00000000-0000-4000-8000-000000000001'
      const authorized=localStorage.getItem('__direct_qa_logout')!=='1'
      let payload=method==='getTestAuthEnabled'?String(authorized)
        :method==='getTestAuthSubject'&&authorized?owner:''
      if(method==='yazio'){
        const op=args[0]
        const log=JSON.parse(localStorage.getItem('__direct_methods')||'[]')
        log.push(op);localStorage.setItem('__direct_methods',JSON.stringify(log))
        if(op==='login')payload=JSON.stringify({session:'one-shot-test-session'})
        else if(op==='day'){
          payload=JSON.stringify({products:[{
            id:'direct-1',product_id:'product-direct',amount:100,
            date:'2026-10-25 12:00:00',daytime:'lunch'}]})
          if(localStorage.getItem('__direct_switch_on_day')==='1') {
            localStorage.setItem('__direct_qa_owner',
              '00000000-0000-4000-8000-000000000002')
          }
        }else if(op==='product')payload=JSON.stringify({
          name:'Direkt YAZIO alma',base_unit:'g',
          nutrients:{'energy.energy':1.2,'nutrient.protein':0.01},
        })
        else if(op==='logout')payload=JSON.stringify({})
        else payload=JSON.stringify({error:'unsupported'})
      }
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',{
        detail:{requestId,ok:true,payload}})))
    }}
  })
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  async function openDirect(){
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    await page.locator('[data-fresh-yazio-direct-open]').click()
    await page.locator('[data-fresh-yazio-direct-sheet].is-open').waitFor()
  }
  const form=page.locator('[data-fresh-yazio-direct-form]')
  async function submit(){
    await form.locator('[name=email]').fill('qa@example.com')
    await form.locator('[name=password]').fill('temporary-password')
    await form.locator('[name=from]').fill('2026-10-25')
    await form.locator('[name=to]').fill('2026-10-25')
    await form.locator('[type=submit]').click()
  }
  await openDirect()
  await submit()
  await page.locator('[data-fresh-yazio-sheet].is-open').waitFor({timeout:20000})
  await page.waitForFunction(()=>
    (document.querySelector('[data-fresh-yazio-summary]')?.textContent||'')
      .includes('1 új'),{timeout:20000})
  await page.locator('[data-fresh-yazio-confirm]').click()
  await page.waitForFunction(()=>
    (document.querySelector('[data-yazio-status]')?.textContent||'')
      .includes('1 YAZIO-étkezés importálva'),{timeout:20000})
  const snapshot=await page.evaluate(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const data=await (await openGrapesTestFreshFood({enabled:true})).load()
    return {owner:data.profile.id,foods:data.diaryEntries.map(e=>e.snapshot.name),
      batches:data.importBatches.length,
      methods:JSON.parse(localStorage.getItem('__direct_methods')||'[]')}
  })
  assert.deepEqual(snapshot,{owner:A,foods:['Direkt YAZIO alma'],batches:1,
    methods:['login','day','product','logout']})
  // Same native YAZIO source cannot be shown for B's owner-specific journal.
  await page.evaluate(B=>localStorage.setItem('__direct_qa_owner',B),B)
  await page.reload()
  const b=await page.evaluate(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const data=await (await openGrapesTestFreshFood({enabled:true})).load()
    return {owner:data.profile.id,entries:data.diaryEntries.length}
  })
  assert.deepEqual(b,{owner:B,entries:0})
  await page.evaluate(A=>localStorage.setItem('__direct_qa_owner',A),A)
  await page.reload()
  // Switch owner while YAZIO responds; no old owner preview or B import.
  await page.evaluate(()=>localStorage.setItem('__direct_switch_on_day','1'))
  await openDirect()
  await submit()
  await page.waitForFunction(()=>(
    document.querySelector('[data-fresh-yazio-direct-status]')?.textContent||'')
      .includes('megváltozott'),{timeout:20000})
  assert.equal(await page.locator('[data-fresh-yazio-sheet].is-open').count(),0)
  const methods=await page.evaluate(()=>
    JSON.parse(localStorage.getItem('__direct_methods')||'[]'))
  assert.deepEqual(methods.slice(-3),['login','day','logout'])
  assert.ok(!methods.includes('loginSaved')&&!methods.includes('loginRemembered'))
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: direct one-shot YAZIO login/day/product/logout, explicit owner Food preview')
  console.log('PASS: A→B empty, account-switch during request stops; no stored credentials')
}finally{await browser?.close();server.kill()}
