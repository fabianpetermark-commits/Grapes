import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright-core'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(chrome,'Chromium required')
const url='http://127.0.0.1:4277/Grapes/tests/fixtures/grapes-one-home-test-preview.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port','4277','--strictPort'],{cwd:root,stdio:'ignore'})
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='11111111-1111-4111-8111-111111111111'
const OP1='00000000-0000-4000-8000-000000000011'
const OP2='00000000-0000-4000-8000-000000000012'
let browser
try {
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99||server.exitCode!==null)throw Error('Preview server unavailable')
    await new Promise(done=>setTimeout(done,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  for(const width of [320,360,390,412]){
    const context=await browser.newContext({viewport:{width,height:820}})
    const page=await context.newPage(),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(url)
    const data=await page.evaluate(async ({A,H,OP1,OP2})=>{
      const {createHomeStore}=await import('/Grapes/src/home/home-store.js')
      const {createHomeMobile}=await import('/Grapes/src/home/home-mobile.js')
      const {createEmptyFamilyHome,stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
      const {createHomeTestReadOnlyGate,HOME_SUPABASE_TEST_REF}=await import('/Grapes/src/home/home-supabase-test-readonly.js')
      const local=createHomeStore(localStorage)
      local.dispatch({type:'ShoppingItemAdded',payload:{name:'Személyes cukor',quantity:1,unit:'db'}})
      const before=localStorage.getItem('grapes-home-household-v1')
      let family=createEmptyFamilyHome(H,A)
      family=stageFamilyHomeCommand({state:family,householdId:H,actorId:A,role:'owner',
        command:{type:'ShoppingItemAdded',eventId:OP1,
          payload:{name:'Közös tej',quantity:1,unit:'l'}}}).candidate
      family=stageFamilyHomeCommand({state:family,householdId:H,actorId:A,role:'owner',
        command:{type:'StockCountConfirmed',eventId:OP2,
          payload:{name:'Közös liszt',quantity:2,unit:'kg',storageLocation:'pantry'}}}).candidate
      window.qaActor=A
      window.qaFamily=family
      window.qaCalls=[]
      const client={
        supabaseUrl:'https://'+HOME_SUPABASE_TEST_REF+'.supabase.co',
        auth:{async getUser(){return {data:{user:{id:window.qaActor,is_anonymous:false}}}}},
        schema(schema){
          if(schema!=='api')throw Error('Only api schema is expected')
          return {async rpc(method,args){
            window.qaCalls.push({method,args})
            if(method==='home_m3b_read_household')
              return {data:{householdId:H,role:'owner',
                revision:window.qaFamily.revision,state:window.qaFamily}}
            throw Error('Unexpected RPC')
          }}
        },
      }
      const gate=createHomeTestReadOnlyGate({client,expectedUserId:A,
        projectRef:HOME_SUPABASE_TEST_REF,testGateEnabled:true})
      const ui=createHomeMobile(document.querySelector('[data-household-root]'),
        localStorage,{familyPreview:{
          enabled:true,gateway:gate,householdId:H,expectedUserId:A,
          getActiveOwner:async()=>window.qaActor,
        }})
      window.qaUI=ui
      await ui.load()
      return {before,after:localStorage.getItem('grapes-home-household-v1')}
    },{A,H,OP1,OP2})
    assert.equal(data.before,data.after,'Personal v1 journal not altered')
    const home=page.locator('[data-household-root]')
    assert.equal(await home.getAttribute('data-home-source'),'family-test-readonly')
    assert.equal(await home.locator('[data-household-tabs]').count(),0)
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'1')
    assert.equal((await home.locator('[data-household-inventory-count]').textContent()).trim(),'1')
    assert.equal(await home.getByText('Közös tej').count(),1)
    assert.equal(await home.getByText('Közös liszt').count(),1)
    assert.equal(await home.getByText('Személyes cukor').count(),0,
      'Do not merge personal v1 and remote v2 list')
    assert.match(await home.locator('[data-household-source]').textContent(),/TEST közös Otthon.*csak olvasás/)
    assert.equal(await home.locator('[data-household-add]').first().isDisabled(),true)
    assert.equal(await home.locator('[data-household-check]').first().isDisabled(),true)
    assert.equal(await home.locator('[data-household-edit]').first().isDisabled(),true)
    assert.equal(await home.locator('[data-household-share]').first().isDisabled(),true)
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
    assert.ok(overflow<=2,'One Home overflow at '+width+'px: '+overflow)
    await page.evaluate(async B=>{
      window.qaActor=B
      window.qaUI.invalidateFamilyPreview()
      await window.qaUI.load()
    },B)
    assert.equal(await home.getAttribute('data-home-source'),'family-test-unverified')
    assert.equal(await home.getByText('Közös tej').count(),0)
    assert.equal(await home.getByText('Személyes cukor').count(),1)
    assert.equal(await home.locator('[data-household-add]').first().isDisabled(),true)
    assert.equal(data.before,await page.evaluate(()=>localStorage.getItem('grapes-home-household-v1')))
    assert.deepEqual(errors,[],'Unexpected JS error on '+width+'px')
    await context.close()
  }
  console.log('PASS: live One Home widgets render authenticated TEST family v2 read-only, A/B invalidation and v1 preservation at 320/360/390/412px')
}finally{
  await browser?.close()
  server.kill('SIGTERM')
}
