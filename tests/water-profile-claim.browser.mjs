import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for Water profile claim test')
const base = 'http://127.0.0.1:4199'
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4199', '--strictPort'],
{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_GRAPES_TEST_CHANNEL: '1',
    VITE_GRAPES_TEST_WATER_PROFILE_ENABLED: 'true' } })
let browser
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before Water profile test')
    try { if ((await fetch(base)).ok) break } catch {}
    if (attempt === 79) throw new Error('Vite did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const legacy = JSON.stringify({ '2026-10-24': { goal: 2000, entries: [
    { id: 'legacy-water', amount: 250, at: '2026-10-24T08:00:00.000Z' }] } })
  await context.addInitScript(raw => {
    localStorage.setItem('grapes-local-mode', '1')
    if (localStorage.getItem('grapes-water-v1') === null) localStorage.setItem('grapes-water-v1', raw)
  }, legacy)
  const page = await context.newPage()
  await page.goto(base + '/Grapes/design/android-mobile-preview.html')
  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-water-open]').click()
  await page.locator('[data-page="water"]').waitFor({ state: 'visible' })
  await page.locator('[data-water-legacy-claim]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-water-legacy-summary]').textContent(), /1 nap, 1 bejegyzés/)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), legacy)
  await page.evaluate(() => { window.confirm = () => true })
  await page.locator('[data-water-legacy-claim-button]').click()
  await page.waitForFunction(() => localStorage.getItem('grapes-water-v2:00000000-0000-4000-8000-000000000001')?.includes('legacy-water'))
  const after = await page.evaluate(async () => {
    const { getLocalWaterOwner, claimLocalWaterOwner, listLocalProjects } = await import('/Grapes/src/storage/local-project-store.js')
    const { profileWaterBackupToJson, profileWaterBackupFromJson } = await import('/Grapes/src/water/water-profile-store.js')
    const { captureV24LocalHealthSources } = await import('/Grapes/src/sync/grapes-health-v24-local-reader.js')
    const anna = '00000000-0000-4000-8000-000000000001'
    const bela = '00000000-0000-4000-8000-000000000002'
    let otherBlocked = false
    try { await claimLocalWaterOwner(bela) } catch { otherBlocked = true }
    const backup = profileWaterBackupToJson(localStorage, anna)
    let crossBackupBlocked = false
    try { profileWaterBackupFromJson(backup, bela) } catch { crossBackupBlocked = true }
    let migrationBackupBlocked = false
    try { await captureV24LocalHealthSources() } catch (error) {
      migrationBackupBlocked = /Profile-scoped Water/.test(error.message)
    }
    return { original: localStorage.getItem('grapes-water-v1'),
      owner: await getLocalWaterOwner(), otherBlocked, crossBackupBlocked, migrationBackupBlocked,
      ownerHiddenFromProjects: !(await listLocalProjects(100)).some(item => item.id === 'water-legacy-owner-v1'),
      backup: JSON.parse(backup) }
  })
  assert.equal(after.original, legacy)
  assert.equal(after.owner, '00000000-0000-4000-8000-000000000001')
  assert.equal(after.otherBlocked, true)
  assert.equal(after.crossBackupBlocked, true)
  assert.equal(after.migrationBackupBlocked, true, 'generic backup must not omit v2 Water')
  assert.equal(after.ownerHiddenFromProjects, true)
  assert.equal(after.backup.version, 2)
  assert.equal(after.backup.profileId, after.owner)
  await page.locator('[data-page="water"] [data-water-add="250"]').click()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(
    'grapes-water-v2:00000000-0000-4000-8000-000000000001'))['2026-10-24'].entries.length), 2)
  assert.equal(await page.evaluate(() => localStorage.getItem('grapes-water-v1')), legacy)
  await context.close()
  const raceContext = await browser.newContext()
  const first = await raceContext.newPage()
  const second = await raceContext.newPage()
  await Promise.all([first.goto(base + '/Grapes/design/android-mobile-preview.html'),
    second.goto(base + '/Grapes/design/android-mobile-preview.html')])
  const attempts = await Promise.allSettled([
    first.evaluate(async () => (await import('/Grapes/src/storage/local-project-store.js'))
      .claimLocalWaterOwner('123e4567-e89b-12d3-a456-426614174000')),
    second.evaluate(async () => (await import('/Grapes/src/storage/local-project-store.js'))
      .claimLocalWaterOwner('123e4567-e89b-12d3-a456-426614174001'))
  ])
  assert.deepEqual(attempts.map(result => result.status).sort(), ['fulfilled', 'rejected'])
  await raceContext.close()
  console.log('TEST Water: explicit profile claim preserves legacy bytes and blocks second owner')
} finally { await browser?.close(); server.kill() }
