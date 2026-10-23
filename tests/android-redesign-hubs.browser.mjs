import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:4194/Grapes/design/android-mobile-preview.html';
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
if (!executablePath) throw Error('Chromium is required for TEST widget review.');
const server = spawn(process.execPath,
  [resolve(cwd,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4194','--strictPort'],
  {cwd,env:{...process.env,VITE_GRAPES_TEST_CHANNEL:'1'},stdio:['ignore','pipe','pipe']});
let stderr='';
server.stderr.on('data', x=>stderr+=String(x).slice(-1000));
let browser;
try{
  let ready=false;
  for(let n=0;n<100;n++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,100));}
  if(!ready)throw Error('Vite not ready: '+stderr.slice(-1500));
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{localStorage.setItem('grapes-local-mode','1')});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('[data-page="home"]').waitFor({state:'visible'});
  mkdirSync(resolve(cwd,'artifacts/redesign'),{recursive:true});
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844});
    for(const [menu,hub,slug] of [['home','hub-home','home'],['utility','hub-utility','tools'],['finance','hub-finance','finance']]){
      await page.locator(`[data-menu-group="${menu}"]`).click();
      await page.locator(`[data-page="${hub}"] .grapes-widget-redesign`).waitFor({state:'visible'});
      assert.equal(await page.locator(`[data-page="${hub}"] .grapes-dash-dock`).count(),1);
      const status=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(status.doc<=status.viewport+2,`${slug}: horizontal overflow at ${width}px: ${JSON.stringify(status)}`);
      const border=await page.locator(`[data-page="${hub}"] .grapes-dash-widget`).first().evaluate(n=>getComputedStyle(n).borderTopColor);
      assert.ok(border==='rgb(41, 62, 76)',`Expected quiet widget outline, got ${border}`);
      if(width===390)await page.locator(`[data-page="${hub}"]`).screenshot({path:resolve(cwd,`artifacts/redesign/${slug}-390.png`)});
      await page.locator('.appbar [data-nav="home"]').click();
    }
  }
  await page.locator('[data-menu-group="home"]').click();
  assert.equal(await page.locator('[data-dash-shopping-count]').textContent(),'0 tétel');
  await page.locator('[data-page="hub-home"] [data-widget-action="add-shopping"]').click();
  await page.locator('[data-household-form] [name="name"]').fill('Teszttej');
  await page.locator('[data-household-form] [name="quantity"]').fill('2');
  await page.locator('[data-household-form] [name="unit"]').selectOption('l');
  await page.locator('[data-household-form] button[type="submit"]').click();
  await page.evaluate(()=>window.grapesHandleAndroidBack());
  await page.locator('[data-page="hub-home"]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-dash-shopping-count]').textContent(),/1 tétel/);
  assert.match(await page.locator('[data-dash-shopping-list]').textContent(),/Teszttej/);
  await page.locator('[data-page="hub-home"] [data-widget-action="inventory"]').click();
  await page.locator('[data-page="household"]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-household-root]').textContent(),/Home/);
  await page.locator('.appbar [data-nav="home"]').click();
  await page.locator('[data-menu-group="utility"]').click();
  assert.match(await page.locator('[data-dash-book-detail]').textContent(),/Drive nincs csatlakoztatva/);
  await page.locator('[data-page="hub-utility"] [data-widget-action="ebook"]').first().click();
  await page.locator('[data-page="ebook"]').waitFor({state:'visible'});
  await page.locator('.appbar [data-nav="home"]').click();
  await page.locator('[data-menu-group="finance"]').click();
  assert.match(await page.locator('[data-page="hub-finance"]').textContent(),/Nem jelenítünk meg kitalált összegeket/);
  assert.equal(await page.locator('[data-page="hub-finance"] [data-widget-action="finance"]').count(),3);
  assert.deepEqual(errors,[]);
  console.log('Grapes TEST Home / Tools / Finance widgets: 320–412 px, no fake metrics, real Home count, existing routes, no JS pageerrors OK.');
}finally{await browser?.close();server.kill();}
