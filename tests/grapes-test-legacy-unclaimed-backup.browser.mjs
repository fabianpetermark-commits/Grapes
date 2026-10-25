import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const exe = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(exe, 'Chromium required for original IndexedDB/localStorage read-only QA')
const port = 4215
const url = 'http://127.0.0.1:' + port + '/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || n === 99) throw new Error('Legacy backup test fixture did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: exe, headless: true,
    args: ['--no-sandbox'] })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  const actual = await page.evaluate(async () => {
    const { saveLocalProject, listLocalProjects, loadLocalProject } =
      await import('/Grapes/src/storage/local-project-store.js')
    const { captureUnclaimedLegacySources, prepareUnclaimedLegacyBackup,
      verifyUnclaimedLegacyBackup } =
      await import('/Grapes/src/sync/grapes-test-legacy-unclaimed-backup.js')

    const docs = [
      { id: 'food-tracker-synthetic', module: 'Ételnapló',
        name: 'Mesterséges Food',
        data: { profile: { id: 'synthetic' }, diaryEntries: [{ note: 'Őrzött ☘' }] } },
      { id: 'food-conflict-synthetic', originalId: 'food-tracker-synthetic',
        module: 'Ételnapló', data: { recovery: 'must-not-drop' } },
      { id: 'finance-tracker-current', module: 'Pénzügyi Napló',
        name: 'Mesterséges Finance', data: { transactions: [{
          id: 'synthetic-expense', receipt: { data: 'data:image/png;base64,SGVsbG8=' },
        }] } },
    ]
    for (const doc of docs) await saveLocalProject(doc)
    const keys = {
      'grapes-water-v1': '{"2026-10-25":{"goal":2000,"entries":[{"id":"qa-water","amount":200,"at":"2026-10-25T07:00:00Z"}]}}',
      'grapes-ebook-reading-progress-v1': '{"version":1,"books":{"synthetic":{"percent":15}}}',
      'grapes-food-pending-v1:synthetic': '{"syntheticQueued":true}',
      'grapes-ebook-library-cache-v2:synthetic%40example.com': '{"books":[{"id":"ebook-qa"}]}',
      'grapes-drive-account': 'synthetic@example.com', // runtime setting: excluded
      'grapes-test-synthetic-food-trial-v1:synthetic': '{"testPointer":true}', // excluded
    }
    for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value)

    const beforeProjects = await listLocalProjects(1000)
    const beforeKeys = Object.fromEntries(Object.keys(keys).map(k => [k, localStorage.getItem(k)]))
    const capture = await captureUnclaimedLegacySources()
    const prepared = await prepareUnclaimedLegacyBackup(capture, {
      exportedAt: '2026-10-25T07:15:00Z',
    })
    const envelope = JSON.parse(prepared.json)
    // A synthetic native receipt is test-only; actual SAF independent readback
    // must be added later before a real user backup can be marked verified.
    const receipt = { sha256: prepared.sha256, bytes: prepared.bytes }
    const unchanged = await captureUnclaimedLegacySources()
    const proof = await verifyUnclaimedLegacyBackup(prepared, receipt, unchanged)
    const afterProjects = await listLocalProjects(1000)
    const afterKeys = Object.fromEntries(Object.keys(keys).map(k => [k, localStorage.getItem(k)]))

    const readFinance = await loadLocalProject('finance-tracker-current')
    localStorage.setItem('grapes-water-v1', keys['grapes-water-v1'] + ' ')
    const changed = await captureUnclaimedLegacySources()
    let changedRejected = false
    try { await verifyUnclaimedLegacyBackup(prepared, receipt, changed) }
    catch (error) { changedRejected = /megváltoztak/.test(error.message) }
    localStorage.setItem('grapes-water-v1', keys['grapes-water-v1'])

    localStorage.setItem('grapes-unknown-private-v1', 'DATA-WE-MUST-NOT-SILENTLY-SKIP')
    let unknownRejected = false
    try { await captureUnclaimedLegacySources() }
    catch (error) { unknownRejected = /Unmapped Grapes/.test(error.message) }

    return {
      exactLegacyProjects: JSON.stringify(beforeProjects) === JSON.stringify(afterProjects),
      exactLocalValues: JSON.stringify(beforeKeys) === JSON.stringify(afterKeys),
      recoveryPreserved: envelope.sources.some(x => x.sourceId === 'food-conflict-synthetic'),
      financeReceiptPreserved: readFinance?.data?.transactions?.[0]?.receipt?.data === 'data:image/png;base64,SGVsbG8=',
      foodNotePreserved: envelope.sources.some(x => x.raw.includes('Őrzött ☘')),
      sourceCount: envelope.sources.length,
      providers: envelope.sources.reduce((s, x) => {
        s[x.provider] = (s[x.provider] || 0) + 1
        return s
      }, {}),
      noOwnerAssigned: envelope.ownership === 'unclaimed' && proof.ownership === 'unclaimed',
      noMigrationAllowed: proof.migrationAuthorized === false,
      changedRejected, unknownRejected,
      unrelatedExcluded: !envelope.sources.some(x =>
        x.sourceId === 'grapes-drive-account' || x.sourceId.startsWith('grapes-test-')),
    }
  })
  assert.deepEqual(actual, {
    exactLegacyProjects: true, exactLocalValues: true,
    recoveryPreserved: true, financeReceiptPreserved: true,
    foodNotePreserved: true,
    sourceCount: 7,
    providers: { indexeddb: 3, localStorage: 4 },
    noOwnerAssigned: true, noMigrationAllowed: true,
    changedRejected: true, unknownRejected: true,
    unrelatedExcluded: true,
  })
  await context.close()
  console.log('PASS: real Chromium legacy Food + Finance + recovery + Water + E-book + pending import preserved exactly.')
  console.log('PASS: unclaimed backup receipt+source checks; stale source and unknown keys fail closed. No actual user data or signed export.')
} finally {
  await browser?.close()
  server.kill()
}
