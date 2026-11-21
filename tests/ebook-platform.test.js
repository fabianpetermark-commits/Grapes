import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  configureEbookPlatform,
  connectGrapesDrive,
  getConnectedGrapesAccount,
  getGrapesDriveAccessToken,
  grapesDriveHasFullReadAccess,
  grapesDriveRequest,
  isGrapesDriveConnected,
  onGrapesDriveChange,
  showGrapesConfirm,
  navigateEbookScreen,
} from '../src/ebook/platform.js'

const adapter = () => {
  const calls = []
  const value = {
    connectDrive: (...args) => { calls.push(['connectDrive', ...args]); return 'token' },
    disconnectDrive: (...args) => { calls.push(['disconnectDrive', ...args]); return 'disconnected' },
    getConnectedAccount: () => ({ email: 'reader@example.com' }),
    getAccessToken: () => 'token',
    hasFullReadAccess: () => true,
    driveRequest: (...args) => { calls.push(['driveRequest', ...args]); return Promise.resolve('response') },
    isDriveConnected: () => true,
    onDriveChange: (listener) => { calls.push(['onDriveChange', listener]); return () => {} },
    confirm: (options) => { calls.push(['confirm', options]); return Promise.resolve(true) },
    navigate: (target) => { calls.push(['navigate', target]); return Promise.resolve(target) },
  }
  return { value, calls }
}

test('platform boundary rejects missing adapter methods and unconfigured access', () => {
  configureEbookPlatform(null)
  assert.throws(() => getConnectedGrapesAccount(), /még nincs konfigurálva/)
  assert.throws(() => configureEbookPlatform({}), /Hiányzó E-book platformműveletek/)
})

test('platform boundary delegates the existing feature API to the installed host', async () => {
  const host = adapter()
  configureEbookPlatform(host.value)
  assert.equal(connectGrapesDrive({ fullRead: true }), 'token')
  assert.deepEqual(getConnectedGrapesAccount(), { email: 'reader@example.com' })
  assert.equal(getGrapesDriveAccessToken(), 'token')
  assert.equal(grapesDriveHasFullReadAccess(), true)
  assert.equal(isGrapesDriveConnected(), true)
  assert.equal(await grapesDriveRequest('/files'), 'response')
  assert.equal(await showGrapesConfirm({ message: 'Discard?' }), true)
  assert.equal(await navigateEbookScreen('library'), 'library')
  assert.equal(host.calls[0][0], 'connectDrive')
  assert.equal(host.calls[1][0], 'driveRequest')
  assert.equal(host.calls[2][0], 'confirm')
  assert.equal(host.calls[3][0], 'navigate')
  assert.equal(typeof onGrapesDriveChange(() => {}), 'function')
})
