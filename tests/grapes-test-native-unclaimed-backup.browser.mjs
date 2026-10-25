import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(x => x && existsSync(x))
assert.ok(executablePath, 'Chromium is needed for the native backup protocol test')
const port = 4217
const url = `http://127.0.0.1:${port}/Grapes/tests/fixtures/grapes-test-outbox.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || i === 99) throw new Error('Native backup test fixture unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.backupNative = {
      calls: [], chunks: [], failedAt: '', simulatedShortWrite: false, token: 'synthetic-qa-token',
    }
    window.GrapesAndroid = {
      postMessage(source) {
        const { method, args, requestId } = JSON.parse(source)
        const native = window.backupNative
        native.calls.push(method)
        const reply = async () => {
          try {
            if (method === native.failedAt) throw new Error('Synthetic SAF provider denied/cancelled')
            let payload = '{}'
            switch (method) {
              case 'beginUnclaimedBackupExport':
                if (!/^grapes-helyi-adatok-\d{4}-\d{2}-\d{2}\.json$/.test(args?.[0])) {
                  throw new Error('Wrong native backup filename')
                }
                native.chunks = []
                payload = native.token
                break
              case 'appendFoodBackupExport':
                if (args?.[0] !== native.token) throw new Error('Invalid synthetic token')
                native.chunks.push(args[1])
                break
              case 'finishFoodBackupExport': {
                if (args?.[0] !== native.token) throw new Error('Invalid synthetic token')
                const content = native.chunks.join('')
                const data = new TextEncoder().encode(
                  native.simulatedShortWrite ? content.slice(0, -1) : content)
                const digest = await crypto.subtle.digest('SHA-256', data)
                payload = JSON.stringify({ bytes: data.byteLength, sha256:
                  [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') })
                break
              }
              case 'cancelFoodBackupExport':
                native.chunks = []
                break
              default: throw new Error('Unapproved mock native method: ' + method)
            }
            window.dispatchEvent(new CustomEvent('grapes:android-result', {
              detail: { requestId, ok: true, payload },
            }))
          } catch (error) {
            window.dispatchEvent(new CustomEvent('grapes:android-result', {
              detail: { requestId, ok: false, error: error.message },
            }))
          }
        }
        queueMicrotask(reply)
      },
    }
  })
  const page = await context.newPage()
  await page.goto(url)
  const actual = await page.evaluate(async () => {
    const { saveAndroidVerifiedUnclaimedBackup } = await import('/Grapes/src/android-bridge.js')
    const { prepareUnclaimedLegacyBackup } =
      await import('/Grapes/src/sync/grapes-test-legacy-unclaimed-backup.js')
    const capture = {
      ownership: 'unclaimed',
      sources: [
        { provider: 'indexeddb', sourceId: 'food-tracker-qa',
          raw: JSON.stringify({ id: 'food-tracker-qa', module: 'Ételnapló',
            data: { note: 'Őrzött ☘', history: 'x'.repeat(101500) } }) },
        { provider: 'localStorage', sourceId: 'grapes-water-v1',
          raw: '{"2026-10-25":{"entries":[{"id":"qa-water","amount":100}]}}' },
      ],
    }
    const ready = await prepareUnclaimedLegacyBackup(capture, {
      exportedAt: '2026-10-25T12:00:00Z',
    })
    const receipt = await saveAndroidVerifiedUnclaimedBackup(ready)
    const firstCall = window.backupNative.calls[0]
    const chunkCount = window.backupNative.calls.filter(x =>
      x === 'appendFoodBackupExport').length
    const exact = window.backupNative.chunks.join('') === ready.json

    let preflightRejected = false
    const callCount = window.backupNative.calls.length
    try { await saveAndroidVerifiedUnclaimedBackup({ ...ready, sha256: '0'.repeat(64) }) }
    catch { preflightRejected = true }
    const noNativeBeforePreflight = callCount === window.backupNative.calls.length

    window.backupNative.simulatedShortWrite = true
    let shortWriteRejected = false
    try { await saveAndroidVerifiedUnclaimedBackup(ready) }
    catch { shortWriteRejected = true }
    const cancelledAfterShortWrite = window.backupNative.calls.at(-1) === 'cancelFoodBackupExport'
    window.backupNative.simulatedShortWrite = false

    window.backupNative.failedAt = 'appendFoodBackupExport'
    let chunkFailureRejected = false
    try { await saveAndroidVerifiedUnclaimedBackup(ready) }
    catch { chunkFailureRejected = true }
    const cancelledAfterChunkFailure = window.backupNative.calls.at(-1) === 'cancelFoodBackupExport'
    window.backupNative.failedAt = ''

    window.backupNative.failedAt = 'beginUnclaimedBackupExport'
    let canceledPickerRejected = false
    try { await saveAndroidVerifiedUnclaimedBackup(ready) }
    catch { canceledPickerRejected = true }
    const noInvalidCancel = window.backupNative.calls.at(-1) === 'beginUnclaimedBackupExport'
    window.backupNative.failedAt = ''

    return {
      receiptCorrect: receipt.bytes === ready.bytes && receipt.sha256 === ready.sha256,
      nativeMethodRestricted: firstCall === 'beginUnclaimedBackupExport',
      multipleChunks: chunkCount > 1,
      utf8Exact: exact,
      preflightRejected, noNativeBeforePreflight,
      shortWriteRejected, cancelledAfterShortWrite,
      chunkFailureRejected, cancelledAfterChunkFailure,
      canceledPickerRejected, noInvalidCancel,
    }
  })
  assert.deepEqual(actual, {
    receiptCorrect: true, nativeMethodRestricted: true, multipleChunks: true,
    utf8Exact: true, preflightRejected: true, noNativeBeforePreflight: true,
    shortWriteRejected: true, cancelledAfterShortWrite: true,
    chunkFailureRejected: true, cancelledAfterChunkFailure: true,
    canceledPickerRejected: true, noInvalidCancel: true,
  })
  await context.close()
  console.log('PASS: synthetic Android backup bridge chunking, UTF-8 integrity, receipt comparison, cancellation and failure gates.')
  console.log('Native SAF readback is covered separately by Kotlin tests; this Chromium native bridge is mocked.');
} finally {
  await browser?.close()
  server.kill()
}
