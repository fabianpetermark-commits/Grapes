import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const exe = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(x => x && existsSync(x))
assert.ok(exe, 'Chromium required for TEST Water account isolation')
const port = 4218
const url = `http://127.0.0.1:${port}/Grapes/tests/fixtures/grapes-test-outbox.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || n === 99) throw Error('TEST fixture did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  const evidence = await page.evaluate(async () => {
    const { saveLocalProject, listLocalProjects } =
      await import('/Grapes/src/storage/local-project-store.js')
    const { createGrapesTestLocalOwnerStore } =
      await import('/Grapes/src/storage/grapes-test-local-owner-store.js')
    const { createGrapesTestFreshOwnerAccess } =
      await import('/Grapes/src/storage/grapes-test-fresh-owner-access.js')
    const { openGrapesTestFreshWater } =
      await import('/Grapes/src/water/grapes-test-fresh-water.js')
    const { profileWaterBackupFromJson } =
      await import('/Grapes/src/water/water-profile-store.js')

    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    let current = A
    let auth = true
    const args = { enabled: true, isAndroid: () => true,
      authEnabled: async () => auth, getSubject: async () => current }
    const legacy = '{"2026-10-25":{"goal":999,"entries":[{"id":"never-copy","amount":999,"at":"2026-10-25T07:00:00Z"}]}}'
    localStorage.setItem('grapes-water-v1', legacy)
    await saveLocalProject({ id: 'finance-tracker-current', module: 'Pénzügyi Napló',
      name: 'Legacy A / unowned', data: { marker: 'SHARED-DO-NOT-DISPLAY' } })

    const access = createGrapesTestFreshOwnerAccess(args)
    const ownerData = createGrapesTestLocalOwnerStore({
      enabled: true, getVerifiedSubject: async () => current })
    await ownerData.save({ id: 'finance-current', data: {
      module: 'Pénzügyi Napló', name: 'A Finance', marker: 'A',
    } })
    const projectsA = await access.listOwnedProjects()
    const usageA = await access.ownedUsage()
    const waterA = await openGrapesTestFreshWater(args)
    const a0 = await waterA.read()
    await waterA.save({ '2026-10-25': { goal: 2000,
      entries: [{ id: 'water-A', amount: 200, at: '2026-10-25T07:00:00Z' }] } }, a0.raw)
    const aAfter = await waterA.read()
    current = B
    const b0 = await openGrapesTestFreshWater(args)
    const bInitial = await b0.read()
    const projectsB = await access.listOwnedProjects()
    const usageB = await access.ownedUsage()
    let staleWriteRejected = false
    try { await waterA.save({ '2026-10-25': { goal: 1000, entries: [] } }, aAfter.raw) }
    catch { staleWriteRejected = true }
    await b0.save({ '2026-10-25': { goal: 1500,
      entries: [{ id: 'water-B', amount: 300, at: '2026-10-25T07:15:00Z' }] } }, bInitial.raw)
    const bOwn = await b0.read()
    let legacyRestoreRejected = false
    try {
      profileWaterBackupFromJson(JSON.stringify({ grapesWaterBackup:true, version:1,
        data: { '2026-10-25': { goal: 999, entries: [] } } }), B,
        { allowLegacy: false })
    } catch { legacyRestoreRejected = true }
    current = A
    const aReturn = await (await openGrapesTestFreshWater(args)).read()
    let oldBStaleRejected = false
    try { await b0.read() } catch { oldBStaleRejected = true }
    auth = false
    let loggedOutRejected = false
    try { await access.listOwnedProjects() } catch { loggedOutRejected = true }
    let waterLogoutRejected = false
    try { await waterA.read() } catch { waterLogoutRejected = true }
    const oldProjects = await listLocalProjects(100)
    return {
      aOwnProject: projectsA.map(p=>p.name), bProjects: projectsB.length,
      aProjectCount: usageA.projects, bProjectCount: usageB.projects,
      aWaterDay: aAfter.data['2026-10-25'].entries[0].id,
      bInitiallyEmpty: Object.keys(bInitial.data).length === 0,
      bWaterDay: bOwn.data['2026-10-25'].entries[0].id,
      aAfterReturn: aReturn.data['2026-10-25'].entries[0].id,
      staleWriteRejected, oldBStaleRejected, loggedOutRejected,
      waterLogoutRejected, legacyRestoreRejected,
      oldWaterUnchanged: localStorage.getItem('grapes-water-v1') === legacy,
      oldFinanceUnchanged: oldProjects.some(p => p.data?.marker === 'SHARED-DO-NOT-DISPLAY'),
      ownerKeysDifferent: waterA.key !== b0.key,
    }
  })
  assert.deepEqual(evidence, {
    aOwnProject: ['A Finance'], bProjects: 0,
    aProjectCount: 1, bProjectCount: 0,
    aWaterDay: 'water-A', bInitiallyEmpty: true, bWaterDay: 'water-B',
    aAfterReturn: 'water-A', staleWriteRejected: true,
    oldBStaleRejected: true, loggedOutRejected: true,
    waterLogoutRejected: true, legacyRestoreRejected: true,
    oldWaterUnchanged: true, oldFinanceUnchanged: true, ownerKeysDifferent: true,
  })
  await ctx.close()
  console.log('PASS: fresh TEST Water A→B→A data, legacy untouched, stale session/logout denied.')
  console.log('PASS: account-scoped project index and usage never show legacy Finance or other users.')
  console.log('NOTE: normal Food/Finance/E-book UI remains NO-GO. Feature OFF by default.')
} finally {
  await browser?.close()
  server.kill()
}
