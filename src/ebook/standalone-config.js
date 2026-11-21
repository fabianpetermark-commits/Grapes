// Loaded before the reusable E-book modules. The standalone build has its
// own browser storage namespace and Drive folder; OAuth/broker values come
// from build-time environment variables and are never hard-coded here.
const env = import.meta.env || {}
const appBase = new URL('./', window.location.href).toString()

globalThis.__EBOOK_CONFIG__ = {
  clientId: env.VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '',
  pickerApiKey: env.VITE_EBOOK_STANDALONE_PICKER_API_KEY || env.VITE_GOOGLE_PICKER_API_KEY || '',
  pickerAppId: env.VITE_EBOOK_STANDALONE_GOOGLE_APP_ID || env.VITE_GOOGLE_APP_ID || (env.VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '').split('-')[0],
  booksApiKey: env.VITE_EBOOK_STANDALONE_BOOKS_API_KEY || env.VITE_GOOGLE_BOOKS_API_KEY || '',
  transferBrokerUrl: env.VITE_EBOOK_STANDALONE_TRANSFER_BROKER_URL || '',
  epubWriteEnabled: env.VITE_EBOOK_STANDALONE_EPUB_WRITE_ENABLED === 'true',
  folderName: env.VITE_EBOOK_STANDALONE_DRIVE_FOLDER || 'Standalone E-book Library',
  appReturnUrl: env.VITE_EBOOK_STANDALONE_RETURN_URL || appBase,
  readerPageUrl: env.VITE_EBOOK_STANDALONE_READER_URL || '',
  readerSharingKey: 'ebook-standalone-reader-enabled-v1',
  libraryCacheKey: 'ebook-standalone-library-cache-v1:',
  legacyLibraryCacheKey: 'ebook-standalone-library-cache-v0',
  readerSyncDbName: 'ebook-standalone-reader-sync-v1',
  readerDirectoryPickerId: 'ebook-standalone-reader-v1',
  storageNamespace: 'ebook-standalone-v1',
  viewStorageKey: 'ebook-standalone-view-v1',
}
