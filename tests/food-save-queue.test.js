import test from 'node:test'
import assert from 'node:assert/strict'
import { createFoodSaveQueue } from '../src/food/food-save-queue.js'

const project = (id, entries = []) => ({ profile: { id }, diaryEntries: entries, recipes: [], schemaVersion: 1, syncState: { localDirty: true } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const memory = () => { const data = new Map(); return {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] ?? null,
  get length() { return data.size },
  data
} }

test('azonnali journal, soros IndexedDB-írás és befejezés utáni állapot', async () => {
  const storage = memory(), gates = [deferred(), deferred()], writes = [], statuses = []
  const queue = createFoodSaveQueue({ storage, randomId: (() => { let n = 0; return () => String(++n) })(),
    save: async row => { writes.push(row); await gates[writes.length - 1].promise }, onStatus: (...state) => statuses.push(state) })
  const first = queue.enqueue({ data: project('a', [{ id: 'old' }]) })
  const second = queue.enqueue({ data: project('a', [{ id: 'old' }, { id: 'new' }]) })
  assert.equal(queue.pending('a').data.diaryEntries.length, 2)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes.length, 1)
  assert.equal(statuses.some(x => x[1] === 'saved'), false)
  gates[0].resolve(); await first
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes.length, 2)
  assert.equal(queue.pending('a').data.diaryEntries.length, 2)
  gates[1].resolve(); await second
  assert.equal(queue.pending('a'), null)
  assert.equal(statuses.at(-1)[1], 'saved')
  assert.deepEqual(writes.at(-1).data.diaryEntries.map(x => x.id), ['old', 'new'])
})

test('hibás tranzakció után a journal és az előző tartós snapshot megmarad', async () => {
  const storage = memory(), durable = project('a', [{ id: 'safe' }]), states = []
  const queue = createFoodSaveQueue({ storage, save: async () => { throw new Error('QuotaExceededError') }, onStatus: (...x) => states.push(x) })
  await assert.rejects(queue.enqueue({ data: project('a', [{ id: 'safe' }, { id: 'new' }]) }), /QuotaExceededError/)
  assert.deepEqual(durable.diaryEntries.map(x => x.id), ['safe'])
  assert.equal(queue.pending('a').data.diaryEntries.length, 2)
  assert.equal(states.at(-1)[1], 'failed')
})

test('restart, offline és profilváltás: csak a saját profilt állítja helyre', async () => {
  const storage = memory(), rows = new Map(), save = async row => rows.set(row.id, structuredClone(row))
  const first = createFoodSaveQueue({ storage, save: async () => { throw new Error('offline storage') }, randomId: () => 'pending-a' })
  await assert.rejects(first.enqueue({ data: project('a', [{ id: 'A' }]) }))
  const restarted = createFoodSaveQueue({ storage, save, randomId: () => 'recovered-a' })
  assert.equal(restarted.pending('a').data.diaryEntries[0].id, 'A')
  assert.equal(restarted.pending('b'), null)
  await restarted.enqueue({ data: restarted.pending('a').data })
  assert.equal(restarted.pending('a', rows.get('food-tracker-a')), null)
  assert.equal(restarted.allRaw('a').length, 0)
  await restarted.enqueue({ data: project('b', [{ id: 'B' }]) })
  assert.deepEqual(rows.get('food-tracker-a').data.diaryEntries.map(x => x.id), ['A'])
  assert.deepEqual(rows.get('food-tracker-b').data.diaryEntries.map(x => x.id), ['B'])
})

test('tartósan mentett token után a félbeszakadt journal törölhető', async () => {
  const storage = memory(); const queue = createFoodSaveQueue({ storage, save: async () => {}, randomId: () => 'one' })
  const task = queue.enqueue({ data: project('a') })
  const journal = queue.pending('a')
  assert.equal(queue.pending('a', { saveToken: journal.token }), null)
  await task
})

test('journal storage failure cannot report a queued save', async () => {
  let writes = 0
  const storage = { getItem: () => null, setItem: () => {
    throw new Error('synthetic quota')
  } }
  const queue = createFoodSaveQueue({ storage, save: async () => { writes++ } })
  assert.throws(() => queue.enqueue({ data: project('a', [{ id: 'unsaved' }]) }),
    /synthetic quota/)
  assert.equal(writes, 0)
})

