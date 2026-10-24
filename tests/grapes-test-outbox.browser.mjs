import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for TEST outbox verification')
const url = 'http://127.0.0.1:4197/Grapes/tests/fixtures/grapes-test-outbox.html'
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '4197', '--strictPort'], { cwd: root, stdio: 'ignore' })
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const PROFILE = 'grapes:00000000-0000-4000-8000-000000000003'
const OP1 = '00000000-0000-4000-8000-000000000004'
const OP2 = '00000000-0000-4000-8000-000000000005'
const OP3 = '00000000-0000-4000-8000-000000000006'
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before outbox test')
    try { if ((await fetch(url)).ok) break } catch {}
    if (attempt === 99) throw new Error('TEST outbox server did not start')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext()
  const a = await context.newPage(), b = await context.newPage()
  await Promise.all([a.goto(url), b.goto(url)])
  const pending = await a.evaluate(async ({ A, B, PROFILE, OP1 }) => {
    const { createGrapesTestOutbox } = await import('/Grapes/src/sync/grapes-test-outbox.js')
    const gateway = { compareAndSwap() { throw new Error('offline') }, readAttempt() {} }
    const outbox = createGrapesTestOutbox({ userId: A, gateway })
    const job = { profileId: PROFILE, kind: 'food_diary', recordId: 'entry-1',
      operationId: OP1, expectedRevision: 0, schemaVersion: 1, candidate: { amount: 1 } }
    const queued = await outbox.enqueue(job)
    const duplicate = await outbox.enqueue({ ...job, candidate: { amount: 1 } })
    let collisionRejected = false, storageRejected = false
    try { await outbox.enqueue({ ...job, candidate: { amount: 99 } }) } catch { collisionRejected = true }
    try { await createGrapesTestOutbox({ userId: A, gateway,
      indexedDb: { open() { throw new Error('storage unavailable') } } }).enqueue({ ...job, operationId: B }) }
    catch { storageRejected = true }
    return { queued, duplicate, collisionRejected, storageRejected }
  }, { A, B, PROFILE, OP1 })
  assert.deepEqual(pending.queued, { operationId: OP1, status: 'pending' })
  assert.deepEqual(pending.duplicate, pending.queued)
  assert.equal(pending.collisionRejected, true)
  assert.equal(pending.storageRejected, true)

  await a.reload()
  const ownerList = await a.evaluate(async ({ A, PROFILE }) => {
    const { createGrapesTestOutbox } = await import('/Grapes/src/sync/grapes-test-outbox.js')
    return createGrapesTestOutbox({ userId: A,
      gateway: { compareAndSwap() {}, readAttempt() {} } }).list(PROFILE)
  }, { A, PROFILE })
  const otherList = await b.evaluate(async ({ B, PROFILE }) => {
    const { createGrapesTestOutbox } = await import('/Grapes/src/sync/grapes-test-outbox.js')
    return createGrapesTestOutbox({ userId: B,
      gateway: { compareAndSwap() {}, readAttempt() {} } }).list(PROFILE)
  }, { B, PROFILE })
  assert.equal(ownerList.length, 1)
  assert.equal(ownerList[0].status, 'pending')
  assert.deepEqual(otherList, [])

  const outcome = await a.evaluate(async ({ A, PROFILE, OP1, OP2 }) => {
    const { createGrapesTestOutbox } = await import('/Grapes/src/sync/grapes-test-outbox.js')
    let revision = 0, lost = true, missingReadback = true
    const attempts = new Map()
    const gateway = {
      async compareAndSwap(job) {
        let saved = attempts.get(job.operationId)
        if (!saved) {
          const result = job.expectedRevision === revision
            ? { status: 'committed', revision: ++revision }
            : { status: 'conflict', revision, snapshotId: job.operationId }
          saved = { result, attempt: { profileId: job.profileId, kind: job.kind,
            recordId: job.recordId, status: result.status, candidate: job.candidate } }
          attempts.set(job.operationId, saved)
        }
        if (lost) { lost = false; throw new Error('connection interrupted after server commit') }
        return saved.result
      },
      async readAttempt(operationId) {
        if (missingReadback) { missingReadback = false; throw new Error('readback interrupted') }
        return attempts.get(operationId)?.attempt ?? null
      },
    }
    const outbox = createGrapesTestOutbox({ userId: A, gateway })
    let lostRejected = false, readbackRejected = false
    try { await outbox.retry(PROFILE) } catch { lostRejected = true }
    const afterLost = (await outbox.list(PROFILE))[0].status
    try { await outbox.retry(PROFILE) } catch { readbackRejected = true }
    const afterReadback = (await outbox.list(PROFILE))[0].status
    const committed = await outbox.retry(PROFILE)
    await outbox.enqueue({ profileId: PROFILE, kind: 'food_diary', recordId: 'entry-1',
      operationId: OP2, expectedRevision: 0, schemaVersion: 1, candidate: { amount: 2 } })
    const conflict = await outbox.retry(PROFILE)
    const retained = await outbox.list(PROFILE)
    return { lostRejected, afterLost, readbackRejected, afterReadback,
      committed, conflict, retained, serverRevision: revision }
  }, { A, PROFILE, OP1, OP2 })
  assert.equal(outcome.lostRejected, true)
  assert.equal(outcome.afterLost, 'pending')
  assert.equal(outcome.readbackRejected, true)
  assert.equal(outcome.afterReadback, 'pending')
  assert.deepEqual(outcome.committed, [{ operationId: OP1, status: 'committed', revision: 1 }])
  assert.deepEqual(outcome.conflict, [{ operationId: OP2, status: 'conflict', revision: 1, snapshotId: OP2 }])
  assert.equal(outcome.serverRevision, 1)
  assert.deepEqual(outcome.retained.map(item => [item.status, item.candidate.amount]),
    [['committed', 1], ['conflict', 2]])
  const race = await Promise.allSettled([a, b].map((page, index) => page.evaluate(async ({ A, PROFILE, OP3, index }) => {
    const { createGrapesTestOutbox } = await import('/Grapes/src/sync/grapes-test-outbox.js')
    return createGrapesTestOutbox({ userId: A,
      gateway: { compareAndSwap() {}, readAttempt() {} } }).enqueue({
      profileId: PROFILE, kind: 'food_diary', recordId: 'entry-race', operationId: OP3,
      expectedRevision: 0, schemaVersion: 1, candidate: { amount: index + 10 },
    })
  }, { A, PROFILE, OP3, index })))
  assert.deepEqual(race.map(result => result.status).sort(), ['fulfilled', 'rejected'])
  console.log('PASS: durable TEST outbox survives reload, isolates accounts, retries lost writes and retains conflicts')
} finally { await browser?.close(); server.kill() }
