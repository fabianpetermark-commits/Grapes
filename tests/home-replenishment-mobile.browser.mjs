import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(x => x && existsSync(x))
assert.ok(chrome, 'Chromium is needed to test the real Home mobile UI')
const port = 4252
const url = `http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], {cwd:root,stdio:'ignore'})
let browser
try {
  for (let n=0;n<120;n++) {
    try { if((await fetch(url)).ok)break } catch {}
    if(server.exitCode!==null||n===119)throw new Error('Home UI unavailable')
    await new Promise(ok=>setTimeout(ok,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:390,height:890}})
  await context.addInitScript(()=>{
    localStorage.setItem('grapes-local-mode','1')
    window.GrapesAndroid={postMessage(message){
      const {method,requestId}=JSON.parse(message)
      const owner=localStorage.getItem('__home_qa_subject')||
        '00000000-0000-4000-8000-000000000001'
      const value=method==='getTestAuthEnabled'?'true':
        method==='getTestAuthSubject'?owner:''
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('grapes:android-result',
        {detail:{requestId,ok:true,payload:value}})))
    }}
  })
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  async function openHome() {
    await page.locator('[data-menu-group="home"]').click()
    await page.locator('[data-page="hub-home"] [data-menu-destination="inventory"]').click()
    await page.waitForFunction(()=> {
      const n=document.querySelector('[data-household-root]')
      return n&&!n.inert&&getComputedStyle(n).visibility!=='hidden'&&
        !document.querySelector('[data-household-tabs]').hidden
    },{timeout:15000})
  }
  await page.goto(url)
  await openHome()
  const home=page.locator('[data-household-root]')
  const form=home.locator('[data-household-form]')
  await home.locator('[data-household-add="inventory"]').click()
  await form.locator('[name="name"]').fill('Tej')
  await form.locator('[name="quantity"]').fill('2')
  await form.locator('[name="unit"]').selectOption('l')
  await form.locator('button[type=submit]').click()
  await home.locator('[data-household-edit]').first().click()
  await form.locator('[name="quantity"]').fill('0')
  await form.locator('button[type=submit]').click()
  await home.locator('[data-household-tab="replenishment"]').click()
    await home.locator('[data-household-suggestion-pick]').waitFor()
  assert.ok((await home.locator('[data-household-replenishment-items]').textContent()).includes('Tej'))
  assert.equal(await home.locator('[data-household-dismiss-key]').count(),1)
  const colour=await home.locator('[data-household-dismiss-key]').evaluate(
    el=>getComputedStyle(el).color)
  assert.equal(colour,'rgb(242, 139, 139)')
  await home.locator('[data-household-dismiss-key]').click()
  await home.locator('[data-household-suggestion-pick]').waitFor({state:'detached'})
  assert.ok((await home.locator('[data-household-replenishment-history]').textContent()).includes('Elvetve'))
  await page.reload()
  await openHome()
  await home.locator('[data-household-tab="replenishment"]').click()
  assert.equal(await home.locator('[data-household-suggestion-pick]').count(),0)
  assert.ok((await home.locator('[data-household-replenishment-history]').textContent()).includes('Elvetve'))
  await page.evaluate(owner=>localStorage.setItem('__home_qa_subject',owner),B)
  await page.reload()
  await openHome()
  await home.locator('[data-household-tab="replenishment"]').click()
  assert.equal(await home.locator('[data-household-suggestion-pick]').count(),0)
  assert.ok(!(await home.textContent()).includes('Tej · 2 l'))
  await page.evaluate(owner=>localStorage.setItem('__home_qa_subject',owner),A)
  await page.reload()
  await openHome()
  await home.locator('[data-household-tab="replenishment"]').click()
  await home.locator('.household-replenishment-history summary').click()
  await home.locator('[data-household-restore-key]').click()
  await home.locator('[data-household-suggestion-pick]').waitFor()
  await home.locator('[data-household-suggestion-pick]').check()
  await home.locator('[data-household-tab="shopping"]').click()
  await home.locator('[data-household-new-list]').click()
  await home.locator('[data-household-list-form] [name="name"]').fill('Heti bevásárlás')
  await home.locator('[data-household-list-form] button[type=submit]').click()
  await page.waitForFunction(() => {
    const select=document.querySelector('[data-household-list-select]')
    return select?.value !== 'main' || !!document.querySelector('[data-household-alert].is-error:not([hidden])')
  },{timeout:10000})
  const created=await home.locator('[data-household-list-select]').inputValue()
  const debug=await page.evaluate(()=>({alert:document.querySelector('[data-household-alert]')?.textContent,
    select:document.querySelector('[data-household-list-select]')?.value,
    opts:[...document.querySelector('[data-household-list-select]')?.options||[]].map(o=>o.textContent),
    formHidden:document.querySelector('[data-household-list-form]')?.hidden}))
  assert.notEqual(created,'main','Expected created list; '+JSON.stringify(debug))
  await home.locator('[data-household-tab="replenishment"]').click()
  await home.locator('[data-household-suggestion-pick]').check()
  await home.locator('[data-household-suggestion-list]').selectOption(created)
  await home.locator('[data-household-move-selected]').click()
  await home.locator('[data-household-tab="shopping"]').click()
  assert.ok((await home.locator('[data-household-items]').textContent()).includes('Tej'))
  let stock=await page.evaluate(async()=>{
    const {openGrapesTestFreshHome}=await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState()
  })
  assert.equal(stock.inventory.reduce((n,x)=>n+x.quantityBase,0),0)
  await home.locator('[data-household-check]').click()
  stock=await page.evaluate(async()=>{
    const {openGrapesTestFreshHome}=await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState()
  })
  assert.equal(stock.inventory.reduce((n,x)=>n+x.quantityBase,0),2000)
  assert.equal(stock.shopping.at(-1).listId,created)
  // Purchases of non-diary goods: four real checkout records at a regular
  // interval, WITHOUT any recorded consumption. No artificial stock-out.
  await page.evaluate(async () => {
    const {openGrapesTestFreshHome}=await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const session=await openGrapesTestFreshHome({enabled:true})
    const RealDate=globalThis.Date
    const reference=RealDate.now()
    for (const daysAgo of [27,20,13,6]) {
      const stamp=reference-daysAgo*86400000
      globalThis.Date=class extends RealDate {
        constructor(...args) { if(args.length) super(...args); else super(stamp) }
        static now() { return stamp }
      }
      try {
        await session.dispatch({type:'ShoppingItemAdded',eventId:crypto.randomUUID(),
          payload:{name:'Élesztő',quantity:1,unit:'csomag',listId:'main'}})
        const id=session.getState().shopping.at(-1).id
        await session.dispatch({type:'ShoppingItemStatusChanged',eventId:crypto.randomUUID(),
          payload:{id,status:'checked'}})
      } finally { globalThis.Date=RealDate }
    }
  })
  await page.reload()
  await openHome()
  await home.locator('[data-household-tab="replenishment"]').click()
  await home.locator('[data-household-forecast-amount]').waitFor()
  const forecast=home.locator('.household-proposal-forecast')
  assert.ok((await forecast.textContent()).includes('Élesztő'))
  assert.ok((await forecast.textContent()).includes('NEM igazolt hiány'))
  assert.equal(await forecast.locator('[data-household-forecast-amount]').inputValue(),'')
  await forecast.locator('[data-household-dismiss-key]').click()
  await forecast.locator('[data-household-dismiss-key]').waitFor({state:'detached'})
  await page.reload(); await openHome()
  await home.locator('[data-household-tab="replenishment"]').click()
  assert.equal(await home.locator('.household-proposal-forecast').count(),0)
  await home.locator('.household-replenishment-history summary').click()
  await home.locator('[data-household-restore-key]').click()
  await home.locator('[data-household-forecast-amount]').waitFor()
  await home.locator('.household-proposal-forecast [data-household-suggestion-pick]').check()
  await home.locator('[data-household-suggestion-list]').selectOption(created)
  const stockBefore=await page.evaluate(async()=>{
    const {openGrapesTestFreshHome}=await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState().inventory.map(x=>x.quantityBase)
  })
  await home.locator('[data-household-move-selected]').click()
  await home.locator('[data-household-tab="shopping"]').click()
  const yeast=home.locator('[data-household-items] .household-card').filter({hasText:'Élesztő'})
  await yeast.waitFor()
  assert.ok((await yeast.textContent()).includes('Mennyiség ismeretlen'))
  await yeast.locator('[data-household-check]').click()
  const stockAfter=await page.evaluate(async()=>{
    const {openGrapesTestFreshHome}=await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState().inventory.map(x=>x.quantityBase)
  })
  assert.deepEqual(stockAfter,stockBefore,'A forecast quantity must not silently increase stock')
  await home.locator('[data-household-tab="replenishment"]').click()
  assert.equal(await home.locator('.household-proposal-forecast').count(),0)
  console.log('PASS: real mobile estimated yeast repurchase (not proof of shortage), red X reload and no-quantity purchase safety.')
  for (const w of [320,360,390,412]) {
    await page.setViewportSize({width:w,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,
      'horizontal scroll at '+w)
  }
  assert.deepEqual(errors,[])
  console.log('PASS: owner A→B→A red X persistence, 30d proposal UI, restore, named list, manual checkout and stock safety')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
