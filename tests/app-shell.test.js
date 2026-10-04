import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the app shell groups every module and starts with Google sign-in', async () => {
  const [html, favicon] = await Promise.all([read('index.html'), read('public/favicon.svg')])
  assert.match(html, /id="login-screen"/)
  assert.match(html, /id="google-sign-in"/)
  assert.match(html, /id="i-grapes-logo"[\s\S]*<circle cx="48" cy="86"/)
  assert.equal((html.match(/href="#i-grapes-logo"/g) || []).length, 3)
  assert.equal((favicon.match(/<circle /g) || []).length, 9)
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
  assert.match(main, /await disconnectGrapesDrive\(\)/)
  assert.match(main, /showLogin\(\)/)
  assert.doesNotMatch(drive, /localStorage\.clear\(/)
})

test('the workspace menu uses one vertical category list with menu-like module rows', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/styles/screens/splash.css')])
  assert.match(html, /class="dashboard__menu"/)
  assert.equal((html.match(/<section class="module-group"/g) || []).length, 4)
  assert.doesNotMatch(html, /class="dashboard__groups"/)
  assert.match(css, /\.dashboard__menu\s*\{[^}]*display:\s*grid/)
  assert.match(css, /\.card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/)
})
