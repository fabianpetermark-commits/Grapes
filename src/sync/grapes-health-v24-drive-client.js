import {
  getConnectedGrapesAccount, grapesDriveRequest, GRAPES_ROOT_FOLDER
} from '../storage/grapes-drive.js'
import { discoverV24DriveFoodFiles } from './grapes-health-v24-drive-discovery.js'

// Called only by an explicit, TEST-gated migration inspection action.
// Never initiates Google authorization or asks for broader Drive scopes.
export function discoverConnectedTestDriveFoodFiles() {
  if (import.meta.env.VITE_GRAPES_TEST_CHANNEL !== '1' ||
      GRAPES_ROOT_FOLDER !== 'Grapes TEST') {
    throw new Error('Health Drive discovery is restricted to Grapes TEST')
  }
  return discoverV24DriveFoodFiles({
    request: grapesDriveRequest,
    getIdentity: getConnectedGrapesAccount
  })
}
