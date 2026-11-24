// Host-neutral E-book configuration schema and validation.
// Each host must install globalThis.__EBOOK_CONFIG__ before importing E-book
// feature modules. Host-specific defaults belong in host adapters/bootstrap.
const NEUTRAL_DEFAULTS = Object.freeze({
  clientId: '',
  pickerApiKey: '',
  pickerAppId: '',
  booksApiKey: '',
  transferBrokerUrl: '',
  epubWriteEnabled: false,
  folderName: '',
  appReturnUrl: '',
  readerPageUrl: '',
  readerSharingKey: '',
  libraryCacheKey: '',
  legacyLibraryCacheKey: '',
  readerSyncDbName: '',
  readerDirectoryPickerId: '',
  storageNamespace: '',
  viewStorageKey: '',
})

function normalizedHttpUrl(value, name) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw new TypeError(`Az E-book ${name} érvényes HTTP(S) URL kell legyen.`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`Az E-book ${name} csak HTTP(S) URL lehet.`)
  }
  return url.toString()
}

export function createEbookConfig(overrides = {}, defaults = NEUTRAL_DEFAULTS) {
  const config = { ...defaults, ...overrides }
  if (!config.pickerAppId && config.clientId) config.pickerAppId = config.clientId.split('-')[0]
  config.appReturnUrl = normalizedHttpUrl(config.appReturnUrl, 'visszatérési cím')
  config.readerPageUrl = normalizedHttpUrl(
    config.readerPageUrl || new URL('ebook-reader.html', config.appReturnUrl).toString(),
    'olvasóoldal',
  )
  config.transferBrokerUrl = config.transferBrokerUrl ? normalizedHttpUrl(config.transferBrokerUrl, 'broker cím') : ''
  for (const key of ['clientId', 'pickerApiKey', 'pickerAppId', 'booksApiKey', 'folderName', 'readerSharingKey', 'libraryCacheKey', 'legacyLibraryCacheKey', 'readerSyncDbName', 'readerDirectoryPickerId', 'storageNamespace', 'viewStorageKey']) {
    if (typeof config[key] !== 'string') throw new TypeError(`Érvénytelen E-book konfiguráció: ${key}`)
  }
  if (typeof config.epubWriteEnabled !== 'boolean') throw new TypeError('Az epubWriteEnabled csak logikai érték lehet.')
  if (!config.folderName.trim()) throw new TypeError('Az E-book Drive-mappanév nem lehet üres.')
  for (const key of ['readerSharingKey', 'libraryCacheKey', 'legacyLibraryCacheKey', 'readerSyncDbName', 'readerDirectoryPickerId', 'storageNamespace', 'viewStorageKey']) {
    if (!config[key].trim()) throw new TypeError(`Hiányzó E-book host konfiguráció: ${key}`)
  }
  return Object.freeze(config)
}

const hostConfig = globalThis.__EBOOK_CONFIG__
if (!hostConfig || typeof hostConfig !== 'object' || Array.isArray(hostConfig)) {
  throw new Error('Az E-book host konfiguráció nincs telepítve. A host bootstrapnek a feature modulok előtt kell betöltődnie.')
}

export const EBOOK_CONFIG = createEbookConfig(hostConfig)
