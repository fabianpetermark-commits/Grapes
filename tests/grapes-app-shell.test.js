import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared Grapes app shell implements the approved brand header', async () => {
  const [source, css, logo] = await Promise.all([
    read('src/ui/grapes-app-shell.js'),
    read('src/ui/grapes-app-shell.css'),
    read('public/grapes-logo.svg'),
  ])
  assert.match(source, /Grapes/)
  assert.match(source, /appName/)
  assert.match(source, /Bejelentkezés/)
  assert.match(source, /grapes-logo\.svg/)
  assert.match(source, /logoUrl = '\.\/grapes-logo\.svg'/)
  assert.match(css, /\.grapes-brand__wordmark/)
  assert.match(css, /\.grapes-brand__app-name/)
  assert.match(css, /\.grapes-app-shell\s*\{[\s\S]*--grapes-page:\s*#F7F5EE/)
  assert.doesNotMatch(css, /^:root\s*\{/m)
  assert.match(logo, /<svg/)
})

test('shared navigation has four top-level items and preserves parent selection on nested routes', async () => {
  const source = await read('src/ui/grapes-app-shell.js')
  assert.match(source, /requires exactly four main navigation items/)
  assert.match(source, /route\.mainRoute/)
  assert.match(source, /history\.pushState/)
  assert.match(source, /addEventListener\('popstate'/)
  assert.match(source, /onNavigate\(route\)/)
  assert.match(source, /item\.icon \|\| item\.glyph/)
  assert.match(source, /manageHistory = true/)
  assert.match(source, /if \(manageHistory\) window\.history\.pushState/)
  assert.match(source, /if \(manageHistory\) window\.addEventListener\('popstate'/)
  assert.doesNotMatch(source, /back-arrow|back-button|Vissza/)
})

test('shared shell exposes login, route and lifecycle integration points', async () => {
  const source = await read('src/ui/grapes-app-shell.js')
  assert.match(source, /onLogin/)
  assert.match(source, /navigate,/)
  assert.match(source, /getRoute:/)
  assert.match(source, /setLoginState/)
  assert.match(source, /destroy\(\)/)
})
