import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,'/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean).find(existsSync)
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4199','--strictPort'],{stdio:'ignore'})
const url='http://127.0.0.1:4199/Grapes/design/android-mobile-preview.html'
let browser
try{
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break}catch{};await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.addInitScript(()=>{localStorage.setItem('grapes-local-mode','1')})
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  let offline=false
  await context.route('https://**/*',async route=>{
    if(offline)return route.abort('internetdisconnected')
    const u=new URL(route.request().url())
    if(u.hostname==='api.inaturalist.org')return route.fulfill({json:{results:[{id:123,name:'Solanum lycopersicum',preferred_common_name:'Paradicsom',iconic_taxon_name:'Plantae'}]}})
    if(u.hostname==='geocoding-api.open-meteo.com')return route.fulfill({json:{results:[{name:'Budapest',country:'Magyarország',latitude:47.5,longitude:19}]}})
    if(u.hostname==='api.open-meteo.com')return route.fulfill({json:{current:{temperature_2m:7},daily:{time:['2026-10-28'],temperature_2m_min:[-2],temperature_2m_max:[12],precipitation_sum:[4]}}})
    return route.abort()
  })
  async function open(){await page.locator('[data-page=home] summary').click();await page.locator('[data-module=outdoor]').click();await page.locator('[data-outdoor-root]').waitFor({state:'visible'});assert.equal(await page.locator('.outdoor-rail button').count(),6,'Outdoor must expose the six approved icon actions.');assert.equal(await page.locator('.outdoor-rail button[aria-current=page]').getAttribute('aria-label'),'Növényeim')}
  await page.goto(url);await open()
  const action=name=>page.locator(`[data-outdoor-action=${name}]`)
  const form=()=>page.locator('[data-outdoor-editor] form')
  async function add(name){await action('add').click();await form().locator('[name=name]').fill(name);await form().locator('[name=species]').fill('Solanum lycopersicum');await form().locator('[name=wateringDays]').fill('3');await form().locator('button[type=submit]').click()}
  await add('Terasz paradicsom');await add('Kerti paradicsom')
  assert.equal(await page.locator('[data-plant-id]').count(),2)
  await action('edit').first().click();await form().locator('[name=name]').fill('Terasz piros')
  await form().locator('[name=wintering]').fill('Fagy előtt ellenőrizni')
  await form().locator('[name=photo]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1]}),'base64')})
  await form().locator('button[type=submit]').click()
  await page.locator('.outdoor-photo').waitFor()
  await action('log').first().click();await form().locator('[name=note]').fill('Meglocsoltam');await form().getByRole('button',{name:'Mentés',exact:true}).click()
  await action('log').first().click();await form().locator('[name=kind]').selectOption('wintering');await form().locator('[name=note]').fill('Fagymentes helyre vittem');await form().getByRole('button',{name:'Mentés',exact:true}).click()
  await action('postpone').first().click();await form().getByRole('button',{name:'Halasztás mentése'}).click()
  await action('complete').first().click()
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('grapes-outdoor-v1:local')))
  assert.equal(snapshot.logs.length,3)
  assert.ok(snapshot.tasks.some(t=>t.status==='done'))
  await page.locator('[data-outdoor-view=settings]').click();await action('location').click();await form().locator('[name=city]').fill('Budapest');await form().getByRole('button',{name:'Város keresése'}).click()
  await page.locator('[data-outdoor-cities] button').click().catch(async e=>{console.log('CITY',await page.locator('[data-outdoor-root]').innerText(),errors);throw e})
  await page.waitForFunction(()=>document.querySelector('[data-outdoor-weather]').textContent.includes('Fagy várható'),null,{timeout:10000})
  await action('catalog').click();assert.equal(await page.locator('[data-outdoor-title]').textContent(),'Növénykatalógus');await page.locator('[name=query]').fill('paradicsom');await page.locator('[data-outdoor-form=catalog] button').click()
  await action('catalogAdd').click();await form().locator('[name=name]').fill('Katalógus példány');await form().locator('button[type=submit]').click()
  assert.equal(await page.locator('[data-plant-id]').count(),3)
  // Packaged Android assets remain available offline; block external APIs while reloading local assets.
  offline=true
  await page.reload();await open()
  assert.equal(await page.locator('[data-plant-id]').count(),3)
  assert.equal(await page.locator('.outdoor-photo').count(),1)
  await page.waitForFunction(()=>document.querySelector('[data-outdoor-status]').textContent.includes('nem frissíthető'),null,{timeout:10000})
  await add('Offline növény')
  await action('catalog').click();await page.locator('[name=query]').fill('tomato');await page.locator('[data-outdoor-form=catalog] button').click()
  await page.waitForFunction(()=>document.querySelector('[data-outdoor-status]').textContent.includes('katalógus nem érhető'),null,{timeout:10000})
  await action('catalog').click()
  mkdirSync('artifacts/outdoor-207',{recursive:true})
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Outdoor overflow '+width)
    await page.screenshot({path:`artifacts/outdoor-207/outdoor-${width}.png`,fullPage:true})
  }
  page.once('dialog',d=>d.accept());await action('delete').last().click()
  await page.reload();await open();assert.equal(await page.locator('[data-plant-id]').count(),3)
  // No existing module records were touched.
  assert.equal(await page.evaluate(()=>localStorage.getItem('grapes-water-v1')),null)
  assert.deepEqual(errors,[])
  console.log('PASS: plant CRUD, individual identity, own photo, watering/wintering logs, task completion/postpone, reload/offline persistence, HU/EN catalog and forecast/failures, 320–412px')
}finally{await browser?.close();server.kill()}
