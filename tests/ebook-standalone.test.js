import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [html, entry, standaloneConfig] = await Promise.all([
  readFile(new URL('../ebook.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/ebook-standalone.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ebook/standalone-config.js', import.meta.url), 'utf8'),
])

test('standalone E-book entry includes the feature DOM contract and no Grapes boot script', () => {
  for (const id of [
    'ebook-app', 'ebook-manager-view', 'ebook-drive-connect', 'ebook-list',
    'ebook-metadata-panel', 'ebook-editor-text-pane', 'ebook-editor-structure-pane',
    'ebook-sync', 'ebook-transfer-panel',
  ]) assert.match(html, new RegExp(`id=["']${id}["']`))
  assert.match(html, /src="\.\/src\/ebook-standalone\.js"/)
  assert.doesNotMatch(html, /src="\.\/src\/main\.js"/)
})

test('standalone boot installs its own platform before initializing the feature', () => {
  assert.ok(entry.indexOf('configureEbookPlatform') < entry.indexOf('initEbookLibrary'))
  assert.match(entry, /standalone-platform\.js/)
  assert.doesNotMatch(entry, /screens\.js|grapes-platform\.js/)
  assert.match(standaloneConfig, /ebook-standalone-v1/)
  assert.match(standaloneConfig, /Standalone E-book Library/)
  assert.match(standaloneConfig, /VITE_EBOOK_STANDALONE_TRANSFER_BROKER_URL/)
  assert.doesNotMatch(standaloneConfig, /AKfycbxW8J8QUlHOYl7zI9mvfW9ec-Zal4ihDqUWBD-gxASnhxLK9YAU6sPZcteW8kjemOGb/)
})


test('standalone E-Library mounts the shared four-route shell without duplicating feature logic', async () => {
  const [entrySource, shellSource, featureSource] = await Promise.all([
    readFile(new URL('../src/ebook-standalone.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ebook/standalone-shell.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ebook-library.js', import.meta.url), 'utf8'),
  ])
  assert.match(entrySource, /mountEbookStandaloneShell/)
  assert.match(entrySource, /navigateToLibrary: navigateToEbookLibrary/)
  for (const route of ['library', 'share', 'reader', 'tools']) assert.match(shellSource, new RegExp(`id: '${route}'`))
  assert.match(shellSource, /manageHistory: false/)
  assert.match(shellSource, /#ebook-drive-connect.*click/)
  assert.match(shellSource, /onGrapesDriveChange/)
  assert.match(shellSource, /#ebook-transfer-panel/)
  assert.match(shellSource, /ebook-library--android/)
  assert.match(featureSource, /export async function navigateToEbookLibrary/)
})
