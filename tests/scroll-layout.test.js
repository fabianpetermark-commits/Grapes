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

test('mobile editor toolbars scroll horizontally without consuming the canvas height', async () => {
  const [toolbar, email, studio] = await Promise.all([
    read('src/styles/components/toolbar.css'), read('src/styles/screens/email-studio.css'),
    read('src/styles/screens/studio.css'),
  ])
  assert.match(toolbar, /@media \(width <= 768px\)[\s\S]*\.toolbar\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto/)
  assert.match(email, /@media \(max-width: 1200px\)[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto/)
  assert.doesNotMatch(studio, /\.studio__inspector\s*\{\s*max-height:\s*4[48]vh/)
})

test('every module can be opened directly for responsive smoke tests', async () => {
  const main = await read('src/main.js')
  for (const module of ['brochure', 'studio', 'qr', 'ebook', 'email', 'finance']) {
    assert.ok(main.includes(`'${module}'`), `${module} direct route is missing`)
  }
  assert.match(main, /showScreen\(requestedModule\)/)
})

test('email mobile panes have a default and working navigation handlers', async () => {
  const [html, editor] = await Promise.all([read('index.html'), read('src/email-studio/editor.js')])
  assert.match(html, /id="email-app"[^>]*data-mobile-pane="content"/)
  for (const pane of ['content', 'preview', 'settings']) {
    assert.match(editor, new RegExp(`setMobilePane\\('${pane}'\\)`))
  }
})
