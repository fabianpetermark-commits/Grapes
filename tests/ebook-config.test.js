import test from 'node:test'
import assert from 'node:assert/strict'
import { createEbookConfig } from '../src/ebook/config.js'

test('Grapes-compatible defaults preserve the existing deployment identifiers', () => {
  const config = createEbookConfig({}, {
    clientId: '',
    pickerApiKey: '',
    pickerAppId: '',
    booksApiKey: '',
    transferBrokerUrl: '',
    epubWriteEnabled: false,
    folderName: 'Grapes E-book Library',
    appReturnUrl: 'https://fabianpetermark-commits.github.io/Grapes/',
    readerSharingKey: 'grapes-reader-library-enabled',
    libraryCacheKey: 'grapes-ebook-library-cache-v2:',
    legacyLibraryCacheKey: 'grapes-ebook-library-cache-v1',
    readerSyncDbName: 'grapes-ebook-reader-sync',
    readerDirectoryPickerId: 'grapes-ebook-reader',
  })
  assert.equal(config.folderName, 'Grapes E-book Library')
  assert.equal(config.appReturnUrl, 'https://fabianpetermark-commits.github.io/Grapes/')
  assert.equal(config.readerPageUrl, 'https://fabianpetermark-commits.github.io/Grapes/ebook-reader.html')
  assert.equal(config.readerSharingKey, 'grapes-reader-library-enabled')
  assert.equal(config.libraryCacheKey, 'grapes-ebook-library-cache-v2:')
  assert.equal(config.readerSyncDbName, 'grapes-ebook-reader-sync')
})

test('standalone deployment can override URLs, credentials, folder and storage namespace', () => {
  const config = createEbookConfig({
    clientId: 'standalone-client',
    pickerApiKey: 'standalone-picker-key',
    pickerAppId: '123456',
    transferBrokerUrl: 'https://broker.example.test/exec',
    appReturnUrl: 'https://reader.example.test/app/',
    folderName: 'Standalone E-books',
    readerSharingKey: 'standalone-reader-enabled',
    libraryCacheKey: 'standalone-library-v1:',
    readerSyncDbName: 'standalone-reader-sync',
  })
  assert.equal(config.clientId, 'standalone-client')
  assert.equal(config.pickerApiKey, 'standalone-picker-key')
  assert.equal(config.pickerAppId, '123456')
  assert.equal(config.transferBrokerUrl, 'https://broker.example.test/exec')
  assert.equal(config.readerPageUrl, 'https://reader.example.test/app/ebook-reader.html')
  assert.equal(config.folderName, 'Standalone E-books')
  assert.equal(config.libraryCacheKey, 'standalone-library-v1:')
  assert.equal(config.readerSyncDbName, 'standalone-reader-sync')
})

test('invalid protocols and empty folder names are rejected', () => {
  assert.throws(() => createEbookConfig({ appReturnUrl: 'javascript:alert(1)' }), /HTTP\(S\)/)
  assert.throws(() => createEbookConfig({ folderName: '   ' }), /nem lehet üres/)
})
