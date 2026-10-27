import assert from 'node:assert/strict'
import {existsSync,mkdirSync,writeFileSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright-core'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium required')
const port=4297,origin=`http://127.0.0.1:${port}`
const url=origin+'/Grapes/tests/fixtures/home-family-fullchain.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
const output=resolve(root,'qa-results/home-family-fullchain')
mkdirSync(output,{recursive:true})
let browser
const results=[]
const status=(p,s)=>p.locator(`[data-household-sync][data-status="${s}"]`).waitFor({timeout:8000})
const calls=(p,name)=>p.evaluate(name=>qa.data.calls.filter(x=>x.method===name),name)
const cas=p=>calls(p,'home_m3b_compare_and_swap')
async function settled(p,s){await status(p,s);await p.waitForTimeout(100)}
async function mount(p,patch={}){await p.evaluate(patch=>{qa.set(patch);qa.mount()},patch)}
async function add(p,name='Offline kenyér',double=false){
  await p.locator('[data-household-add="shopping"]').first().click()
  await p.locator('[data-household-form] [name="name"]').fill(name)
  await p.locator('[data-household-form] button[type="submit"]').evaluate((button,double)=>{
    button.click();if(double)button.click()
  },double)
  await settled(p,'pending')
}
async function run(id,test,width=360){
  const context=await browser.newContext({viewport:{width,height:820},serviceWorkers:'block'})
  const p=await context.newPage(),errors=[],external=[]
  let before
  p.setDefaultTimeout(8000)
  p.on('pageerror',e=>errors.push(e.message))
  // No network request can reach TEST or PROD, even if the fixture regresses.
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin)return route.continue()
    external.push(route.request().url());return route.abort('blockedbyclient')
  })
  try{
    await p.goto(url);await p.waitForFunction(()=>window.qaReady)
    before=await p.evaluate(()=>qa.storage())
    await test(p)
    assert.deepEqual(await p.evaluate(()=>qa.storage()),before,'v1/current/previous and private module bytes must survive')
    assert.deepEqual(errors,[],'Unexpected browser error')
    assert.deepEqual(external,[],'No external HTTP')
    results.push({id,status:'PASS'});console.log('PASS:',id)
  }catch(error){
    const observed=await p.evaluate(async()=>({actor:qa.data.actor,status:document.querySelector('[data-household-sync]')?.dataset.status,shoppingText:document.querySelector('[data-household-items]')?.textContent,jobs:await qa.disk()})).catch(()=>null)
    const preserved=JSON.stringify(await p.evaluate(()=>qa.storage()).catch(()=>null))===JSON.stringify(before)
    results.push({id,status:'FAIL',error:error.stack,observed,storagePreserved:preserved,errors,external});console.error('FAIL:',id,error.message)
    await p.screenshot({path:resolve(output,id+'.png'),fullPage:true}).catch(()=>{})
    writeFileSync(resolve(output,id+'.html'),await p.content())
  }finally{await context.close()}
}
try{
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99||server.exitCode!==null)throw Error('Vite unavailable')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  await run('verified-three-widgets',async p=>{
    await p.evaluate(()=>{qa.block('read');qa.mount()})
    await status(p,'checking')
    assert.equal(await p.getByText('Közös tej',{exact:true}).count(),0)
    await p.waitForFunction(()=>qa.waiting('read'));await p.evaluate(()=>qa.release('read'))
    await settled(p,'synced')
    for(const section of ['shopping','inventory','suggestions'])assert.ok(await p.locator(`[data-household-${section}]`).isVisible())
    for(const text of ['Közös tej','Közös liszt','Igazolt üres rizs'])assert.ok(await p.getByText(text,{exact:true}).first().isVisible())
    assert.equal(await p.getByText('Személyes cukor').count(),0)
    assert.equal(await p.locator('[data-household-suggestion-count]').textContent(),'1')
    assert.ok(await p.getByText('Mennyiség ismeretlen',{exact:false}).isVisible())
    assert.equal((await cas(p)).length,0)
  })
  await run('offline-reload-exactly-one-cas-and-proof',async p=>{
    await mount(p);await settled(p,'synced')
    await p.evaluate(()=>qa.set({offline:true}));await add(p,undefined,true)
    const job=(await p.evaluate(()=>qa.disk()))[0]
    assert.equal(job.status,'pending');assert.ok(job.operationId);assert.ok(job.candidate.shopping.some(x=>x.name==='Offline kenyér'))
    assert.match(await p.locator('[data-household-sync-text]').textContent(),/1 módosítás/)
    assert.equal((await cas(p)).length,0)
    await p.reload();await p.waitForFunction(()=>window.qaReady);await mount(p)
    await settled(p,'pending')
    assert.deepEqual((await p.evaluate(()=>qa.jobs()))[0],job,'Exact durable proposal after reload')
    await p.evaluate(()=>{qa.block('proof');qa.online();qa.online();qa.foreground()})
    await p.waitForFunction(()=>qa.waiting('proof'))
    await status(p,'pending');assert.equal((await p.evaluate(()=>qa.jobs()))[0].status,'pending')
    assert.equal((await cas(p)).length,1)
    assert.deepEqual((await cas(p))[0].persistedJobs,[job],'IndexedDB commit precedes CAS transport')
    assert.deepEqual((await cas(p))[0].args.p_candidate,job.candidate)
    assert.equal((await cas(p))[0].args.p_operation_id,job.operationId)
    await p.evaluate(()=>qa.release('proof'));await settled(p,'synced')
    assert.equal((await p.evaluate(()=>qa.jobs()))[0].status,'committed')
    await p.evaluate(()=>{qa.online();qa.foreground();qa.online()});await p.waitForTimeout(200)
    assert.equal((await cas(p)).length,1)
  })
  for(const event of ['online','foreground','manual'])await run('resume-'+event,async p=>{
    await mount(p);await settled(p,'synced');await p.evaluate(()=>qa.set({offline:true}));await add(p)
    if(event==='manual'){
      await p.evaluate(()=>qa.set({offline:false}));await p.locator('[data-household-sync-retry]').click()
    }else await p.evaluate(event=>{qa.set({offline:false});qa[event]()},event)
    await settled(p,'synced');assert.equal((await cas(p)).length,1)
  })
  for(const mode of ['lost-response','missing-proof','incomplete-proof','forged-proof'])await run(mode,async p=>{
    await mount(p);await settled(p,'synced');await p.evaluate(()=>qa.set({offline:true}));await add(p)
    const original=(await p.evaluate(()=>qa.jobs()))[0]
    await p.evaluate(mode=>{qa.set({mode});qa.online()},mode)
    await p.waitForFunction(()=>qa.data.calls.some(x=>x.method==='home_m3b_compare_and_swap'))
    await p.waitForFunction(()=>document.querySelector('[data-household-sync-text]').textContent.includes('újrapróbálás'))
    await status(p,'pending');assert.deepEqual((await p.evaluate(()=>qa.jobs()))[0],original)
    await p.evaluate(()=>qa.set({mode:'normal'}));await p.locator('[data-household-sync-retry]').click();await settled(p,'synced')
    const writes=await cas(p);assert.equal(writes.length,2);assert.deepEqual(writes[0].args,writes[1].args)
    assert.equal(await p.evaluate(()=>Object.keys(qa.data.attempts).length),1,'Idempotent server attempt')
  })
  await run('cas-conflict-preserves-proposal',async p=>{
    await mount(p);await settled(p,'synced');await p.evaluate(()=>qa.set({offline:true}));await add(p)
    const job=(await p.evaluate(()=>qa.jobs()))[0]
    await p.evaluate(()=>{qa.advance();qa.online()});await settled(p,'conflict')
    const conflicted=(await p.evaluate(()=>qa.jobs()))[0]
    assert.equal(conflicted.status,'conflict');assert.deepEqual(conflicted.candidate,job.candidate)
    assert.equal(conflicted.expectedRevision,job.expectedRevision)
    assert.match(await p.locator('[data-household-sync-text]').textContent(),/kézi egyeztetés/)
    for(let i=0;i<3;i++){await p.evaluate(()=>{qa.online();qa.foreground()});await p.waitForTimeout(100)}
    assert.equal((await cas(p)).length,1)
    await p.reload();await p.waitForFunction(()=>window.qaReady);await mount(p);await settled(p,'conflict')
    assert.deepEqual((await p.evaluate(()=>qa.jobs()))[0],conflicted)
  })
  for(const role of ['owner','editor','viewer'])await run('role-'+role,async p=>{
    await mount(p,{role});await settled(p,'synced')
    assert.equal(await p.locator('[data-household-add="shopping"]').first().isDisabled(),role==='viewer')
    assert.equal(await p.locator('[data-household-check]').first().isDisabled(),role==='viewer')
    if(role==='viewer'){
      assert.equal(await p.evaluate(async()=>{try{await qa.sync.queue(qa.H,{type:'ShoppingItemAdded',eventId:crypto.randomUUID(),payload:{name:'Denied'}});return false}catch{return true}}),true)
      assert.equal((await p.evaluate(()=>qa.jobs())).length,0);assert.equal((await cas(p)).length,0)
    }else{
      await p.evaluate(()=>qa.set({offline:true}));await add(p);await p.evaluate(()=>qa.online());await settled(p,'synced');assert.equal((await cas(p)).length,1)
    }
  })
  await run('account-A-B-A-durable-isolation',async p=>{
    await mount(p);await settled(p,'synced');await p.evaluate(()=>qa.set({offline:true}));await add(p)
    const aJob=(await p.evaluate(()=>qa.jobs()))[0]
    await p.evaluate(()=>{qa.set({actor:qa.B});qa.online()});await settled(p,'unverified')
    assert.equal(await p.getByText('Offline kenyér').count(),0)
    assert.equal(await p.getByText('Személyes cukor').count(),0)
    assert.equal(await p.evaluate(async()=>{try{await qa.jobs();return false}catch{return true}}),true)
    await mount(p);await settled(p,'synced') // Fresh authenticated B capability; shared snapshot is legitimate.
    assert.deepEqual(await p.evaluate(()=>qa.jobs()),[])
    assert.equal(await p.getByText('Offline kenyér').count(),0)
    await p.evaluate(()=>qa.set({actor:qa.A,offline:true}));await mount(p);await settled(p,'pending')
    assert.deepEqual((await p.evaluate(()=>qa.jobs()))[0],aJob)
    assert.equal((await cas(p)).length,0)
  })
  for(const phase of ['read','cas','proof'])await run('late-'+phase+'-after-account-switch',async p=>{
    if(phase==='read'){
      await p.evaluate(()=>{qa.block('read');qa.mount()})
    }else{
      await mount(p);await settled(p,'synced');await p.evaluate(()=>qa.set({offline:true}));await add(p)
      await p.evaluate(phase=>{qa.block(phase);qa.online()},phase)
    }
    await p.waitForFunction(phase=>qa.waiting(phase),phase)
    await p.evaluate(phase=>{qa.set({actor:qa.B});qa.release(phase)},phase)
    // Wait for reconciliation to finish; accept the correct fixed state as well as the current error state.
    if(phase==='read')await settled(p,'unverified')
    else await p.waitForFunction(()=>document.querySelector('[data-household-sync]').dataset.status==='unverified'||document.querySelector('[data-household-sync-text]').textContent.includes('újrapróbálás'))
    assert.equal(await p.locator('[data-household-sync]').getAttribute('data-status'),'unverified','Account switch must clear stale pending projection')
    for(const name of ['Közös tej','Offline kenyér','Személyes cukor'])assert.equal(await p.getByText(name,{exact:true}).count(),0)
    assert.equal(await p.locator('[data-household-add="shopping"]').first().isDisabled(),true)
    if(phase!=='read')assert.equal((await p.evaluate(()=>qa.disk()))[0].status,'pending')
  })
  await run('unverified-auth-never-green',async p=>{
    await mount(p,{authFailure:true});await settled(p,'unverified')
    assert.equal(await p.getByText('Közös tej',{exact:true}).count(),0);assert.equal((await cas(p)).length,0)
  })
  await run('purchased-is-not-stock-and-private-sources-denied',async p=>{
    await mount(p);await settled(p,'synced')
    const inventory=await p.evaluate(()=>qa.data.remote.inventory)
    const purchasedId=await p.locator('[data-household-check]').first().getAttribute('data-household-check')
    await p.locator('[data-household-check]').first().click()
    await p.waitForFunction(()=>qa.data.calls.some(x=>x.method==='home_m3b_read_attempt'));await settled(p,'synced')
    assert.deepEqual(await p.evaluate(()=>qa.data.remote.inventory),inventory)
    assert.equal(await p.evaluate(id=>qa.data.remote.shopping.find(x=>x.id===id).status,purchasedId),'checked')
    for(const sourceType of ['food','finance','health'])assert.equal(await p.evaluate(async sourceType=>{
      try{await qa.sync.queue(qa.H,{type:'ShoppingItemAdded',eventId:crypto.randomUUID(),sourceType,sourceId:'private',payload:{name:'Never import'}});return false}catch{return true}
    },sourceType),true)
    assert.equal((await cas(p)).length,1)
    assert.equal(await p.locator('[data-household-suggestion-count]').textContent(),'1','Unknown quantity is not shortage')
  })
  for(const width of [320,360,390,412])await run('mobile-'+width,async p=>{
    await mount(p);await settled(p,'synced')
    const check=async()=>assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,'No horizontal overflow')
    await check();assert.equal(await p.locator('[data-household-tabs]').count(),0)
    assert.equal(await p.getByText('Kimenő üzenetek',{exact:true}).count(),0)
    assert.equal(await p.locator('[data-household-sync]').getAttribute('role'),'status')
    assert.equal(await p.locator('[data-household-sync]').getAttribute('aria-live'),'polite')
    await p.evaluate(()=>{qa.set({offline:true});qa.foreground()});await settled(p,'offline');await check()
    await add(p,'Mobil próba');await check()
    const retry=p.getByRole('button',{name:'Újrapróbálás',exact:true})
    await retry.scrollIntoViewIfNeeded();assert.ok(await retry.isVisible());assert.ok(await retry.isEnabled())
    const box=await retry.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width)
    await retry.focus();assert.ok(await retry.evaluate(el=>el===document.activeElement))
    await p.evaluate(()=>qa.set({offline:false}));await retry.press('Enter');await settled(p,'synced');await check()
    await p.evaluate(()=>qa.set({offline:true}));await add(p,'Ütköző mobil próba');await p.evaluate(()=>{qa.advance();qa.online()})
    await settled(p,'conflict');await check()
    await p.screenshot({path:resolve(output,`mobile-${width}.png`),fullPage:true})
  },width)
}finally{
  writeFileSync(resolve(output,'results.json'),JSON.stringify({results,notRun:['Real HTTP A/B / hosted RLS','Physical phone TEST APK / native bridge']},null,2))
  console.log(JSON.stringify(results.map(({id,status})=>({id,status})),null,2))
  await browser?.close();server.kill('SIGTERM')
}
if(results.some(x=>x.status==='FAIL'))process.exitCode=1
