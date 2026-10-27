import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const browserPath=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x))
assert.ok(browserPath,'Chromium required for approved One Home regression')
const port=4268
const url='http://127.0.0.1:'+port+'/Grapes/design/android-mobile-preview.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],
  {cwd:root,stdio:'ignore'})
let browser
try {
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99||server.exitCode!==null)throw Error('Home preview unavailable')
    await new Promise(done=>setTimeout(done,100))
  }
  browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox']})
  for(const width of [320,360,390,412]){
    const context=await browser.newContext({viewport:{width,height:820}})
    await context.addInitScript(()=>localStorage.setItem('grapes-local-mode','1'))
    const page=await context.newPage(),errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto(url)
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await page.locator('[data-menu-group="home"]').click()
    const home=page.locator('[data-page="household"]')
    await home.waitFor({state:'visible'})
    assert.equal(await home.locator('[data-household-tabs]').count(),0)
    assert.equal(await home.locator('[data-household-shopping]').isVisible(),true)
    assert.equal(await home.locator('[data-household-inventory]').isVisible(),true)
    assert.equal(await home.locator('[data-household-suggestions]').isVisible(),true)
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'0')
    // PROD local Home must never pretend that family sharing is configured.
    assert.equal(await home.locator('.household-head [data-household-share]').isDisabled(),true)
    assert.equal(await home.locator('[data-household-share-panel]').isVisible(),false)
    const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
    assert.ok(pageWidth<=2,'Home overflow on '+width+'px')
    await home.locator('[data-household-add="shopping"]').first().click()
    const form=home.locator('[data-household-form]')
    assert.equal(await form.isVisible(),true)
    const sheet=await form.evaluate(node=>({
      position:getComputedStyle(node).position,
      bottom:node.getBoundingClientRect().bottom,
      viewport:window.innerHeight,
      backdrop:!!node.closest('[data-household-root]').querySelector('[data-household-sheet-backdrop]:not([hidden])'),
    }))
    assert.equal(sheet.position,'fixed','New item editor must be a bottom sheet, not inline')
    assert.ok(sheet.bottom<=sheet.viewport+2,JSON.stringify(sheet))
    assert.equal(sheet.backdrop,true,'Modal sheet must dim the Home behind it')
    await form.locator('[name="name"]').fill('Tej')
    await form.locator('button[type="submit"]').click()
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'1')
    assert.equal((await home.locator('[data-household-inventory-count]').textContent()).trim(),'0')
    await home.locator('[data-household-check]').first().click()
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'0')
    assert.equal((await home.locator('[data-household-inventory-count]').textContent()).trim(),'0',
      'Purchased is NOT silently added to inventory')
    await home.locator('.household-done summary').click()
    await home.locator('[data-household-check]').first().click()
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'1')
    await home.locator('[data-household-add="inventory"]').first().click()
    await form.locator('[name="name"]').fill('Liszt')
    await form.locator('[name="quantity"]').fill('0')
    await form.locator('[name="unit"]').selectOption('kg')
    await form.locator('[name="storageLocation"]').selectOption('pantry')
    await form.locator('button[type="submit"]').click()
    assert.equal((await home.locator('[data-household-suggestion-count]').textContent()).trim(),'1',
      'Only confirmed out-of-stock items suggest replenishment')
    await home.locator('[data-household-suggestion-add]').click()
    assert.equal((await home.locator('[data-household-suggestion-count]').textContent()).trim(),'0')
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'2')
    assert.equal((await home.locator('[data-household-inventory-count]').textContent()).trim(),'0')
    assert.ok((await home.textContent()).includes('Liszt'))
    // Identity and local data bytes persist across the same-device reload.
    const before=await page.evaluate(()=>localStorage.getItem('grapes-home-household-v1'))
    assert.ok(before?.includes('Liszt'))
    await page.reload()
    await page.locator('[data-page="home"]').waitFor({state:'visible'})
    await page.locator('[data-menu-group="home"]').click()
    await home.waitFor({state:'visible'})
    const after=await page.evaluate(()=>localStorage.getItem('grapes-home-household-v1'))
    assert.equal(after,before,'Home local event journal unchanged by read/render')
    assert.equal((await home.locator('[data-household-shopping-count]').textContent()).trim(),'2')
    assert.deepEqual(errors,[],'No runtime error at '+width+'px')
    await context.close()
  }
  console.log('PASS: Single Home 3 real widgets / local event persistence / no fake family sync / confirmed-zero suggestion / no silent stock receipt; 320,360,390,412 px')
}finally{await browser?.close();server.kill()}
