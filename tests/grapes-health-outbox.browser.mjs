import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium/Chrome executable is required')
const url = 'http://127.0.0.1:4198/Grapes/login-preview.html'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1', '--port', '4198', '--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (i === 79) throw new Error('Vite failed to start')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.goto(url)
  const owner = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const first = await page.evaluate(async ownerId => {
    const { enqueueHealthOperation, listHealthOperations, retryHealthOperations } =
      await import('/Grapes/src/sync/grapes-health-outbox.js')
    const operationId = await enqueueHealthOperation({
      ownerId, profileId: 'grapes:synthetic-a', kind: 'food_diary', recordId: 'entry-a',
      expectedRevision: 0, schemaVersion: 1, payload: { id: 'entry-a', value: 7 },
      localSaveToken: 'local-commit-a'
    })
    const client = { auth: { getUser: async () => ({ data: { user: { id: ownerId } } }) },
      schema: () => ({ rpc: async () => ({ error: new Error('offline') }) }) }
    const outcome = await retryHealthOperations({ client, ownerId, profileId: 'grapes:synthetic-a' })
    return { operationId, outcome, rows: await listHealthOperations(ownerId, 'grapes:synthetic-a') }
  }, owner)
  assert.equal(first.outcome.unknown, 1)
  assert.equal(first.rows[0].state, 'pending')
  assert.equal(first.rows[0].candidateJson, '{"id":"entry-a","value":7}')
  await page.reload()
  const switched = await page.evaluate(async ({ ownerId, otherId }) => {
    const { retryHealthOperations, listHealthOperations } =
      await import('/Grapes/src/sync/grapes-health-outbox.js')
    let current = ownerId
    const client = { auth: { getUser: async () => ({ data: { user: { id: current } } }) },
      schema: () => ({ rpc: async () => {
        current = otherId
        return { data: { status: 'committed', revision: 1 } }
      } }) }
    const result = await retryHealthOperations({ client, ownerId, profileId: 'grapes:synthetic-a' })
    return { result, rows: await listHealthOperations(ownerId, 'grapes:synthetic-a') }
  }, { ownerId: owner, otherId: other })
  assert.equal(switched.result.status, 'paused')
  assert.equal(switched.rows[0].state, 'pending', 'Late response must not mark prior account synced')
  const resumed = await page.evaluate(async ownerId => {
    const { retryHealthOperations, listHealthOperations } =
      await import('/Grapes/src/sync/grapes-health-outbox.js')
    const calls = []
    const client = { auth: { getUser: async () => ({ data: { user: { id: ownerId } } }) },
      schema: () => ({ rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: { status: 'committed', revision: 1 } }
      } }) }
    const result = await retryHealthOperations({ client, ownerId, profileId: 'grapes:synthetic-a' })
    return { result, calls, rows: await listHealthOperations(ownerId, 'grapes:synthetic-a') }
  }, owner)
  assert.equal(resumed.result.committed, 1)
  assert.equal(resumed.calls[0].args.p_operation_id, first.operationId)
  assert.deepEqual(resumed.calls[0].args.p_candidate, { id: 'entry-a', value: 7 })
  assert.equal(resumed.rows[0].state, 'synced')
  const conflict = await page.evaluate(async ownerId => {
    const { enqueueHealthOperation, listHealthOperations, retryHealthOperations } =
      await import('/Grapes/src/sync/grapes-health-outbox.js')
    const operationId = await enqueueHealthOperation({
      ownerId, profileId: 'grapes:synthetic-a', kind: 'water_entry', recordId: 'water-a',
      expectedRevision: 0, schemaVersion: 1, payload: { sourceId: 'water-a' },
      localSaveToken: 'local-commit-b'
    })
    const client = { auth: { getUser: async () => ({ data: { user: { id: ownerId } } }) },
      schema: () => ({ rpc: async () => ({ data: { status: 'conflict', revision: 1,
        snapshotId: operationId } }) }) }
    const result = await retryHealthOperations({ client, ownerId, profileId: 'grapes:synthetic-a' })
    let duplicateRejected = false
    try {
      await enqueueHealthOperation({ ownerId, profileId: 'grapes:synthetic-a',
        kind: 'water_entry', recordId: 'water-a', expectedRevision: 0,
        schemaVersion: 1, payload: { sourceId: 'changed' },
        localSaveToken: 'local-commit-c', operationId })
    } catch { duplicateRejected = true }
    return { result, duplicateRejected, rows: await listHealthOperations(ownerId, 'grapes:synthetic-a') }
  }, owner)
  assert.equal(conflict.result.conflicted, 1)
  assert.equal(conflict.duplicateRejected, true, 'Failed IndexedDB add must reject')
  assert.equal(conflict.rows.find(row => row.kind === 'water_entry').state, 'conflict')
  assert.equal(conflict.rows.find(row => row.kind === 'water_entry').result.snapshotId,
    conflict.rows.find(row => row.kind === 'water_entry').operationId)
  console.log('Phase 2 outbox: offline persistence, retry ID, account switch, conflict and aborted write PASS')
} finally {
  await browser?.close()
  server.kill()
}
