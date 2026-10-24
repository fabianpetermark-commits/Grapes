import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Real Vite modules and IndexedDB, fake native RPC transport and fake server.
// No hosted Supabase, real profile, real Food store or Drive account is touched.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for synthetic TEST Food trial')
const url = 'http://127.0.0.1:4198/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4198', '--strictPort'], { cwd: root, stdio: 'ignore' })
const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PROFILE = 'grapes:00000000-0000-4000-8000-000000000003'
let browser
let offline = false, altered = false, profileCalls = 0, docReads = 0
let serverRevision = 0, stored = null
const attempts = new Map()
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before synthetic trial')
    try { if ((await fetch(url)).ok) break } catch {}
    if (attempt === 99) throw new Error('TEST Food server did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext()
  await context.exposeFunction('qaNativeRpc', async (method, name, args) => {
    if (method === 'supabaseTestWhoAmI') return USER
    assert.equal(method, 'supabaseTestRpc')
    if (name === 'create_profile') {
      profileCalls++
      return JSON.stringify(PROFILE)
    }
    if (name === 'compare_and_swap') {
      if (offline) throw new Error('synthetic offline')
      const result = attempts.get(args.p_operation_id)
      if (result) return JSON.stringify(result.result)
      assert.equal(args.p_profile_id, PROFILE)
      assert.equal(args.p_kind, 'food_diary')
      assert.equal(args.p_expected_revision, 0)
      assert.equal(args.p_candidate.syntheticQA, true)
      const answer = { status: 'committed', revision: ++serverRevision }
      stored = { recordId: args.p_record_id, payload: args.p_candidate, schemaVersion: args.p_schema_version }
      attempts.set(args.p_operation_id, { result: answer, attempt: {
        profileId: PROFILE, kind: 'food_diary', recordId: stored.recordId,
        status: 'committed', candidate: stored.payload,
      } })
      return JSON.stringify(answer)
    }
    if (name === 'read_attempt') return JSON.stringify(attempts.get(args.p_operation_id)?.attempt ?? null)
    if (name === 'read_document') {
      docReads++
      return JSON.stringify(stored ? {
        profileId: PROFILE, kind: 'food_diary', recordId: stored.recordId,
        revision: serverRevision, schemaVersion: 1,
        payload: altered ? { kcal: 999 } : stored.payload,
      } : null)
    }
    throw new Error('Unexpected native request: ' + name)
  })
  const page = await context.newPage()
  await page.goto(url)
  async function phase(method, subject = USER) {
    return page.evaluate(async ({ method, subject }) => {
      const { createGrapesTestSyntheticFoodTrial } =
        await import('/Grapes/src/sync/grapes-test-synthetic-food-trial.js')
      const { openGrapesTestNativeFoundation } =
        await import('/Grapes/src/sync/grapes-test-native-client.js')
      const trial = createGrapesTestSyntheticFoodTrial({
        enabled: true,
        openFoundation: () => openGrapesTestNativeFoundation({
          getSubject: async () => subject,
          request: (...args) => window.qaNativeRpc(...args),
        }),
      })
      try { return { ok: true, result: await trial[method]() } }
      catch (error) { return { ok: false, message: error.message } }
    }, { method, subject })
  }
  const prepared = await phase('prepare')
  assert.equal(prepared.ok, true)
  assert.equal(prepared.result.status, 'pending')
  assert.equal(profileCalls, 1)
  assert.equal(docReads, 0)
  offline = true
  const failed = await phase('save')
  assert.equal(failed.ok, false)
  assert.equal(serverRevision, 0)
  await page.reload()
  assert.equal((await phase('prepare')).result.operationId, prepared.result.operationId)
  assert.equal(profileCalls, 1)
  offline = false
  assert.equal((await phase('save')).result.revision, 1)
  assert.equal(docReads, 0) // save never asserts the separate read happened
  assert.equal((await phase('readBack')).result.phase, 'readback-verified')
  assert.equal(docReads, 1)
  altered = true
  assert.equal((await phase('readBack')).ok, false)
  assert.equal((await phase('save', OTHER)).ok, false)
  assert.equal(serverRevision, 1)
  console.log('PASS: native RPC adapter → real IndexedDB outbox → one synthetic Food CAS; offline retry and independent readback')
} finally { await browser?.close(); server.kill() }
