import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(chrome,'Chromium required for Android Finance shell route QA')
const port=4311,url='http://127.0.0.1:'+port+'/Grapes/?module=finance&android-shell=1'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try{
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Vite stopped')
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99)throw Error('Vite not started')
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.addInitScript(()=>localStorage.setItem('grapes-local-mode','1'))
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  await page.locator('#finance-app').waitFor({state:'visible'})
  await page.waitForFunction(()=>document.querySelector('#finance-save-status')?.textContent==='Kész')
  assert.equal(await page.locator('#finance-app .finance__header').isVisible(),true)
  assert.equal(await page.locator('[data-finance-tab]').count(),5)
  for(const tab of ['overview','transaction','savings','forecast','import']){
    const button=page.locator('[data-finance-tab="'+tab+'"]')
    await button.click()
    assert.equal(await button.getAttribute('aria-selected'),'true','Finance tab must activate: '+tab)
    await page.locator('[data-finance-panel="'+tab+'"]').waitFor({state:'visible'})
    const visiblePanels=await page.locator('[data-finance-panel]').evaluateAll(nodes=>nodes.filter(n=>!n.hidden&&getComputedStyle(n).display!=='none').length)
    assert.equal(visiblePanels,1,'Exactly one Finance view should be visible: '+tab)
  }
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844})
    const dimensions=await page.locator('#finance-app').evaluate(node=>({
      width:node.getBoundingClientRect().width,
      client:node.clientWidth,
      scroll:node.scrollWidth,
      document:document.documentElement.scrollWidth,
    }))
    assert.ok(dimensions.width>0,'Finance must remain rendered at '+width+'px')
    assert.ok(dimensions.scroll<=dimensions.client+2,'Finance root horizontal overflow at '+width+': '+JSON.stringify(dimensions))
    assert.ok(dimensions.document<=width+2,'Document horizontal overflow at '+width+': '+JSON.stringify(dimensions))
  }
  assert.deepEqual(errors,[],'Finance Android module route must not throw')
  console.log('PASS: Android-shell Finance route renders, all five real views activate, no blank page or horizontal overflow at 320/360/390/412px')
  await context.close()
}finally{
  await browser?.close()
  server.kill('SIGTERM')
}
