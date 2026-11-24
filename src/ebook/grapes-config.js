// Grapes deployment configuration. This module is imported only by the
// Grapes host adapter, never by standalone web or Android entry points.
const buildEnv = import.meta.env || {}

globalThis.__EBOOK_CONFIG__ = {
  clientId: buildEnv.VITE_GOOGLE_CLIENT_ID || '',
  pickerApiKey: buildEnv.VITE_GOOGLE_PICKER_API_KEY || '',
  pickerAppId: buildEnv.VITE_GOOGLE_APP_ID || (buildEnv.VITE_GOOGLE_CLIENT_ID || '').split('-')[0],
  booksApiKey: buildEnv.VITE_GOOGLE_BOOKS_API_KEY || '',
  transferBrokerUrl: buildEnv.VITE_EBOOK_TRANSFER_BROKER_URL || '',
  epubWriteEnabled: buildEnv.VITE_EBOOK_EPUB_WRITE_ENABLED === 'true',
  folderName: 'Grapes E-book Library',
  appReturnUrl: 'https://fabianpetermark-commits.github.io/Grapes/',
  readerSharingKey: 'grapes-reader-library-enabled',
  libraryCacheKey: 'grapes-ebook-library-cache-v2:',
  legacyLibraryCacheKey: 'grapes-ebook-library-cache-v1',
  readerSyncDbName: 'grapes-ebook-reader-sync',
  readerDirectoryPickerId: 'grapes-ebook-reader',
  storageNamespace: 'grapes',
  viewStorageKey: 'grapes-ebook-view',
}
