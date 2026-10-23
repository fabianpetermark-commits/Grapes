import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(path => path && existsSync(path))
if (!browserPath) throw new Error('Chromium required for the read-only v24 inventory test')
const origin = 'http://127.0.0.1:4199'
const modules = new Map([
  ['/src/sync/grapes-health-v24-local-reader.js', 'src/sync/grapes-health-v24-local-reader.js'],
  ['/src/sync/grapes-health-v24-inventory.js', 'src/sync/grapes-health-v24-inventory.js']
])
const browser = await chromium.launch({
  executablePath: browserPath, headless: true, args: ['--no-sandbox']
})
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const outbound = []
  page.on('request', request => {
    if (!request.url().startsWith(origin + '/')) outbound.push(request.url())
  })
  await page.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname
    const modulePath = modules.get(path)
    if (modulePath) {
      await route.fulfill({
        status: 200, contentType: 'application/javascript',
        body: await readFile(resolve(root, modulePath), 'utf8')
      })
    } else if (path === '/start') {
      await route.fulfill({
        status: 200, contentType: 'text/html',
        body: '<!doctype html><title>synthetic v24 inventory</title>'
      })
    } else await route.fulfill({ status: 404, body: 'not found' })
  })
  await page.goto(origin + '/start')
  const result = await page.evaluate(async () => {
    const { captureV24LocalHealthSources } = await import(
      '/src/sync/grapes-health-v24-local-reader.js')
    const initially = await captureV24LocalHealthSources()
    const absentAfterRead = !(await indexedDB.databases())
      .some(db => db.name === 'grapes-projects')

    const open = indexedDB.open('grapes-projects', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('projects', { keyPath: 'id' })
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const food = {
      id: 'food-tracker-synthetic-profile', module: 'Ételnapló', updatedAt: '2026-10-23T00:00:00Z',
      data: { version: 2, profile: { id: 'synthetic-profile' },
        diaryEntries: [{ id: 'entry-1', profileId: 'synthetic-profile',
          origin: { profileId: 'synthetic-profile', source: 'yazio',
            sourceRecordId: 'y-1', sourceTimestamp: '2026-10-20T12:00:00Z' } }],
        customFoods: [], recipes: [], targets: [], importBatches: [] }
    }
    const finance = { id: 'finance-1', module: 'Pénzügyi Napló', data: { secret: 'synthetic' } }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put(food)
      tx.objectStore('projects').put(finance)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    const waterRaw = JSON.stringify({ '2026-10-20': {
      goal: 2100, entries: [{ id: 'water-1', amount: 250,
        at: '2026-10-20T12:00:00Z', externalKey: 'healthconnect:water-1' }]
    } })
    localStorage.setItem('grapes-water-v1', waterRaw)
    const captured = await captureV24LocalHealthSources()
    const verify = indexedDB.open('grapes-projects')
    const verifyDb = await new Promise((resolve, reject) => {
      verify.onsuccess = () => resolve(verify.result)
      verify.onerror = () => reject(verify.error)
    })
    const unchangedRows = await new Promise((resolve, reject) => {
      const tx = verifyDb.transaction('projects', 'readonly')
      const request = tx.objectStore('projects').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    verifyDb.close()
    return {
      initially, absentAfterRead,
      sourceCount: captured.sourceCount,
      ownerIds: captured.inventories.map(item => item.source.ownerId),
      providers: captured.inventories.map(item => item.source.provider),
      versions: captured.inventories.map(item => item.source.version),
      kinds: captured.inventories[0].source.records.map(item => item.kind),
      waterGoalBlocked: captured.inventories[1].unmapped.some(item => item.field === 'waterGoal'),
      externalKey: captured.inventories[1].source.records[0].payload.externalKey,
      unchangedRows, unchangedWater: localStorage.getItem('grapes-water-v1') === waterRaw
    }
  })
  assert.equal(result.initially.sourceCount, 0)
  assert.equal(result.absentAfterRead, true, 'read-only scan must not create a database')
  assert.equal(result.sourceCount, 2)
  assert.deepEqual(result.ownerIds, [null, null])
  assert.deepEqual(result.providers, ['indexeddb', 'localStorage'])
  assert.ok(result.versions.every(version => /^sha256:[0-9a-f]{64}$/.test(version)))
  assert.deepEqual(result.kinds, ['food_diary'])
  assert.equal(result.waterGoalBlocked, true)
  assert.equal(result.externalKey, 'healthconnect:water-1')
  assert.equal(result.unchangedRows.length, 2)
  assert.equal(result.unchangedRows.find(row => row.module === 'Ételnapló')
    .data.diaryEntries[0].id, 'entry-1')
  assert.equal(result.unchangedWater, true)
  assert.deepEqual(outbound, [])
  await context.close()
  console.log('v24 IndexedDB/Water read-only inventory: no creation, mutation or network request')
} finally {
  await browser.close()
}
