// Grapes DESIGN reference smoke + mobile screenshot maker.
// Tests stand-alone, mock-data HTML files only, never touches live application data.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = 'http://127.0.0.1:4177/design/references/';
const previews = [
  { path: 'approved/health-minimal.html', name: 'health-approved' },
  { path: 'approved/plants-widget.html', name: 'plants-style-approved' },
  { path: 'approved/main-shell-widgets.html', name: 'main-shell-original' },
  { path: 'candidates/main-shell-tools.html', name: 'main-shell-tools-proposed' },
  { path: 'candidates/home.html', name: 'home-proposed' },
  { path: 'candidates/tools.html', name: 'tools-proposed' },
  { path: 'candidates/food.html', name: 'food-inner-proposed' },
  { path: 'candidates/water.html', name: 'water-inner-proposed' },
  { path: 'candidates/recipes.html', name: 'recipes-inner-proposed' },
  { path: 'candidates/finance.html', name: 'finance-proposed' },
  { path: 'candidates/ebook.html', name: 'ebook-proposed' },
  { path: 'candidates/qr.html', name: 'qr-proposed' },
  { path: 'index.html', name: 'gallery' }
];
const widths = [320, 390, 412];
const output = resolve('design/reference-screenshots');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  for (const item of previews) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const response = await page.goto(base + item.path, { waitUntil: 'networkidle', timeout: 20000 });
      if (response?.status() !== 200) throw new Error(item.path + ' HTTP ' + response?.status());
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        title: document.title,
        bodyText: document.body?.innerText?.trim() || ''
      }));
      if (!dimensions.title || !dimensions.bodyText) throw new Error(item.path + ': empty title/body');
      if (item.path !== 'index.html' && errors.length) {
        throw new Error(item.path + ': JavaScript pageerror: ' + errors.join('; '));
      }
      if (item.path !== 'index.html' && dimensions.width > dimensions.viewport + 3) {
        throw new Error(item.path + ': horizontal overflow at ' + width + 'px: scrollWidth=' + dimensions.width);
      }
      // Unified Grapes icon-rail contract: all current module/menu HTML references,
      // six captionless, individually accessible icons in a single rounded capsule.
      if (item.path !== 'index.html') {
        const selector = item.path.includes('main-shell')
          ? '#rail' : item.path.includes('finance.html')
          ? '.module-tabs' : ['approved/health-minimal.html','approved/plants-widget.html'].includes(item.path)
          ? '.grapes-six-rail' : item.path.includes('ebook.html') || item.path.includes('qr.html')
          ? (item.path.includes('ebook.html')?'.rail':'.detailNav.icon-rail') : ['candidates/food.html','candidates/water.html','candidates/recipes.html'].includes(item.path)
          ? '.hi-rail' : '.tabs';
        const info = await page.locator(selector).evaluate(nav => {
          const controls = [...nav.querySelectorAll('button,a')];
          const rail = getComputedStyle(nav);
          const widths = controls.map(el=>el.getBoundingClientRect().width);
          const labels = controls.map(el=>(el.getAttribute('aria-label')||'').trim());
          const visibleCaptions = controls.filter(el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));
          return { n:controls.length,grid:rail.display,columns:rail.gridTemplateColumns.split(' ').length,
                   width:nav.getBoundingClientRect().width,maxWidth:Math.max(...widths),labels,visibleCaptions:visibleCaptions.length,
                   radius:parseFloat(rail.borderTopLeftRadius) };
        });
        if (info.labels.some(label => /^(?:vissza|‹\\s*főmenü|home gomb)/i.test(label))) {
          throw new Error('Redundant Back/Home shortcut forbidden in '+item.path+': '+info.labels.join(', '));
        }
        if (info.n !== 6 || info.grid !== 'grid' || info.columns!==6 ||
            info.visibleCaptions || info.labels.some(label=>!label) || info.radius < 19) {
          throw new Error('Bad 6-icon Grapes rail on '+item.path+': '+JSON.stringify(info));
        }
      }

      // Food/Water/Recipes share the approved Health Quick Action: 3 in pill + separate scan.
      if (['candidates/food.html','candidates/water.html','candidates/recipes.html'].includes(item.path)) {
        const dock=page.locator('.hi-dock');
        const layout=await dock.evaluate(el=>{
          const buttons=[...el.querySelectorAll('button')];
          return {fixed:getComputedStyle(el).position==='fixed',count:buttons.length,
                  named:buttons.every(b=>Boolean(b.getAttribute('aria-label'))),
                  height:buttons.map(b=>Math.round(b.getBoundingClientRect().height))};
        });
        if(!layout.fixed||layout.count!==4||!layout.named||layout.height.some(h=>h<44))
          throw Error(item.path+': Health Quick Action contract '+JSON.stringify(layout));
        const extra=await page.evaluate(()=>Array.from(document.querySelectorAll('a,button')).filter(e=>/^(vissza|home|főmenü)$/i.test((e.getAttribute('aria-label')||'').trim())).length);
        if(extra)throw Error(item.path+': forbidden redundant Back/Home control');
      }
      if (item.path === 'candidates/food.html' && width === 390) {
        await page.locator('[data-meal="Reggeli"]').click();
        await page.locator('#hi-meal-name').fill('Teszt zabkása');
        await page.locator('#hi-meal-kcal').fill('200');
        await page.getByRole('button',{name:'Hozzáadás'}).last().click();
        if(!(await page.locator('#food-items').innerText()).includes('Teszt zabkása'))
          throw Error('Food in-memory meal add failed');
        if(!(await page.locator('#food-total').innerText()).replace(/\s/g,'').includes('1620'))
          throw Error('Food progress not updated');
        await page.locator('[data-scan]').last().click();
        if(!(await page.locator('#hi-dialog-title').innerText()).includes('Vonalkód'))
          throw Error('Food scanner preview missing');
        await page.locator('#hi-dialog-close').click();
      }
      if (item.path === 'candidates/water.html' && width === 390) {
        const before=await page.locator('#water-total').innerText();
        await page.locator('[data-water-add="250"]').click();
        const after=await page.locator('#water-total').innerText();
        if(before===after)throw Error('Water quick add did not update');
        await page.locator('#water-goal-edit').click();
        await page.locator('#hi-new-goal').fill('2400');
        await page.getByRole('button',{name:'Mentés'}).click();
        if(!(await page.locator('#water-goal-value').innerText()).replace(/\s/g,'').includes('2400'))
          throw Error('Water goal demo update failed');
      }
      if (item.path === 'candidates/recipes.html' && width === 390) {
        await page.locator('#recipe-search').fill('quark');
        if((await page.locator('#recipe-grid .hi-recipe').count())!==1)
          throw Error('Recipe filtering failed');
        await page.locator('#new-recipe').click();
        await page.locator('[data-editor-tab="4"]').click();
        if(!(await page.locator('[data-editor-pane="4"]').isVisible()))throw Error('Recipe import tab not visible');
        await page.locator('[data-editor-tab="0"]').click();
        await page.locator('#hi-recipe-name').fill('Teszt recept');
        await page.getByRole('button',{name:'Mentés a mintába'}).click();
        await page.locator('#recipe-search').fill('Teszt');
        if(!(await page.locator('#recipe-grid').innerText()).includes('Teszt recept'))
          throw Error('Recipe editor demo save failed');
      }
      if (item.path === 'candidates/home.html') {
        const q=await page.locator('footer.dock').evaluate(el=>{
          const group=el.querySelector('.dockGroup');
          const controls=[...group.querySelectorAll('button,a')];
          const separate=el.querySelector('.dockMain');
          return {fixed:getComputedStyle(el).position==='fixed',count:controls.length,
                  standAlone:!!separate,labels:controls.map(x=>x.getAttribute('aria-label')),
                  heights:controls.map(x=>x.getBoundingClientRect().height),
                  separateHeight:separate?.getBoundingClientRect().height,
                  separateLabel:separate?.getAttribute('aria-label')};
        });
        if(!q.fixed||q.count!==3||!q.standAlone||q.labels.some(x=>!x)||!q.separateLabel||
           q.heights.some(x=>x<44)||q.separateHeight<44)
          throw Error('Home Quick Action must be approved 3+1 fixed layout: '+JSON.stringify(q));
        // These three are real one-tap operations, never a duplicate second navigation.
        if(await page.locator('link[rel="stylesheet"]').count())
          throw Error('Home single-file HTML must not require an external stylesheet');
        await page.locator('[data-home-quick="add-shopping"]').click();
        if(!(await page.locator('#h-dialog').isVisible()) ||
           (await page.locator('#h-add-form').getAttribute('data-kind'))!=='shopping')
          throw Error('Home shopping Quick Action did not open add form');
        await page.locator('#h-cancel').click();
        await page.locator('[data-home-quick="add-stock"]').click();
        if(!(await page.locator('#h-dialog').isVisible()) ||
           (await page.locator('#h-add-form').getAttribute('data-kind'))!=='stock')
          throw Error('Home inventory Quick Action did not open add form');
        await page.locator('#h-cancel').click();
        await page.locator('[data-home-quick="manage"]').click();
        if(!(await page.locator('#h-more').evaluate(n=>n.open)))
          throw Error('Home household Quick Action did not open the management area');
        await page.locator('#h-more summary').click();

        if(await page.locator('.h-head h2').innerText()!=='Home')
          throw Error('Home title should appear exactly once below icon rail');
        if(await page.locator('.header h1').count())
          throw Error('Duplicate Home header is forbidden by Brand Guide v1.2');
      }
      if (item.path === 'candidates/home.html' && width === 390) {
        // Home reference is one visual source for personal + shared household;
        // verify no data crossing, and only known purchased qty enters stock.
        const scope=page.locator('[data-home-scope]');
        if(await scope.count()!==2)throw Error('Home household scope switch missing');
        if(!await page.getByText('Családi otthon',{exact:true}).isVisible())
          throw Error('Shared household identity missing');
        await page.locator('[data-check]').first().check();
        if (!(await page.locator('[data-check]').first().isChecked()))
          throw new Error('Home shared checkbox failed');
        // User must explicitly approve stock receipt; checking alone is never a stock transaction.
        await page.locator('[data-home-tab="stock"]').click();
        if((await page.locator('#h-panel').innerText()).includes('Tojás'))
          throw Error('Shopping checkbox silently altered household stock');
        await page.locator('[data-home-tab="shopping"]').click();
        if(!(await page.locator('#h-stock-confirm').isVisible()))
          throw Error('Explicit stock confirmation missing after shopping check');
        await page.locator('[data-home-receive="confirm"]').click();
        await page.locator('[data-home-tab="stock"]').click();
        if(!(await page.locator('#h-panel').innerText()).includes('Tojás'))
          throw Error('Explicitly confirmed shopping receipt missing from family stock');
        await page.locator('[data-home-tab="shopping"]').click();
        await page.locator('#h-completed summary').click();
        await page.locator('#h-completed [data-check][data-id="f1"]').click(); // render replaces checkbox; click, not uncheck(), avoids stale detached locator
        await page.locator('[data-home-tab="stock"]').click();
        if(!(await page.locator('#h-panel').innerText()).includes('Tojás'))
          throw Error('Unchecking shopping mistakenly erased separately confirmed stock');
        await page.locator('[data-home-tab="shopping"]').click();
        await scope.filter({hasText:'Saját'}).click();
        if((await page.locator('#h-context').innerText()).includes('Családi otthon'))
          throw Error('Shared household leaked into private scope');
        await page.locator('[data-home-tab="suggestions"]').click();
        if(!(await page.locator('#h-panel').innerText()).includes('BECSLÉS'))
          throw Error('Forecasts not clearly marked uncertain');
        await page.locator('[data-home-dismiss="s1"]').click();
        if((await page.locator('[data-home-dismiss="s1"]').count())!==0)
          throw Error('Red-X ignored');
        await page.locator('#h-archive summary').click();
        await page.locator('[data-home-restore="s1"]').click();
        await page.locator('[data-home-pick="s1"]').check();
        await page.locator('#h-move').click();
        if(!(await page.locator('#h-panel').innerText()).includes('Élesztő'))
          throw Error('Manual suggestion transfer did not reach own shopping list');
        await page.locator('#h-select-list').selectOption('nagy');
        if(!(await page.locator('#h-panel').innerText()).includes('Olívaolaj'))
          throw Error('Named shopping list switch failed');
        await page.locator('[data-home-scope="family"]').click();
        if(await page.locator('[data-home-tab="suggestions"]').isVisible())
          throw Error('Family scope must not present private forecasts');
        await page.locator('#h-more summary').click();
        if(!(await page.locator('#h-tools-content').innerText()).includes('Meghívás / tagok kezelése'))
          throw Error('Household management needs reachable, collapsed secondary UI');
        await page.locator('[data-settings]').click();
        if(!(await page.locator('#h-more').evaluate(el=>el.open)))
          throw Error('Home settings did not open household management');
      }
      if (item.path === 'candidates/ebook.html') {
        const dock = page.locator('.quick');
        const dockInfo = await dock.evaluate(el => {
          const box=el.getBoundingClientRect();
          const buttons=[...el.querySelectorAll('button')];
          return {position:getComputedStyle(el).position,
                  bottom:Math.round(box.bottom),
                  viewport:innerHeight,
                  count:buttons.length,
                  visible:buttons.every(b=>b.getBoundingClientRect().height>=44),
                  labels:buttons.map(b=>b.getAttribute('aria-label'))};
        });
        if (dockInfo.position!=='fixed'||dockInfo.count!==4||!dockInfo.visible||
            dockInfo.bottom>dockInfo.viewport+3||dockInfo.labels.some(x=>!x)) {
          throw new Error('E-book Quick Action contract failed at '+width+'px: '+JSON.stringify(dockInfo));
        }
      }
      if (item.path === 'candidates/ebook.html' && width === 390) {
        if (!(await page.locator('#featured-name').innerText()).includes('A természet csodái')) throw Error('E-book featured book absent');
        await page.locator('[data-quick="transfer"]').click();
        if (!(await page.locator('[data-panel="transfer"]').isVisible())) throw Error('E-book quick transfer failed');
        await page.locator('[data-quick="pair"]').click();
        if (!(await page.locator('#dialog-backdrop').isVisible())) throw Error('E-book pairing preview failed');
        await page.locator('#dialog-close').click();
        await page.locator('[data-quick="continue"]').click();
        if (!(await page.locator('[data-panel="reader"]').isVisible())) throw Error('E-book Quick Action continuation failed');
        await page.locator('[data-command="fontplus"]').click();
        if (!(await page.locator('#reading-content').evaluate(e => parseInt(getComputedStyle(e).fontSize, 10) > 17))) throw Error('E-book font control failed');
        await page.locator('[data-quick="add"]').click();
        if (!(await page.locator('#dialog-backdrop').isVisible())) throw Error('E-book quick add preview failed');
        await page.locator('#dialog-close').click();
        await page.locator('[data-view="library"]').click();
        await page.locator('#search').fill('Kert');
        if (!(await page.locator('#book-count').innerText()).includes('1 könyv')) throw Error('E-book library filter failed');
        await page.locator('#search').fill('');
      }
      if (item.path === 'candidates/qr.html' && width === 390) {
        await page.locator('[data-qr-tab="colors"]').click();
        if (!(await page.locator('[data-qr-panel="colors"]').isVisible())) throw new Error('QR colors tab failed');
      }
      if (item.path === 'candidates/finance.html' && width === 390) {
        if (!(await page.locator('#balance-amount').innerText()).includes('Ft')) throw new Error('Finance overview metrics absent');
        await page.locator('[data-tab="ledger"]').click();
        await page.locator('#quick-expense').click();
        await page.locator('#transaction-form input[name="amount"]').fill('5500');
        await page.locator('#transaction-form input[name="date"]').fill('2026-10-23');
        await page.locator('#transaction-form input[name="category"]').fill('Teszt');
        await page.locator('#transaction-form button[type="submit"]').click();
        if (!(await page.locator('#ledger-list').innerText()).includes('Teszt')) throw new Error('Finance transaction demo form failed');
        await page.locator('[data-tab="savings"]').click();
        if (!(await page.locator('#panel-savings').isVisible())) throw new Error('Finance savings view failed');
        await page.locator('[data-tab="forecast"]').click();
        if (!(await page.locator('#panel-forecast').isVisible())) throw new Error('Finance forecast view failed');
        await page.locator('[data-tab="import"]').click();
        if (!(await page.locator('#panel-import').isVisible())) throw new Error('Finance import view failed');
        await page.locator('[data-tab="overview"]').click();
        await page.evaluate(() => document.body.classList.add('show-demo-tools'));
        await page.locator('#demo-data').uncheck();
        if (!(await page.locator('#income-value').innerText()).includes('0')) throw new Error('Finance empty state failed');
      }
      await page.screenshot({ path: resolve(output, item.name + '-' + width + '.png'), fullPage: true, animations: 'disabled' });
      console.log('Reference OK:', item.name, width, 'px');
      await context.close();
    }
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
