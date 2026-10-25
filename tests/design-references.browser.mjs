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
          ? '.detailNav.icon-rail' : '.tabs';
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
      if (item.path === 'candidates/home.html' && width === 390) {
        await page.locator('[data-check]').first().check();
        if (!(await page.locator('[data-check]').first().isChecked())) throw new Error('Home checkbox failed');
      }
      if (item.path === 'candidates/ebook.html') {
        const dock = page.locator('.ebook-quick-action');
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
        if (!(await page.locator('.ebook-feature-info h2').innerText()).includes('A természet csodái')) throw Error('E-book featured book absent');
        await page.locator('[data-quick="transfer"]').click();
        if (!(await page.locator('[data-pane="transfer"]').isVisible())) throw Error('E-book quick transfer failed');
        await page.locator('[data-quick="pair"]').click();
        if (!(await page.locator('[data-status]').innerText()).includes('párosítás')) throw Error('E-book pairing preview failed');
        await page.locator('[data-quick="continue"]').click();
        if (!(await page.locator('[data-pane="reader"]').isVisible())) throw new Error('E-book Quick Action continuation failed');
        await page.locator('[data-font="1"]').click();
        if (!(await page.locator('[data-reading-content]').evaluate(e => parseInt(getComputedStyle(e).fontSize, 10) > 17))) throw new Error('E-book font control failed');
        await page.locator('[data-quick="add"]').click();
        if (!(await page.locator('[data-status]').innerText()).includes('Könyv hozzáadása')) throw Error('E-book quick import preview failed');
        await page.locator('[data-view="library"]').click();
        await page.locator('#ebook-find').fill('Kert');
        if (await page.locator('[data-book-title]:visible').count()!==1) throw Error('E-book library filter failed');
        await page.locator('#ebook-find').fill('');
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
