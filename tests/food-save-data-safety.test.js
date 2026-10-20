import test from 'node:test'
import assert from 'node:assert/strict'
import { createFoodSaveQueue } from '../src/food/food-save-queue.js'

const data = id => ({ profile: { id: 'synthetic' }, diaryEntries: [{ id }], syncState: { localDirty: true } })

test('a régi journal nem állítható vissza frissebb, már commitolt Food-rekord fölé', async () => {
  const bytes = new Map(), rows = new Map()
  const stamp = Date.parse('2026-10-20T12:00:00.000Z')
  let quota = false, sequence = 0
  const storage = {
    getItem: key => bytes.get(key) ?? null,
    setItem: (key, value) => { if (quota) { quota = false; throw new Error('QuotaExceededError') } bytes.set(key, value) },
    removeItem: () => { throw new Error('remove blocked') },
  }
  const save = async row => rows.set(row.id, { ...row, updatedAt: new Date(stamp).toISOString() })
  const queue = createFoodSaveQueue({ storage, save, now: () => stamp, randomId: () => String(++sequence) })
  await queue.enqueue({ data: data('old') })
  quota = true
  await queue.enqueue({ data: data('new') })
  const committed = rows.get('food-tracker-synthetic')
  assert.equal(committed.data.diaryEntries[0].id, 'new')
  const restarted = createFoodSaveQueue({ storage, save, now: () => stamp, randomId: () => String(++sequence) })
  assert.throws(() => restarted.pending('synthetic', committed), /eltér|konfliktus|újabb/i)
  assert.equal(JSON.parse(bytes.get(queue.keyFor('synthetic'))).data.diaryEntries[0].id, 'old')
  restarted.observe('synthetic', committed)
  assert.throws(() => restarted.enqueue({ data: data('third') }), /eltér|konfliktus/i)
  assert.equal(JSON.parse(bytes.get(queue.keyFor('synthetic'))).data.diaryEntries[0].id, 'old')
})

test('közbenső commit után a későbbi ugyanazon sorból származó journal visszaállítható', async () => {
  const bytes = new Map(), rows = new Map()
  const storage = { getItem: key => bytes.get(key) ?? null, setItem: (key, value) => bytes.set(key, value), removeItem: () => {} }
  let seq = 0, releaseSecond
  const secondGate = new Promise(resolve => { releaseSecond = resolve })
  const save = async row => { if (row.saveToken === '2') await secondGate; rows.set(row.id, { ...row, updatedAt: new Date().toISOString() }) }
  const queue = createFoodSaveQueue({ storage, save, randomId: () => String(++seq) })
  const first = queue.enqueue({ data: data('first') })
  const second = queue.enqueue({ data: data('second') })
  await first
  const committed = rows.get('food-tracker-synthetic')
  assert.equal(committed.data.diaryEntries[0].id, 'first')
  const restart = createFoodSaveQueue({ storage, save })
  assert.equal(restart.pending('synthetic', committed).data.diaryEntries[0].id, 'second')
  releaseSecond(); await second
})

test('régi v1 journal is megmarad és ütközést jelez eltérő commit mellett', () => {
  const bytes = new Map()
  const storage = { getItem: key => bytes.get(key) ?? null, setItem: (key, value) => bytes.set(key, value), removeItem: key => bytes.delete(key) }
  const queue = createFoodSaveQueue({ storage, save: async () => {} })
  bytes.set(queue.keyFor('synthetic'), JSON.stringify({ version: 1, profileId: 'synthetic', token: 'legacy-pending', recordedAt: 1, data: data('pending') }))
  const committed = { saveToken: 'newer', updatedAt: new Date(1).toISOString(), data: data('committed') }
  assert.throws(() => queue.pending('synthetic', committed), /eltér|konfliktus/i)
  assert.equal(JSON.parse(bytes.get(queue.keyFor('synthetic'))).data.diaryEntries[0].id, 'pending')
})
