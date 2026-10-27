import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,'/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean).find(existsSync)
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4198','--strictPort'],{env:{...process.env,VITE_GOOGLE_CLIENT_ID:'tools-test'},stdio:'ignore'})
const base = 'http://127.0.0.1:4198/Grapes/'
let browser
try {
  for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
  browser = await chromium.launch({executablePath,headless:true,args:['--no-sandbox']})
  const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
  await context.addInitScript(()=>localStorage.setItem('grapes-local-mode','1'))
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'design/android-mobile-preview.html')
  await page.locator('[data-menu-group="utility"]').click()
  await page.locator('[data-menu-destination="qr"]').click()
  await page.locator('#qr-type').selectOption('text')
  await page.locator('#qr-val-text').fill('Grapes megőrzött QR')
  await page.locator('#qr-download-png:not([disabled])').waitFor()
  const download = page.waitForEvent('download'); await page.locator('#qr-download-png').click()
  assert.equal((await download).suggestedFilename(),'qrcode.png')
  // Deliberately leave before the debounce: navigation must await the existing IDB store.
  await page.locator('#qr-val-text').fill('Gyors kilépés után is megmarad')
  await page.locator('#qr-back-to-menu-btn').click()
  await page.locator('[data-page="hub-utility"]').waitFor({state:'visible'})
  await page.locator('[data-menu-destination="qr"]').click()
  await page.waitForFunction(()=>document.querySelector('#qr-val-text')?.value==='Gyors kilépés után is megmarad')
  mkdirSync('artifacts/tools-206',{recursive:true})
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844})
    assert.equal(await page.locator('.mobile-module-nav button').count(),6)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'QR overflow '+width)
    await page.locator('#qr-tab-color').click()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'QR color overflow '+width)
    assert.ok(await page.locator('[data-qr-color]').first().evaluate(x=>x.getBoundingClientRect().height>=44))
    await page.screenshot({path:`artifacts/tools-206/qr-${width}.png`})
  }
  await page.locator('.mobile-module-nav [aria-label="Tools"]').click()
  await page.locator('[data-page="hub-utility"]').waitFor({state:'visible'})
  // Actual PDF bytes through mocked external Drive only; application/controller stay real.
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Grapes PDF page one',{x:50,y:700});pdf.addPage().drawText('Second PDF page',{x:50,y:700})
  const bytes=Buffer.from(await pdf.save())
  await context.addInitScript(()=>sessionStorage.setItem('grapes-drive-session',JSON.stringify({clientId:'tools-test',accessToken:'fixture',expiresAt:Date.now()+3600000,scopes:'https://www.googleapis.com/auth/drive.file',account:{email:'tools@example.com'}})))
  await context.route('https://www.googleapis.com/**',async route=>{
    const u=new URL(route.request().url());const q=u.searchParams.get('q')||'';let body={files:[]}
    if(u.pathname.endsWith('/files/pdf-1') && u.searchParams.get('alt')==='media')return route.fulfill({status:200,contentType:'application/pdf',body:bytes})
    if(q.includes("name = 'Grapes E-book Library'")) body={files:[{id:'library'}]}
    else if(q.includes("'library' in parents"))body={files:[{id:'pdf-1',name:'Grapes.pdf',mimeType:'application/pdf'}]}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.reload()
  await page.locator('[data-menu-destination="ebook"]').click()
  await page.locator('.book-tile').click()
  await page.locator('[data-reader-page] canvas').waitFor()
  await page.waitForFunction(()=>document.querySelector('[data-reader-page] canvas')?.height>0)
  assert.equal(await page.locator('[data-reader-chapter] option').count(),2)
  await page.waitForFunction(()=>document.querySelector('[data-reader-status]').textContent === '',null,{timeout:10000}).catch(async e=>{console.log('PDF status:',await page.locator('[data-page=reader]').innerText()); console.log('Errors:',errors);throw e})
  await page.locator('[data-reader-chapter]').selectOption('pdf-page-2')
  await page.waitForFunction(()=>document.querySelector('[data-reader-page]').textContent.includes('Second PDF page'), null, {timeout:10000}).catch(async e=>{console.log(await page.locator('[data-page=reader]').textContent());console.log('selection',await page.locator('[data-reader-chapter]').inputValue(),'errors',errors);throw e})
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'PDF overflow '+width)
    await page.screenshot({path:`artifacts/tools-206/pdf-${width}.png`})
  }
  await page.evaluate(()=>window.grapesHandleAndroidBack())
  await page.locator('[data-page="ebook"]').waitFor({state:'visible'})
  await page.evaluate(()=>window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-utility"]').waitFor({state:'visible'})
  assert.deepEqual(errors,[])
  console.log('PASS: QR generation/PNG/export/immediate exit/IDB restore, six destinations, PDF rendering/page selection, 320–412px screenshots')
}finally{await browser?.close();server.kill()}
