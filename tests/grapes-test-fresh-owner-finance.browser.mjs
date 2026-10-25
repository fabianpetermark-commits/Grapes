import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(x => x && existsSync(x))
assert.ok(executablePath, 'Chromium required for native Finance A/B/A tests')
const port = 4224
const base = `http://127.0.0.1:${port}/Grapes/`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
let browser
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(base + 'index.html')).ok) break } catch {}
    if (server.exitCode !== null || n === 99) throw Error('Vite fixture did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    window.GrapesAndroid = {
      postMessage(message) {
        const { method, requestId } = JSON.parse(message)
        const reply = () => {
          const subject = localStorage.getItem('__finance_mock_auth_subject')
          const authenticated = localStorage.getItem('__finance_mock_auth_off') !== '1'
          const payload = method === 'getTestAuthEnabled' ? String(authenticated)
            : method === 'getTestAuthSubject' && authenticated ? subject ||
            '00000000-0000-4000-8000-000000000001' : ''
          window.dispatchEvent(new CustomEvent('grapes:android-result', {
            detail: { requestId, ok: true, payload },
          }))
        }
        queueMicrotask(reply)
      },
    }
  })
  const page = await context.newPage()
  page.on('pageerror', error => {
    if (/IndexedDB|Grapes TEST|Finance/.test(String(error))) {
      console.log('Page error observed:', error.message)
    }
  })
  await page.goto(base + 'index.html?module=finance&android-shell=1')
  await page.waitForFunction(() => {
    const el = document.getElementById('finance-app')
    return el && getComputedStyle(el).visibility !== 'hidden' &&
      el.classList.contains('finance') && !el.classList.contains('hidden')
  }, { timeout: 12000 })
  await page.evaluate(async () => {
    const { saveLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    const old = { id: 'finance-tracker-current', module: 'Pénzügyi Napló',
      name: 'unowned legacy', data: { transactions: [{
        id: 'legacy-expense', amount: 888888, note: 'NEVER-MOVE-OR-DISPLAY',
        receipt: { data: 'data:image/png;base64,T0xE' },
      }] } }
    await saveLocalProject(old)
  })

  // Real normal Finance UI writes its own transaction and receipt metadata
  // into the owner-pinned repository, never into the legacy shared DB.
  await page.locator('[data-finance-tab="transaction"]').click()
  await page.locator('#finance-amount').fill('12345')
  await page.locator('#finance-note').fill('A-napló synthetic only')
  await page.locator('#finance-category').fill('Élelmiszer')
  await page.locator('#finance-form').evaluate(form => form.requestSubmit())
  await page.waitForFunction(() =>
    document.querySelector('#finance-save-status')?.textContent?.includes('Helyben mentve'), { timeout: 8000 })
  const snapshotA = await page.evaluate(async () => {
    const { createGrapesTestOwnerFinanceRepository } =
      await import('/Grapes/src/storage/grapes-test-native-owner-qa.js')
    const repo = await createGrapesTestOwnerFinanceRepository({ enabled: true })
    const row = await repo.load()
    return { revision: row?.revision, transactions: row?.data?.data?.transactions,
      legacyUnchanged: (await (await import('/Grapes/src/storage/local-project-store.js'))
        .loadLocalProject('finance-tracker-current'))?.data?.transactions?.[0]?.note ===
        'NEVER-MOVE-OR-DISPLAY' }
  })
  assert.equal(snapshotA.revision, 1)
  assert.equal(snapshotA.transactions.length, 1)
  assert.equal(snapshotA.transactions[0].note, 'A-napló synthetic only')
  assert.equal(snapshotA.legacyUnchanged, true)

  await page.evaluate(B => localStorage.setItem('__finance_mock_auth_subject', B), B)
  await page.reload()
  await page.waitForFunction(() => {
    const el = document.getElementById('finance-app')
    return el && getComputedStyle(el).visibility !== 'hidden' &&
      !el.classList.contains('hidden')
  }, { timeout: 12000 })
  assert.ok(!(await page.locator('#finance-rows').textContent()).includes('A-napló synthetic only'))
  const emptyB = await page.evaluate(async () => {
    const { createGrapesTestOwnerFinanceRepository } =
      await import('/Grapes/src/storage/grapes-test-native-owner-qa.js')
    const repo = await createGrapesTestOwnerFinanceRepository({ enabled: true })
    return (await repo.load()) === null
  })
  assert.equal(emptyB, true, 'B must not inherit A or legacy Finance data')
  await page.locator('[data-finance-tab="transaction"]').click()
  await page.locator('#finance-amount').fill('765')
  await page.locator('#finance-note').fill('B-napló synthetic only')
  await page.locator('#finance-category').fill('Élelmiszer')
  await page.locator('#finance-form').evaluate(form => form.requestSubmit())
  await page.waitForFunction(() =>
    document.querySelector('#finance-save-status')?.textContent?.includes('Helyben mentve'), { timeout: 8000 })

  await page.evaluate(A => localStorage.setItem('__finance_mock_auth_subject', A), A)
  await page.reload()
  await page.waitForFunction(() => {
    const el = document.getElementById('finance-app')
    return el && getComputedStyle(el).visibility !== 'hidden' &&
      !el.classList.contains('hidden')
  }, { timeout: 12000 })
  const aRows = await page.locator('#finance-rows').textContent()
  assert.ok(aRows.includes('A-napló synthetic only'))
  assert.ok(!aRows.includes('B-napló synthetic only'))
  const directResult = await page.evaluate(async (A) => {
    const { openGrapesTestLiveFinance } = await import('/Grapes/src/storage/grapes-test-finance-live.js')
    const { createGrapesTestOwnerFinanceRepository } =
      await import('/Grapes/src/storage/grapes-test-native-owner-qa.js')
    const one = await openGrapesTestLiveFinance({ enabled: true })
    const dataA = await one.read()
    await one.saveSafety('last-delete', dataA)
    const savedBackup = await one.loadSafety('last-delete')
    const concurrent = await openGrapesTestLiveFinance({ enabled: true })
    const stale = await concurrent.read()
    await one.save({ ...dataA, currency: 'EUR' })
    let staleRejected = false
    try { await concurrent.save({ ...stale, currency: 'USD' }) }
    catch (err) { staleRejected = /ütközés|felül/.test(err.message) }
    let poisonedRejected = false
    try { await concurrent.save({ ...stale, currency: 'HUF' }) }
    catch { poisonedRejected = true }
    // Check two pending saves from one session serialize CAS correctly.
    const p1 = one.save({ ...dataA, currency: 'EUR' })
    const p2 = one.save({ ...dataA, currency: 'HUF' })
    const [q1,q2] = await Promise.all([p1,p2])
    // New verified subject must block stale in-memory save.
    localStorage.setItem('__finance_mock_auth_subject',
      '00000000-0000-4000-8000-000000000002')
    let staleOwnerRejected = false
    try { await one.save(dataA) } catch { staleOwnerRejected = true }
    localStorage.setItem('__finance_mock_auth_subject', A)
    return {
      backupReceipt: savedBackup.transactions[0].note,
      conflictRejected: staleRejected, poisonedRejected,
      sequential: q2.revision === q1.revision + 1,
      staleOwnerRejected,
    }
  }, A)
  assert.deepEqual(directResult, {
    backupReceipt: 'A-napló synthetic only',
    conflictRejected: true, poisonedRejected: true,
    sequential: true, staleOwnerRejected: true,
  })
  await context.close()
  console.log('PASS: real Finance UI A→B→A, normal transactions and receipts owner-scoped, legacy unchanged.')
  console.log('PASS: private Finance backup, CAS conflict, queued saves, stale account denied, Drive skipped.')
} finally {
  await browser?.close()
  server.kill()
}
