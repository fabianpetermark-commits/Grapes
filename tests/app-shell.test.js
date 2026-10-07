import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the app shell groups every module and starts with Google sign-in', async () => {
  const [html, favicon, logo] = await Promise.all([read('index.html'), read('public/favicon.svg'), read('public/grapes-logo.svg')])
  assert.match(html, /id="login-screen"/)
  assert.match(html, /id="google-sign-in"/)
  assert.match(html, /src="\.\/grapes-logo\.svg"/)
  assert.ok((html.match(/src="\.\/grapes-logo\.svg"/g) || []).length >= 8)
  assert.equal((favicon.match(/<circle /g) || []).length, 18)
  assert.equal((logo.match(/<circle /g) || []).length, 18)
  for (const color of ['#4285f4', '#34a853', '#fbbc05', '#ea4335']) assert.match(html, new RegExp(color))
  for (const category of ['marketing', 'printing', 'reading', 'finance']) {
    assert.match(html, new RegExp(`data-i18n="category\\.${category}"`))
  }
  for (const module of ['email', 'brochure', 'qr', 'studio', 'ebook', 'finance']) {
    assert.match(html, new RegExp(`data-i18n="module\\.${module}"`))
  }
})

test('HU and EN translations cover every shell translation key', async () => {
  const [html, source] = await Promise.all([read('index.html'), read('src/i18n.js')])
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1])
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.equal((source.match(new RegExp(`'${escaped}'\\s*:`, 'g')) || []).length, 2, `${key} must exist in HU and EN`)
  }
})

test('sign-out returns to the login screen without deleting local project data', async () => {
  const [main, drive] = await Promise.all([read('src/main.js'), read('src/storage/grapes-drive.js')])
  assert.match(main, /await disconnectGrapesDrive\(\{ forgetAccount: true \}\)/)
  assert.match(main, /showLogin\(\)/)
  assert.doesNotMatch(drive, /localStorage\.clear\(/)
})

test('the workspace menu uses one vertical category list with menu-like module rows', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/styles/screens/splash.css')])
  assert.match(html, /class="dashboard__menu"/)
  assert.equal((html.match(/<section class="module-group"/g) || []).length, 4)
  assert.doesNotMatch(html, /class="dashboard__groups"/)
  assert.match(css, /\.dashboard__menu\s*\{[^}]*column-count:\s*2/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.dashboard__menu\s*\{\s*column-count:\s*1/)
  assert.match(css, /\.module-group\s*\{[^}]*break-inside:\s*avoid/)
  assert.match(css, /\.card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/)
})

test('the e-book manager exposes the USB reader synchronization controls', async () => {
  const [html, source, sync] = await Promise.all([read('index.html'), read('src/ebook-library.js'), read('src/ebook-reader-sync.js')])
  assert.match(html, /id="ebook-reader-connect"/)
  assert.match(html, /id="ebook-sync"/)
  assert.match(html, /id="ebook-sync-success"/)
  assert.doesNotMatch(html, /id="ebook-sync-list"/)
  assert.match(html, /USB-s e-reader szinkron/)
  assert.match(source, /ebook-reader-sync\.js/)
  assert.match(html, /id="ebook-reader-pair-value"/)
  assert.doesNotMatch(html, /id="ebook-drive-full-read"/)
  const controls = ['ebook-upload-btn', 'ebook-reader-pair-btn', 'ebook-reader-pair-value', 'ebook-reader-connect', 'ebook-reader-state']
  const positions = controls.map(id => html.indexOf(`id="${id}"`))
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])))
  assert.match(sync, /readerVerification/)
  assert.match(sync, /grapesPrev/)
  assert.match(sync, /removeReaderBook/)
  assert.match(sync, /setInterval[^\n]*verifyReaderAccess\(\{ announce: false \}\)/)
  assert.match(html, /id="ebook-metadata-filter"/)
  assert.doesNotMatch(html, /id="ebook-metadata-book"[^>]*\bsize=/)
  assert.match(html, /id="ebook-metadata-preview"/)
  assert.match(source, /grapes:before-screen-change/)
  assert.match(html, /id="ebook-list-title">Könyvtár<\/h2><button id="ebook-open-organizer" class="btn btn--primary btn--sm"[^>]*>Szerkesztés<\/button>/)
  assert.match(html, /id="ebook-editor-structure-tab"[\s\S]*?>Szerkezeti hibák<\/button>[\s\S]*?id="ebook-open-library" class="btn btn--primary"[^>]*>Könyvtár<\/button>/)
  assert.match(source, /#ebook-open-organizer[^\n]*navigateToEbookOrganizer/)
  assert.match(source, /#ebook-open-library[^\n]*navigateToEbookLibrary/)
})
