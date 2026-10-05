import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('page-like modules own a vertical scroll root while the document stays fixed', async () => {
  const [reset, splash, ebook, finance, qr] = await Promise.all([
    read('src/styles/reset.css'), read('src/styles/screens/splash.css'),
    read('src/styles/screens/ebook-library.css'), read('src/styles/screens/finance-tracker.css'),
    read('src/styles/screens/qr-studio.css'),
  ])
  assert.match(reset, /body\s*\{[\s\S]*overflow:\s*hidden/)
  assert.match(splash, /\.splash\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.match(ebook, /#ebook-hub-view,[\s\S]*#ebook-manager-view\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.match(finance, /\.finance\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow-y:\s*auto/)
  assert.match(qr, /\.qr-studio__body\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.doesNotMatch(qr, /body:has\(#qr-app/)
})

test('mobile editor toolbars keep primary actions visible without horizontal scrolling', async () => {
  const [toolbar, email, studio] = await Promise.all([
    read('src/styles/components/toolbar.css'), read('src/styles/screens/email-studio.css'),
    read('src/styles/screens/studio.css'),
  ])
  assert.match(toolbar, /@media \(width <= 768px\)[\s\S]*\.toolbar\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow:\s*visible/)
  assert.match(toolbar, /\[data-mobile-secondary\]/)
  assert.match(email, /@media \(max-width: 1200px\)[\s\S]*flex-wrap:\s*wrap;[\s\S]*overflow:\s*visible/)
  assert.doesNotMatch(studio, /\.studio__inspector\s*\{\s*max-height:\s*4[48]vh/)
})

test('every direct module route is preserved behind the authentication gate', async () => {
  const main = await read('src/main.js')
  for (const module of ['brochure', 'studio', 'qr', 'ebook', 'email', 'finance']) {
    assert.ok(main.includes(`'${module}'`), `${module} direct route is missing`)
  }
  assert.match(main, /requestedScreen = moduleScreens\.includes\(requestedModule\)/)
  assert.match(main, /showScreen\(requestedScreen \|\| 'splash'\)/)
  assert.match(main, /isGrapesDriveConnected\(\)\) showAuthenticatedStart\(\)/)
  assert.match(main, /hasEbookPair\) showScreen\('ebook'\)/)
})

test('email mobile panes have a default and working navigation handlers', async () => {
  const [html, editor] = await Promise.all([read('index.html'), read('src/email-studio/editor.js')])
  assert.match(html, /id="email-app"[^>]*data-mobile-pane="content"/)
  for (const pane of ['content', 'preview', 'settings']) {
    assert.match(editor, new RegExp(`setMobilePane\\('${pane}'\\)`))
  }
})

test('creative tools expose compact mobile actions without losing controls', async () => {
  const [html, email, studio, studioCss, qr] = await Promise.all([
    read('index.html'), read('src/email-studio/editor.js'), read('src/studio.js'),
    read('src/styles/screens/studio.css'), read('src/styles/screens/qr-studio.css'),
  ])
  assert.match(email, /createResponsiveOverflow/)
  assert.match(html, /data-email-overflow/)
  assert.match(html, /id="studio-mobile-inspector-btn"/)
  assert.match(html, /id="studio-inspector"/)
  assert.match(studio, /setInspectorOpen/)
  assert.match(studioCss, /\.studio__mobile-inspector\s*\{\s*display:\s*inline-flex/)
  assert.match(qr, /@media \(max-width: 640px\)[\s\S]*position:\s*sticky/)
})
