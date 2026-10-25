import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const exe = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(exe, 'Chromium required for true IndexedDB owner-isolation regression')
const base = 'http://127.0.0.1:4212'
const url = base + '/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4212', '--strictPort'],
  { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let tries = 0; tries < 100; tries++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || tries === 99) throw new Error('Isolated TEST fixture not available')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext()
  const page = await context.newPage()
  const secondPage = await context.newPage()
  await Promise.all([page.goto(url), secondPage.goto(url)])

  const checks = await page.evaluate(async () => {
    const { saveLocalProject, loadLocalProject, listLocalProjects } =
      await import('/Grapes/src/storage/local-project-store.js')
    const { createGrapesTestLocalOwnerStore } =
      await import('/Grapes/src/storage/grapes-test-local-owner-store.js')
    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    await saveLocalProject({ id: 'finance-tracker-current', module: 'Finance',
      name: 'Synthetic legacy', data: { marker: 'UNCLAIMED-LEGACY' } })
    localStorage.setItem('grapes-water-v1', '{"syntheticLegacy":true}')
    let active = A
    const owner = createGrapesTestLocalOwnerStore({
      enabled: true, getVerifiedSubject: async () => active,
    })
    const a0 = await owner.list()
    if (a0.length !== 0) throw new Error('A must not auto-claim legacy local projects')
    const aw = await owner.save({ id: 'finance-current', data: { marker: 'A' } })
    const af = await owner.save({ id: 'food-current', data: { marker: 'A-food' } })
    active = B
    const b0 = await owner.list()
    const bBeforeA = await owner.read('finance-current')
    const bw = await owner.save({ id: 'finance-current', data: { marker: 'B' } })
    const bf = await owner.save({ id: 'food-current', data: { marker: 'B-food' } })
    const bRead = await owner.read('finance-current')
    const bList = await owner.list()
    let staleRejected = false
    try { await owner.save({ id: 'finance-current', data: { marker: 'CORRUPT' }, expectedRevision: 0 }) }
    catch (error) { staleRejected = /ütközés/.test(error?.message) }
    let forgedRejected = false
    try { await owner.save({ id: '../cross-account', data: {} }) }
    catch (error) { forgedRejected = /rekordazonosító/.test(error?.message) }
    active = A
    const aAfter = await owner.read('finance-current')
    const foodAfter = await owner.read('food-current')
    const aList = await owner.list()
    const updated = await owner.save({
      id: 'finance-current', data: { marker: 'A-rev2' }, expectedRevision: 1 })
    active = B
    const bStill = await owner.read('finance-current')
    active = ''
    let loggedOutRejected = false
    try { await owner.list() } catch { loggedOutRejected = true }
    // Account flips after opening but before response must not expose A's data.
    let seq = 0
    const flipped = createGrapesTestLocalOwnerStore({ enabled: true,
      getVerifiedSubject: async () => ++seq < 3 ? A : B })
    let switchedReadRejected = false
    try { await flipped.read('finance-current') } catch (error) {
      switchedReadRejected = /megváltozott/.test(error?.message)
    }
    const disabled = createGrapesTestLocalOwnerStore({
      enabled: false, getVerifiedSubject: async () => A })
    let disabledRejected = false
    try { await disabled.read('finance-current') } catch { disabledRejected = true }
    return {
      emptyA: a0.length, emptyB: b0.length, bBeforeA,
      revisions: [aw.revision, af.revision, bw.revision, bf.revision, updated.revision],
      bRead: bRead?.data?.marker, bList: bList.map(v => v.data.marker).sort(),
      aAfter: aAfter?.data?.marker, foodAfter: foodAfter?.data?.marker,
      aList: aList.map(v => v.data.marker).sort(), bStill: bStill?.data?.marker,
      staleRejected, forgedRejected, loggedOutRejected, switchedReadRejected, disabledRejected,
      legacyPreserved: (await loadLocalProject('finance-tracker-current'))?.data?.marker,
      legacyListed: (await listLocalProjects(100)).some(x => x.data?.marker === 'UNCLAIMED-LEGACY'),
      waterPreserved: localStorage.getItem('grapes-water-v1'),
    }
  })
  assert.deepEqual(checks, {
    emptyA: 0, emptyB: 0, bBeforeA: null, revisions: [1, 1, 1, 1, 2],
    bRead: 'B', bList: ['B', 'B-food'],
    aAfter: 'A', foodAfter: 'A-food', aList: ['A', 'A-food'], bStill: 'B',
    staleRejected: true, forgedRejected: true, loggedOutRejected: true,
    switchedReadRejected: true, disabledRejected: true,
    legacyPreserved: 'UNCLAIMED-LEGACY', legacyListed: true,
    waterPreserved: '{"syntheticLegacy":true}',
  })
  const fromSecondTab = await secondPage.evaluate(async () => {
    const { createGrapesTestLocalOwnerStore } =
      await import('/Grapes/src/storage/grapes-test-local-owner-store.js')
    const B = '00000000-0000-4000-8000-000000000002'
    const store = createGrapesTestLocalOwnerStore({
      enabled: true, getVerifiedSubject: async () => B })
    return {
      own: (await store.read('finance-current'))?.data?.marker,
      visible: (await store.list()).map(row => row.data.marker).sort(),
    }
  })
  assert.deepEqual(fromSecondTab, { own: 'B', visible: ['B', 'B-food'] })
  await context.close()
  console.log('PASS: TEST owner-only local CAS partitions independently survive A→B→A, reject stale revisions, logout and session changes.')
  console.log('PASS: old shared Finance and Water data are untouched and NOT auto-claimed.')
  console.log('NOTE: foundation is not wired into normal modules; this is NOT a complete local data privacy gate.')
} finally {
  await browser?.close()
  server.kill()
}
