// E-book platform boundary. The feature code depends on this contract rather
// than importing the Grapes singleton directly. Each application shell installs
// its adapter before importing/initializing the E-book feature.
let activePlatform = null

const REQUIRED_METHODS = [
  'connectDrive',
  'disconnectDrive',
  'getConnectedAccount',
  'getAccessToken',
  'hasFullReadAccess',
  'driveRequest',
  'isDriveConnected',
  'onDriveChange',
  'confirm',
  'navigate',
]

export function configureEbookPlatform(adapter) {
  if (adapter === null) {
    activePlatform = null
    return
  }
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('Az E-book platformadapter objektum kell legyen.')
  }
  const missing = REQUIRED_METHODS.filter((method) => typeof adapter[method] !== 'function')
  if (missing.length) {
    throw new TypeError(`Hiányzó E-book platformműveletek: ${missing.join(', ')}`)
  }
  activePlatform = Object.freeze({ ...adapter })
}

export function getEbookPlatform() {
  if (!activePlatform) {
    throw new Error('Az E-book platform még nincs konfigurálva. A belépési pontnak előbb adaptert kell telepítenie.')
  }
  return activePlatform
}

export const connectGrapesDrive = (options) => getEbookPlatform().connectDrive(options)
export const disconnectGrapesDrive = (options) => getEbookPlatform().disconnectDrive(options)
export const getConnectedGrapesAccount = (...args) => getEbookPlatform().getConnectedAccount(...args)
export const getGrapesDriveAccessToken = (...args) => getEbookPlatform().getAccessToken(...args)
export const grapesDriveHasFullReadAccess = (...args) => getEbookPlatform().hasFullReadAccess(...args)
export const grapesDriveRequest = (...args) => getEbookPlatform().driveRequest(...args)
export const isGrapesDriveConnected = (...args) => getEbookPlatform().isDriveConnected(...args)
export const onGrapesDriveChange = (...args) => getEbookPlatform().onDriveChange(...args)
export const showGrapesConfirm = (options) => getEbookPlatform().confirm(options)
export const navigateEbookScreen = (target) => getEbookPlatform().navigate(target)
export const isEbookNativePlatform = () => Boolean(getEbookPlatform().isNative?.())
