import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(chrome,'Chromium required for the real v1.2 main screen')
const port=4277,url='http://127.0.0.1:'+port+'/Grapes/design/android-mobile-preview.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try{
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Vite stopped')
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99)throw Error('Vite not started')
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  for(const width of [320,360,390,412]){
    const context=await browser.newContext({viewport:{width,height:820}})
    await context.addInitScript(()=>localStorage.setItem('grapes-local-mode','1'))
    const page=await context.newPage(),errors=[]
    page.on('pageerror',x=>errors.push(x.message))
    await page.goto(url)
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    const nav=page.locator('[data-main-rail]')
    assert.equal(await nav.isVisible(),true)
    assert.equal(await nav.locator('button').count(),6)
    assert.deepEqual(await nav.locator('button').evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-label'))),
      ['Home','Health','Tools','Finance','Outdoor','Beállítások'])
    assert.equal(await nav.locator('svg').count(),6)
    assert.equal(await nav.locator('button[aria-current="page"]').count(),0,'Favorites landing is not a seventh module icon')
    const rail=await nav.evaluate(node=>({
      cols:getComputedStyle(node).gridAutoFlow === 'column' ? 6 : 0,
      width:node.getBoundingClientRect().width,
      cells:[...node.querySelectorAll('button')].map(x=>x.getBoundingClientRect().height),
    }))
    assert.equal(rail.cols,6,'Six visible icon slots in one horizontally scrollable capsule')
    assert.ok(rail.width<=width-10,'Rail must fit 320px: '+JSON.stringify(rail))
    assert.ok(rail.cells.every(h=>h>=44),'Minimum touch target')
    assert.equal(await page.locator('[data-page="home"] h1').textContent(),'Gyakran használt')
    const favorites=page.locator('[data-main-shortcut-list]')
    assert.deepEqual(await favorites.locator('[data-main-shortcut]').evaluateAll(nodes=>nodes.map(x=>x.dataset.mainShortcut)),
      ['home','food','water'])
    // Manual favourite is real navigation state and survives reload; never creates Food data.
    await page.locator('[data-main-shortcut-add]').click()
    assert.equal(await page.locator('[data-main-shortcut-picker]').isVisible(),true)
    await page.locator('[data-main-shortcut-select]').selectOption('shopping')
    await page.locator('[data-main-shortcut-pin]').click()
    assert.deepEqual(await favorites.locator('[data-main-shortcut]').evaluateAll(nodes=>nodes.map(x=>x.dataset.mainShortcut)),
      ['home','food','water','shopping'])
    await page.reload()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    assert.deepEqual(await favorites.locator('[data-main-shortcut]').evaluateAll(nodes=>nodes.map(x=>x.dataset.mainShortcut)),
      ['home','food','water','shopping'])
    await page.locator('[data-main-shortcut="shopping"]').click()
    const home=page.locator('[data-page="household"]')
    await home.waitFor({state:'visible'})
    assert.equal(await nav.locator('[data-main-nav="home"]').getAttribute('aria-current'),'page')
    assert.equal(await home.locator('[data-household-shopping]').isVisible(),true)
    assert.equal(await home.locator('[data-household-inventory]').isVisible(),true)
    assert.equal(await home.locator('[data-household-suggestions]').isVisible(),true)
    const shareControls=home.locator('[data-household-share]')
    assert.ok(await shareControls.count()>=1,'Approved Home share UI remains present')
    assert.ok((await shareControls.evaluateAll(nodes=>nodes.map(node=>node.disabled))).every(Boolean),
      'PROD must never fake enabled family sharing in either header or quick action')
    await page.locator('.appbar__home').click()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await page.locator('[data-main-shortcut="food"]').click()
    await page.locator('[data-page="food"]').waitFor({state:'visible'})
    assert.equal(await nav.locator('[data-main-nav="health"]').getAttribute('aria-current'),'page')
    await page.locator('.appbar__home').click()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    const choices=await favorites.locator('[data-main-shortcut]').evaluateAll(nodes=>nodes.map(x=>x.dataset.mainShortcut))
    assert.equal(choices.filter(x=>x==='food').length,1,'Pinned favourite is not duplicated')
    await nav.locator('[data-main-nav="health"]').click()
    await page.locator('[data-page="hub-health"]').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-page="hub-health"] .health-panel--food').isVisible(),true)
    assert.equal(await nav.isVisible(),false,'Health context rail replaces the root rail; no duplicate bars')
    await page.evaluate(()=>window.grapesHandleAndroidBack())
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await nav.locator('[data-main-nav="tools"]').click()
    await page.locator('[data-page="hub-utility"]').waitFor({state:'visible'})
    assert.equal(await page.locator('[data-page="hub-utility"] .tools-module-icon').count(),2)
    await page.locator('.appbar__home').click()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    assert.equal(await nav.isVisible(),true,'Root module chooser returns on the Favorites page')
    await nav.locator('[data-main-nav="finance"]').click()
    await page.waitForURL(/module=finance/)
    await page.locator('#finance-app').waitFor({state:'visible'})
    await page.locator('#finance-save-status').waitFor()
    await page.goBack()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await nav.locator('[data-main-nav="outdoor"]').click()
    await page.locator('[data-page="outdoor"] [data-outdoor-root]').waitFor({state:'visible'})
    await page.evaluate(()=>window.grapesHandleAndroidBack())
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await nav.locator('[data-main-nav="settings"]').click()
    await page.locator('[data-page="more"]').waitFor({state:'visible'})
    assert.equal(await nav.isVisible(),false,'The global module chooser must not remain inside Settings')
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
    assert.ok(overflow<=2,'Main screen horizontal overflow at '+width+':'+overflow)
    assert.deepEqual(errors,[],'Unexpected browser exception at '+width)
    await context.close()
  }
  console.log('PASS: scrollable six-slot v1.2 rail, Outdoor, direct Finance, icon-only Tools, owner-safe Home and four mobile viewports')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
