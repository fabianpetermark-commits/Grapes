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

// Host-neutral feature API. Feature modules must use these names; Grapes-specific
// names below remain as temporary compatibility aliases for external callers.
export const connectDrive = (...args) => getEbookPlatform().connectDrive(...args)
export const disconnectDrive = (...args) => getEbookPlatform().disconnectDrive(...args)
export const getConnectedAccount = (...args) => getEbookPlatform().getConnectedAccount(...args)
export const getAccessToken = (...args) => getEbookPlatform().getAccessToken(...args)
export const hasFullReadAccess = (...args) => getEbookPlatform().hasFullReadAccess(...args)
export const driveRequest = (...args) => getEbookPlatform().driveRequest(...args)
export const isDriveConnected = (...args) => getEbookPlatform().isDriveConnected(...args)
export const onDriveChange = (...args) => getEbookPlatform().onDriveChange(...args)
export const confirm = (...args) => getEbookPlatform().confirm(...args)
export const navigate = (...args) => getEbookPlatform().navigate(...args)

/** @deprecated Use the host-neutral exports above. */
export const connectGrapesDrive = (...args) => connectDrive(...args)
export const disconnectGrapesDrive = (...args) => disconnectDrive(...args)
export const getConnectedGrapesAccount = (...args) => getConnectedAccount(...args)
export const getGrapesDriveAccessToken = (...args) => getAccessToken(...args)
export const grapesDriveHasFullReadAccess = (...args) => hasFullReadAccess(...args)
export const grapesDriveRequest = (...args) => driveRequest(...args)
export const isGrapesDriveConnected = (...args) => isDriveConnected(...args)
export const onGrapesDriveChange = (...args) => onDriveChange(...args)
export const showGrapesConfirm = (...args) => confirm(...args)
export const navigateEbookScreen = (...args) => navigate(...args)
