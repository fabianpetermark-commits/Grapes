import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  configureEbookPlatform,
  connectDrive, disconnectDrive, getConnectedAccount, getAccessToken,
  hasFullReadAccess, driveRequest, isDriveConnected, onDriveChange,
  confirm, navigate,
  connectGrapesDrive, disconnectGrapesDrive, getConnectedGrapesAccount,
  getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest,
  isGrapesDriveConnected, onGrapesDriveChange, showGrapesConfirm, navigateEbookScreen,
} from '../src/ebook/platform.js'

const adapter = () => {
  const calls = []
  const value = {
    connectDrive: (...args) => { calls.push(['connectDrive', ...args]); return 'token' },
    disconnectDrive: (...args) => { calls.push(['disconnectDrive', ...args]); return 'disconnected' },
    getConnectedAccount: (...args) => { calls.push(['getConnectedAccount', ...args]); return { email: 'reader@example.com' } },
    getAccessToken: (...args) => { calls.push(['getAccessToken', ...args]); return 'token' },
    hasFullReadAccess: (...args) => { calls.push(['hasFullReadAccess', ...args]); return true },
    driveRequest: (...args) => { calls.push(['driveRequest', ...args]); return Promise.resolve('response') },
    isDriveConnected: (...args) => { calls.push(['isDriveConnected', ...args]); return true },
    onDriveChange: (...args) => { calls.push(['onDriveChange', ...args]); return () => {} },
    confirm: (...args) => { calls.push(['confirm', ...args]); return Promise.resolve(true) },
    navigate: (...args) => { calls.push(['navigate', ...args]); return Promise.resolve(args[0]) },
  }
  return { value, calls }
}

test('platform boundary rejects missing adapter methods and unconfigured access', () => {
  configureEbookPlatform(null)
  assert.throws(() => getConnectedAccount(), /még nincs konfigurálva/)
  assert.throws(() => configureEbookPlatform({}), /Hiányzó E-book platformműveletek/)
})

test('host-neutral feature API delegates every operation to the installed host', async () => {
  const host = adapter()
  configureEbookPlatform(host.value)
  assert.equal(connectDrive({ fullRead: true }), 'token')
  assert.equal(disconnectDrive({ forgetAccount: true }), 'disconnected')
  assert.deepEqual(getConnectedAccount('profile'), { email: 'reader@example.com' })
  assert.equal(getAccessToken(), 'token')
  assert.equal(hasFullReadAccess(), true)
  assert.equal(isDriveConnected(), true)
  assert.equal(await driveRequest('/files'), 'response')
  assert.equal(await confirm({ message: 'Discard?' }), true)
  assert.equal(await navigate('library'), 'library')
  assert.equal(typeof onDriveChange(() => {}), 'function')
  assert.deepEqual(host.calls.map(call => call[0]), [
    'connectDrive','disconnectDrive','getConnectedAccount','getAccessToken',
    'hasFullReadAccess','isDriveConnected','driveRequest','confirm','navigate','onDriveChange',
  ])
})

test('legacy Grapes exports remain compatible aliases of the neutral API', async () => {
  const host = adapter()
  configureEbookPlatform(host.value)
  assert.equal(connectGrapesDrive(), connectDrive())
  assert.equal(disconnectGrapesDrive(), disconnectDrive())
  assert.deepEqual(getConnectedGrapesAccount(), getConnectedAccount())
  assert.equal(getGrapesDriveAccessToken(), getAccessToken())
  assert.equal(grapesDriveHasFullReadAccess(), hasFullReadAccess())
  assert.equal(isGrapesDriveConnected(), isDriveConnected())
  assert.equal(await grapesDriveRequest('/legacy'), await driveRequest('/legacy'))
  assert.equal(await showGrapesConfirm({ message: 'legacy' }), await confirm({ message: 'legacy' }))
  assert.equal(await navigateEbookScreen('legacy'), await navigate('legacy'))
  assert.equal(typeof onGrapesDriveChange(() => {}), 'function')
})
