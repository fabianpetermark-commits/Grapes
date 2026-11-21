// Deployment-specific settings for the E-book feature.
// A standalone shell may set window.__EBOOK_CONFIG__ before importing the
// feature entry point. Vite variables remain the build-time fallback.
const buildEnv = import.meta.env || {}

const GRAPES_DEFAULTS = Object.freeze({
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
})

function normalizedHttpUrl(value, name) {
  const url = new URL(String(value))
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`Az E-book ${name} csak HTTP(S) URL lehet.`)
  }
  return url.toString()
}

export function createEbookConfig(overrides = {}, defaults = GRAPES_DEFAULTS) {
  const config = { ...defaults, ...overrides }
  config.appReturnUrl = normalizedHttpUrl(config.appReturnUrl, 'visszatérési cím')
  config.readerPageUrl = normalizedHttpUrl(
    config.readerPageUrl || new URL('ebook-reader.html', config.appReturnUrl).toString(),
    'olvasóoldal',
  )
  config.transferBrokerUrl = config.transferBrokerUrl ? normalizedHttpUrl(config.transferBrokerUrl, 'broker cím') : ''
  for (const key of ['clientId', 'pickerApiKey', 'pickerAppId', 'booksApiKey', 'folderName', 'readerSharingKey', 'libraryCacheKey', 'legacyLibraryCacheKey', 'readerSyncDbName', 'readerDirectoryPickerId']) {
    if (typeof config[key] !== 'string') throw new TypeError(`Érvénytelen E-book konfiguráció: ${key}`)
  }
  if (typeof config.epubWriteEnabled !== 'boolean') throw new TypeError('Az epubWriteEnabled csak logikai érték lehet.')
  if (!config.folderName.trim()) throw new TypeError('Az E-book Drive-mappanév nem lehet üres.')
  return Object.freeze(config)
}

const hostOverrides = typeof globalThis.__EBOOK_CONFIG__ === 'object' && globalThis.__EBOOK_CONFIG__
  ? globalThis.__EBOOK_CONFIG__
  : {}

export const EBOOK_CONFIG = createEbookConfig(hostOverrides)
