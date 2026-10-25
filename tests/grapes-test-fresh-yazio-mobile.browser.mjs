import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium needed for real YAZIO mobile TEST')
const port=4239,base=`http://127.0.0.1:${port}/Grapes/`
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const json=JSON.stringify({
  meta:[{tool_version:'0.2.0',from:'2026-01-01',to:'2026-10-25'}],
  tables:[{name:'nutrition_log'}],
  nutrition_log:[{date:'2026-10-25',logged_at:'2026-10-25 12:00:00',
    meal:'lunch',entry_id:'a-meal',source_id:'p1',product:'A alma',type:'product',
    amount:100,energy_kcal:98,protein_g:1,carbs_g:21,fat_g:0}],
  daily_summary:[{date:'2026-10-25',energy_kcal:98}],
  products:[{product_id:'p1',name:'A alma',base_unit:'g'}],
  recipes:[],recipe_ingredients:[],recipe_instructions:[],warnings:[],
})
const csv='Date,Time,Meal,Product,Amount,Unit,Calories total,Protein total,Fat total,Carbs total\n'+
  '2026-10-25,12:00,lunch,B sajt,100,g,240,20,17,1\n'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],
  {cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'design/android-mobile-preview.html')).ok)break}catch{}
    if(server.exitCode!==null||i===119)throw Error('YAZIO mobile preview unavailable')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,
    args:['--no-sandbox']})
  const ctx=await browser.newContext({viewport:{width:410,height:900}})
  await ctx.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const subject=localStorage.getItem('__yazio_qa_owner')||
        '00000000-0000-4000-8000-000000000001'
      const auth=localStorage.getItem('__yazio_qa_logout')!=='1'
      const payload=method==='getTestAuthEnabled'?String(auth)
        :method==='getTestAuthSubject'&&auth?subject:''
      if(method==='yazio')localStorage.setItem('__forbidden_native_yazio','1')
      queueMicrotask(()=>window.dispatchEvent(
        new CustomEvent('grapes:android-result',{
          detail:{requestId,ok:true,payload},
        })))
    }}
  })
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('dialog',d=>d.accept())
  await page.goto(base+'design/android-mobile-preview.html')
  await page.evaluate(()=>{
    localStorage.setItem('grapes-food-legacy-unowned','KEEP-LEGACY-FOOD')
    localStorage.setItem('grapes-water-v1','KEEP-LEGACY-WATER')
  })
  async function openYazio(){
    await page.locator('[data-nav="more"]').last().click()
    await page.locator('[data-page="more"] [data-nav="sync"]').click()
    await page.locator('[data-yazio-import]').click()
    await page.locator('[data-sync-import-sheet].is-open').waitFor()
    assert.match(await page.locator('[data-sync-import-copy]').textContent(),/JSON/)
  }
  async function upload(content,name){
    await openYazio()
    const [chooser]=await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-sync-import-confirm]').click(),
    ])
    await chooser.setFiles({
      name,mimeType:name.endsWith('.csv')?'text/csv':'application/json',
      buffer:Buffer.from(content,'utf8'),
    })
    await page.locator('[data-fresh-yazio-sheet].is-open').waitFor({timeout:20000})
    for(let attempt=0;attempt<110;attempt++){
      const state=await page.evaluate(()=>({
        summary:document.querySelector('[data-fresh-yazio-summary]')?.textContent||'',
        status:document.querySelector('[data-fresh-yazio-status]')?.textContent||'',
      }))
      if(state.summary.includes('új ·'))return state
      if(state.status && !state.status.includes('kizárólag a kijelölt') &&
          !state.status.includes('csak jóváhagyás'))
        throw Error('YAZIO preview failed: '+JSON.stringify(state))
      await page.waitForTimeout(130)
    }
    throw Error('YAZIO preview not ready')
  }
  const first=await upload(json,'yazio-export.json')
  assert.match(first.summary,/1 új/)
  assert.equal(await page.locator('[data-fresh-yazio-record]').count(),1)
  assert.equal(await page.locator('[data-fresh-yazio-record]').first().isChecked(),true)
  await page.locator('[data-fresh-yazio-confirm]').click()
  await page.waitForFunction(()=>{
    const t=document.querySelector('[data-yazio-status]')?.textContent||''
    return t.includes('1 YAZIO-étkezés importálva')
  },{timeout:20000})
  const readOwn=async()=>page.evaluate(async()=>{
    const {openGrapesTestFreshFood}=await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const session=await openGrapesTestFreshFood({enabled:true})
    const data=await session.load()
    return {owner:data.profile.id,foods:data.diaryEntries.map(x=>x.snapshot.name),
      imported:data.importBatches.length,origin:data.diaryEntries[0]?.origin?.profileId,
      legacy:localStorage.getItem('grapes-food-legacy-unowned'),
      water:localStorage.getItem('grapes-water-v1'),
      nativeYazio:localStorage.getItem('__forbidden_native_yazio')}
  })
  assert.deepEqual(await readOwn(),{owner:A,foods:['A alma'],imported:1,origin:A,
    legacy:'KEEP-LEGACY-FOOD',water:'KEEP-LEGACY-WATER',nativeYazio:null})
  await page.evaluate(B=>localStorage.setItem('__yazio_qa_owner',B),B)
  await page.reload()
  assert.deepEqual(await readOwn(),{owner:B,foods:[],imported:0,origin:undefined,
    legacy:'KEEP-LEGACY-FOOD',water:'KEEP-LEGACY-WATER',nativeYazio:null})
  const other=await upload(csv,'nutrition_log.csv')
  assert.match(other.summary,/1 új/)
  await page.locator('[data-fresh-yazio-confirm]').click()
  await page.waitForFunction(()=>{
    return (document.querySelector('[data-yazio-status]')?.textContent||'')
      .includes('1 YAZIO-étkezés importálva')
  },{timeout:20000})
  assert.equal((await readOwn()).foods[0],'B sajt')
  await page.evaluate(A=>localStorage.setItem('__yazio_qa_owner',A),A)
  await page.reload()
  assert.equal((await readOwn()).foods[0],'A alma')
  const repeated=await upload(json,'yazio-export.json')
  assert.match(repeated.summary,/0 új/)
  assert.match(repeated.summary,/1 duplikált/)
  assert.equal(await page.locator('[data-fresh-yazio-confirm]').isHidden(),true)
  await page.locator('[data-nav="more"]').last().click()
  await page.locator('[data-page="more"] [data-nav="sync"]').click()
  await page.locator('[data-yazio-import]').click()
  await page.locator('[data-yazio-undo]').click()
  await page.waitForFunction(()=>(
    document.querySelector('[data-yazio-status]')?.textContent||'').includes('visszavonva'),
  {timeout:20000})
  assert.deepEqual((await readOwn()).foods,[])
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: real YAZIO JSON/CSV picker, preview and save into A-B-A owner Food')
  console.log('PASS: duplicate preview, own batch undo, old Water/Food unchanged, no YAZIO login')
}finally{await browser?.close();server.kill()}
