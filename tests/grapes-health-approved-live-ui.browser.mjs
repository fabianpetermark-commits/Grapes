import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
assert.ok(chrome,'Chromium needed for approved Health live UI QA')
const port=4298
const url='http://127.0.0.1:'+port+'/Grapes/design/android-mobile-preview.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'})
let browser
try {
  for(let n=0;n<100;n++){
    if(server.exitCode!==null)throw Error('Health Vite server exited')
    try {if((await fetch(url)).ok)break} catch {}
    if(n===99)throw Error('Health Vite server not ready')
    await new Promise(done=>setTimeout(done,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const page=await browser.newPage({viewport:{width:390,height:844}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  await page.locator('[data-local]').click()
  const home=page.locator('[data-page="home"]')
  const health=page.locator('[data-page="hub-health"]')
  const settings=page.locator('[data-page="health-settings"]')
  const enterHealth=async()=>{
    await page.locator('.appbar [data-nav="home"]').click()
    await home.waitFor({state:'visible'})
    await home.locator('[data-menu-group="health"]').click()
    await health.waitFor({state:'visible'})
  }
  await enterHealth()
  const buttons=health.locator('[data-health-nav]')
  assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(n=>n.dataset.healthNav)),
    ['food','water','recipes','stats','barcode','settings'])
  assert.equal(await buttons.locator('svg').count(),6)
  assert.equal(await health.locator('.health-panel--food .health-panel-head strong').textContent(),'Mai tápanyagok')
  assert.equal(await health.locator('.health-panel--water .health-panel-head strong').textContent(),'Mai folyadék')
  assert.equal(await health.locator('[data-health-kcal]').count(),1)
  assert.equal(await health.locator('[data-health-water-total]').count(),1)

  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844})
    const dimensions=await health.evaluate(node=>({
      clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,
      railWidth:node.querySelector('.health-top-rail').getBoundingClientRect().width,
      railScrollWidth:node.querySelector('.health-top-rail').scrollWidth,
    }))
    assert.ok(dimensions.scrollWidth<=dimensions.clientWidth+1,
      'Health root horizontal overflow '+width+': '+JSON.stringify(dimensions))
    assert.ok(dimensions.railScrollWidth<=dimensions.railWidth+2,
      'Health rail horizontal overflow '+width+': '+JSON.stringify(dimensions))
  }

  await health.locator('[data-health-nav="settings"]').click()
  await settings.waitFor({state:'visible'})
  assert.equal(await settings.locator('[data-health-settings-index] [data-health-section]').count(),2)
  assert.deepEqual(await settings.locator('[data-health-settings-index] [data-health-section] strong').allTextContents(),
    ['Napi célok','Adatkapcsolatok'])
  await settings.locator('[data-health-section="goals"]').click()
  assert.equal(await settings.locator('[data-health-settings-detail]').isVisible(),true)
  assert.equal(await settings.locator('[data-health-command="food-targets"]').count(),1)
  assert.equal(await settings.locator('[data-health-command="water-goal"]').count(),1)
  assert.equal(await settings.locator('[data-health-pref]').count(),3,
    'Existing per-profile Health widget settings must remain reachable')
  await settings.locator('[data-health-section-back]').click()
  await settings.locator('[data-health-section="integrations"]').click()
  for(const action of ['health-import','samsung-import','yazio-import','food-backup','water-backup','sync']){
    assert.equal(await settings.locator('[data-health-command="'+action+'"]').count(),1,
      'Previous working Health integration/backup action missing: '+action)
  }
  await settings.locator('[data-health-command="health-import"]').click()
  await page.locator('[data-page="sync"]').waitFor({state:'visible'})
  await page.locator('[data-sync-import-sheet].is-open').waitFor({state:'visible'})
  await page.keyboard.press('Escape')

  await enterHealth()
  await health.locator('[data-health-nav="water"]').click()
  await page.locator('[data-page="water"]').waitFor({state:'visible'})
  await enterHealth()
  await health.locator('[data-health-nav="food"]').click()
  await page.locator('[data-page="food"]').waitFor({state:'visible'})
  await enterHealth()
  await health.locator('[data-health-nav="recipes"]').click()
  await page.locator('[data-page="food"]').waitFor({state:'visible'})
  await enterHealth()
  await health.locator('[data-health-nav="stats"]').click()
  await page.locator('[data-page="food"]').waitFor({state:'visible'})
  await enterHealth()
  await health.locator('[data-health-nav="barcode"]').click()
  await page.locator('[data-page="food"]').waitFor({state:'visible'})
  assert.deepEqual(errors,[],'Health must not trigger JS exceptions')
  console.log('PASS: accepted Health 6 live routes, real Food/Water binding, two settings groups, all legacy import/backup controls, 320–412px responsive')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
