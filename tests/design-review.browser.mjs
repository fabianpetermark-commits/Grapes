// Grapes HTML review: this validates actual reference pages inside the eleven-screen review center.
// No TEST/PROD runtime, no external API calls, no account credentials.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root='http://127.0.0.1:4177/design/references/';
const out=resolve('design/reference-screenshots');
mkdirSync(out,{recursive:true});
const cases=[
  ['start','candidates/main-shell-tools.html'],
  ['home','candidates/home.html'],
  ['health','approved/health-minimal.html'],
  ['food','candidates/food.html'],
  ['water','candidates/water.html'],
  ['recipes','candidates/recipes.html'],
  ['plants','approved/plants-widget.html'],
  ['tools','candidates/tools.html'],
  ['ebook','candidates/ebook.html'],
  ['qr','candidates/qr.html'],
  ['finance','candidates/finance.html']
];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1240,height:930},deviceScaleFactor:1,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',e=>errors.push('review: '+e.message));
 const res=await page.goto(root+'review.html',{waitUntil:'networkidle'});
 if(res?.status()!==200)throw Error('Review not available');
 if(await page.locator('[data-screen]').count()!==11)throw Error('Review gallery must list eleven real HTML screens');
 for(const [name,path] of cases){
   await page.locator('[data-screen="'+name+'"]').click();
   const iframe=page.frameLocator('#screen-iframe');
   await iframe.locator('body').waitFor({state:'visible'});
   const src=await page.locator('#screen-iframe').getAttribute('src');
   if(src!==path)throw Error(name+': expected exact HTML, got '+src);
   if(!(await iframe.locator('body').innerText()).trim())throw Error(name+': empty iframe');
   await page.locator('[data-width="320"]').click();
   await page.waitForTimeout(75);
   let size=await page.locator('#device-viewport').evaluate(e=>({width:e.getBoundingClientRect().width,parent:e.closest('.preview-area').getBoundingClientRect().width}));
   if(size.width>size.parent+2)throw Error(name+': 320 preview overflows '+JSON.stringify(size));
   await page.locator('[data-width="390"]').click();
   if(['home','tools','health','plants','ebook','qr','finance','food','water','recipes'].includes(name)){
     const measured=await iframe.locator('body').evaluate((body,id)=>{
        const nav=body.querySelector(id==='finance'?'.module-tabs':id==='ebook'||id==='qr'?'.detailNav.icon-rail':id==='health'||id==='plants'?'.grapes-six-rail':['food','water','recipes'].includes(id)?'.hi-rail':'.tabs');
        const title=body.querySelector(id==='health'||id==='plants'?'.phone__screen>.appbar h1':id==='finance'?'.finance-view-title':id==='ebook'||id==='qr'?'.module-view-title':['food','water','recipes'].includes(id)?'.hi-title':'.header h1');
        if(!nav||!title)return {error:'missing nav/title'};
        return {navTop:nav.getBoundingClientRect().top,titleTop:title.getBoundingClientRect().top,title:title.textContent.trim()};
     },name);
     if(measured.error||measured.titleTop<=measured.navTop)throw Error(name+': incorrect title/nav order: '+JSON.stringify(measured));
   }
   if(name==='finance'){
      for(const [tab,title] of [['ledger','Tranzakciók'],['savings','Megtakarítások'],['forecast','Előrejelzés'],['import','Importálás'],['overview','Áttekintés']]){
        await iframe.locator('[data-tab="'+tab+'"]').click();
        const panel=iframe.locator('[data-panel="'+tab+'"]');
        if(!(await panel.isVisible()))throw Error('Finance state not visible: '+tab);
        if(!(await panel.locator('h2').first().innerText()).includes(title))throw Error('Finance heading mismatch: '+tab);
        if(tab==='ledger')await iframe.locator('#ledger-list').waitFor({state:'visible'});
      }
   }
   if(name==='ebook'){
      await page.locator('[data-state="reader"]').click();
      if(await iframe.locator('.module-view-title').innerText()!=='Olvasó')throw Error('E-book title was not updated on tab change');
   }
   if(name==='qr'){
      await page.locator('[data-state="colors"]').click();
      if(!(await iframe.locator('[data-qr-panel="colors"]').isVisible()))throw Error('QR color state not available');
   }
   console.log('Review screen OK',name,path);
 }
 await page.locator('[data-screen="start"]').click();
 await page.locator('[data-width="390"]').click();
 await page.screenshot({path:resolve(out,'review-center-desktop.png'),animations:'disabled',fullPage:true});
 const mobile=await browser.newPage({viewport:{width:360,height:820},deviceScaleFactor:1,reducedMotion:'reduce'});
 mobile.on('pageerror',e=>errors.push('mobile: '+e.message));
 await mobile.goto(root+'review.html',{waitUntil:'networkidle'});
 await mobile.locator('[data-screen="finance"]').click();
 if(await mobile.locator('html').evaluate(n=>n.scrollWidth>innerWidth+2))throw Error('review center mobile horizontal overflow');
 await mobile.screenshot({path:resolve(out,'review-center-mobile.png'),animations:'disabled',fullPage:true});
 if(errors.length)throw Error(errors.join('; '));
 console.log('All eleven live HTML preview screens and navigation states passed.');
}finally{await browser.close();}
