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
})
