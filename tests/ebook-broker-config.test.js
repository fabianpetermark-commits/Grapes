import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../apps-script/ebook-transfer/Code.gs', import.meta.url), 'utf8')

test('broker retains exact Grapes defaults when standalone properties are absent', () => {
  assert.match(source, /DEFAULT_EBOOK_FOLDER_NAME = 'Grapes E-book Library'/)
  assert.match(source, /DEFAULT_EBOOK_RETURN_URL = 'https:\/\/fabianpetermark-commits\.github\.io\/Grapes\/'/)
  assert.match(source, /DEFAULT_EBOOK_READER_URL = 'https:\/\/fabianpetermark-commits\.github\.io\/Grapes\/ebook-reader\.html'/)
  assert.match(source, /ebookBrokerSetting\('EBOOK_ALLOWED_RETURN_URL', DEFAULT_EBOOK_RETURN_URL\)/)
})

test('standalone broker uses isolated Script Properties and blocks unrelated endpoints', () => {
  for (const key of ['EBOOK_FOLDER_NAME','EBOOK_ALLOWED_RETURN_URL','EBOOK_ALLOWED_PARENT_ORIGIN','EBOOK_READER_RETURN_URL','EBOOK_STANDALONE_MODE']) {
    assert.ok(source.includes(key), `Missing broker setting ${key}`)
  }
  assert.match(source, /isStandaloneEbookBroker\(\) && !\['health', 'create', 'download', 'create-reader-pairing', 'pair-reader', 'reader', 'revoke-reader'\]\.includes\(action\)/)
  assert.match(source, /isStandaloneEbookBroker\(\) && p\.action !== 'create-reader-pairing'/)
})

test('standalone reader has a unique token key and configurable broker target', async () => {
  const reader = await readFile(new URL('../src/ebook-reader-standalone.js', import.meta.url), 'utf8')
  assert.match(reader, /ebook-standalone-reader-token-v1/)
  assert.match(reader, /EBOOK_CONFIG\.transferBrokerUrl/)
  assert.doesNotMatch(reader, /grapes-ebook-reader-token|AKfycb/)
})

test('standalone build does not inherit Grapes OAuth configuration and builds at its own root', async () => {
  const [config, vite] = await Promise.all([
    readFile(new URL('../src/ebook/standalone-config.js', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(config, /env\.VITE_GOOGLE_CLIENT_ID|env\.VITE_GOOGLE_PICKER_API_KEY|env\.VITE_GOOGLE_APP_ID|env\.VITE_GOOGLE_BOOKS_API_KEY/)
  assert.match(config, /VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID/)
  assert.match(vite, /standaloneBuild \? \(process\.env\.VITE_EBOOK_STANDALONE_BASE \|\| '\/'\)/)
  assert.match(vite, /standaloneBuild\s*\?\s*\{/)
})
