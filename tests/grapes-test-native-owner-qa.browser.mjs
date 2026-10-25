import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(chrome, 'Chromium required for synthetic native-owner browser QA')
const port = 4213
const url = 'http://127.0.0.1:' + port + '/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let n = 0; n < 120; n++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || n === 119) throw new Error('QA fixture never became available')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true,
    args: ['--no-sandbox'] })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const ids = {
      A: '00000000-0000-4000-8000-000000000001',
      B: '00000000-0000-4000-8000-000000000002',
    }
    window.syntheticNative = { active: 'A', enabled: true, ids, calls: [] }
    window.GrapesAndroid = {
      postMessage(message) {
        const { method, requestId } = JSON.parse(message)
        window.syntheticNative.calls.push(method)
        const payload = method === 'getTestAuthEnabled'
          ? String(window.syntheticNative.enabled)
          : method === 'getTestAuthSubject'
            ? (window.syntheticNative.enabled ? ids[window.syntheticNative.active] : null)
            : null
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('grapes:android-result', {
            detail: payload == null
              ? { requestId, ok: false, error: 'TEST-native kapu nem aktív.' }
              : { requestId, ok: true, payload },
          }))
        })
      },
    }
  })
  const page = await context.newPage()
  await page.goto(url)

  const proof = await page.evaluate(async () => {
    const { saveLocalProject, loadLocalProject, listLocalProjects } =
      await import('/Grapes/src/storage/local-project-store.js')
    const { createGrapesTestNativeOwnerTrial, createGrapesTestOwnerFinanceRepository } =
      await import('/Grapes/src/storage/grapes-test-native-owner-qa.js')
    await saveLocalProject({ id: 'finance-tracker-current', module: 'Pénzügyi Napló',
      name: 'TEST legacy marker', data: { marker: 'LEGACY-UNCLAIMED' } })
    localStorage.setItem('grapes-water-v1', '{"legacyMarker":"water-untouched"}')
    const trial = createGrapesTestNativeOwnerTrial({ enabled: true })
    const repo = createGrapesTestOwnerFinanceRepository({ enabled: true })
    const disabled = createGrapesTestNativeOwnerTrial()
    let disabledRefused = false
    try { await disabled.prepare() } catch { disabledRefused = true }
    const preparedA = await trial.prepare()
    const repeatedA = await trial.prepare()
    const readA = await trial.readBack()
    const financeA = await repo.save({ marker: 'A-private' }, 0)

    window.syntheticNative.active = 'B'
    let absentB = false
    try { await trial.readBack() } catch { absentB = true }
    const financeBNotA = await repo.load()
    const preparedB = await trial.prepare()
    const readB = await trial.readBack()
    const financeB = await repo.save({ marker: 'B-private' }, 0)
    let staleRefused = false
    try { await repo.save({ marker: 'wrong-B' }, 0) }
    catch (error) { staleRefused = /ütközés/.test(error.message) }

    window.syntheticNative.active = 'A'
    const againA = await trial.readBack()
    const financeARead = await repo.load()
    const financeAUpdate = await repo.save({ marker: 'A-private-v2' }, 1)

    window.syntheticNative.active = 'B'
    const againB = await trial.readBack()
    const financeBAgain = await repo.load()
    window.syntheticNative.enabled = false
    let loggedOutRefused = false
    try { await trial.readBack() } catch { loggedOutRefused = true }
    let financeLoggedOutRefused = false
    try { await repo.load() } catch { financeLoggedOutRefused = true }

    const legacyFinance = await loadLocalProject('finance-tracker-current')
    const unclaimedLegacy = (await listLocalProjects(100)).filter(row =>
      row.id === 'finance-tracker-current')
    return {
      disabledRefused, preparedA, repeatedA, readA, financeA,
      absentB, financeBNotA, preparedB, readB, financeB,
      staleRefused, againA, financeARead: financeARead?.data?.marker,
      financeAUpdate, againB, financeBAgain: financeBAgain?.data?.marker,
      loggedOutRefused, financeLoggedOutRefused,
      legacyFinance: legacyFinance?.data?.marker,
      legacyCount: unclaimedLegacy.length,
      water: localStorage.getItem('grapes-water-v1'),
      nativeCalls: window.syntheticNative.calls,
    }
  })

  assert.equal(proof.disabledRefused, true)
  assert.deepEqual(proof.preparedA, { phase: 'prepared', created: 2, ownerVerified: true })
  assert.deepEqual(proof.repeatedA, { phase: 'prepared', created: 0, ownerVerified: true })
  assert.deepEqual(proof.readA, { phase: 'readback-verified', records: 2, ownerVerified: true })
  assert.deepEqual(proof.financeA, { id: 'finance-current', revision: 1 })
  assert.equal(proof.absentB, true)
  assert.equal(proof.financeBNotA, null)
  assert.deepEqual(proof.preparedB, { phase: 'prepared', created: 2, ownerVerified: true })
  assert.deepEqual(proof.readB, proof.readA)
  assert.deepEqual(proof.financeB, proof.financeA)
  assert.equal(proof.staleRefused, true)
  assert.deepEqual(proof.againA, proof.readA)
  assert.equal(proof.financeARead, 'A-private')
  assert.deepEqual(proof.financeAUpdate, { id: 'finance-current', revision: 2 })
  assert.deepEqual(proof.againB, proof.readA)
  assert.equal(proof.financeBAgain, 'B-private')
  assert.equal(proof.loggedOutRefused, true)
  assert.equal(proof.financeLoggedOutRefused, true)
  assert.equal(proof.legacyFinance, 'LEGACY-UNCLAIMED')
  assert.equal(proof.legacyCount, 1)
  assert.equal(proof.water, '{"legacyMarker":"water-untouched"}')
  assert.ok(proof.nativeCalls.filter(call => call === 'getTestAuthSubject').length > 20)
  assert.ok(proof.nativeCalls.includes('getTestAuthEnabled'))
  await context.close()
  console.log('PASS: synthetic native bridge A→B→A owner-local QA and Finance adapter; no cross-owner project.')
  console.log('PASS: logout fail closed, stale Finance write blocked and unclaimed legacy data unchanged.')
  console.log('NO-GO remains: this is mocked native bridge in Chromium, not a real phone nor the normal Finance UI.')
} finally {
  await browser?.close()
  server.kill()
}
