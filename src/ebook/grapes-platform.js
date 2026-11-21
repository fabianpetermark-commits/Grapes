// Grapes host adapter for the reusable E-book feature.
import {
  connectGrapesDrive,
  disconnectGrapesDrive,
  getConnectedGrapesAccount,
  getGrapesDriveAccessToken,
  grapesDriveHasFullReadAccess,
  grapesDriveRequest,
  isGrapesDriveConnected,
  onGrapesDriveChange,
} from '../storage/grapes-drive.js'
import { showGrapesConfirm } from '../ui/modal.js'
import { configureEbookPlatform } from './platform.js'

let configured = false

export function configureGrapesEbookPlatform() {
  if (configured) return
  configureEbookPlatform({
    connectDrive: connectGrapesDrive,
    disconnectDrive: disconnectGrapesDrive,
    getConnectedAccount: getConnectedGrapesAccount,
    getAccessToken: getGrapesDriveAccessToken,
    hasFullReadAccess: grapesDriveHasFullReadAccess,
    driveRequest: grapesDriveRequest,
    isDriveConnected: isGrapesDriveConnected,
    onDriveChange: onGrapesDriveChange,
    confirm: showGrapesConfirm,
    navigate: async (target) => {
      const { showScreen } = await import('../screens.js')
      return showScreen(target)
    },
  })
  configured = true
}
