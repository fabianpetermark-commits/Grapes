import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Explicitly documents the EXISTING unsafe legacy behavior. PASS here means
// "risk reproduced", NOT "accounts isolated". There are NO real Google logins,
// Supabase credentials, native requests or user data in this script.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const exe = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(exe, 'Chromium required for isolated local storage audit')
const url = 'http://127.0.0.1:4202/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4202', '--strictPort'],
  { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let tries = 0; tries < 100; tries++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || tries === 99) throw new Error('Local storage audit fixture did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
  // Entirely disposable browser context; both tabs share the one app origin.
  const context = await browser.newContext()
  const tabA = await context.newPage()
  const tabB = await context.newPage()
  await Promise.all([tabA.goto(url), tabB.goto(url)])
  const seed = await tabA.evaluate(async () => {
    const { saveLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    const finance = { id: 'finance-tracker-current', module: 'Pénzügyi Napló',
      name: 'Mesterséges Finance teszt', data: { marker: 'QA-ONLY-A' } }
    const food = { id: 'food-tracker-local-food-profile', module: 'Food',
      name: 'Mesterséges Food teszt',
      data: { profile: { id: 'local-food-profile' }, marker: 'QA-ONLY-A' } }
    await saveLocalProject(finance)
    await saveLocalProject(food)
    localStorage.setItem('grapes-water-v1', JSON.stringify({
      '2026-10-25': { goal: 2000,
        entries: [{ id: 'synthetic-a', amount: 250, at: '2026-10-25T06:00:00.000Z' }] },
    }))
    localStorage.setItem('grapes-ebook-reading-progress-v1',
      JSON.stringify({ version: 1, books: { 'synthetic-book': { percent: 12 } } }))
    return 'synthetic-seed-only'
  })
  assert.equal(seed, 'synthetic-seed-only')

  const observation = await tabB.evaluate(async () => {
    const { loadLocalProject, listLocalProjects } =
      await import('/Grapes/src/storage/local-project-store.js')
    const { readWaterStoreStrict } =
      await import('/Grapes/src/water/water-backup.js')
    const finance = await loadLocalProject('finance-tracker-current')
    const food = await loadLocalProject('food-tracker-local-food-profile')
    const listed = await listLocalProjects(1000)
    const water = readWaterStoreStrict(localStorage)
    const ebook = JSON.parse(localStorage.getItem('grapes-ebook-reading-progress-v1'))
    // Only synthetic marker existence is returned; no personal records.
    return {
      foreignFinanceVisible: finance?.data?.marker === 'QA-ONLY-A',
      foreignFoodVisible: food?.data?.marker === 'QA-ONLY-A',
      projectsListed: listed.filter(x => x?.data?.marker === 'QA-ONLY-A').length,
      foreignWaterVisible: water['2026-10-25']?.entries?.[0]?.id === 'synthetic-a',
      foreignEbookProgressVisible: ebook?.books?.['synthetic-book']?.percent === 12,
    }
  })
  assert.deepEqual(observation, {
    foreignFinanceVisible: true, foreignFoodVisible: true, projectsListed: 2,
    foreignWaterVisible: true, foreignEbookProgressVisible: true,
  }, 'The known legacy storage risks changed: review every module ownership gate!')
  await context.close()
  console.log('AUDIT: CURRENT LEGACY LOCAL STORAGE IS NOT ACCOUNT-ISOLATED; synthetic cross-tab data remains visible to a second session.')
  console.log('AUDIT: finance, local Food, Water, shared project list and E-book reading progress are affected. NOT A SECURITY PASS.')
} finally {
  await browser?.close()
  server.kill()
}
