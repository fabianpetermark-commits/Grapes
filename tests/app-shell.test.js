import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the app shell groups every module and starts with Google sign-in', async () => {
  const html = await read('index.html')
  assert.match(html, /id="login-screen"/)
  assert.match(html, /id="google-sign-in"/)
  assert.match(html, /class="login-card__logo"[\s\S]*#00e5ff/)
  assert.match(html, /class="dashboard__brand-mark"[\s\S]*#00e5ff/)
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
