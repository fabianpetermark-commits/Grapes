import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/ebook-reader-sync.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replaceAll('export function', 'function')

function syncHelpers() {
  const context = vm.createContext({
    document: { querySelector() { return null }, querySelectorAll() { return [] } },
    window: {},
    indexedDB: {},
    Blob,
    crypto,
  })
  return vm.runInContext(`${source}\n({ nameFingerprint, shouldCopyToReader })`, context)
}

test('reader sync recopies a same-size book changed less than two seconds later', () => {
  const { shouldCopyToReader } = syncHelpers()
  const current = { name: 'book.epub', size: 1024, lastModified: Date.parse('2026-10-07T10:00:00.000Z') }
  const drive = { name: 'book.epub', size: '1024', modifiedTime: '2026-10-07T10:00:00.500Z' }
  assert.equal(shouldCopyToReader(drive, current), true)
})

test('reader sync skips an unchanged copy and safely refreshes unknown timestamps', () => {
  const { shouldCopyToReader } = syncHelpers()
  const drive = { name: 'book.epub', size: '1024', modifiedTime: '2026-10-07T10:00:00.000Z' }
  assert.equal(shouldCopyToReader(drive, { size: 1024, lastModified: Date.parse('2026-10-07T10:00:01.000Z') }), false)
  assert.equal(shouldCopyToReader({ ...drive, modifiedTime: '' }, { size: 1024, lastModified: 1 }), true)
  assert.equal(shouldCopyToReader(drive, null), true)
})

test('reader filename fingerprints ignore equivalent Unicode composition', () => {
  const { nameFingerprint } = syncHelpers()
  assert.equal(nameFingerprint('Zbigniew Pietrasiński.pdf'), nameFingerprint('Zbigniew Pietrasin\u0301ski.pdf'))
})
