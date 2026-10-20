import test from 'node:test'
import assert from 'node:assert/strict'
import { saveLocalFoodProject } from '../src/storage/local-project-store.js'

const row = (id, token, expected = null) => ({ id: 'food-tracker-synthetic', module: 'Ételnapló', name: 'Ételnapló',
  data: { profile: { id: 'synthetic' }, diaryEntries: [{ id }] }, saveToken: token, expectedSaveToken: expected })

function fakeIndexedDb(initial = null) {
  const records = new Map(initial ? [[initial.id, structuredClone(initial)]] : [])
  let failPut = false
  return { records, failNextPut: () => { failPut = true }, open: () => {
    const openRequest = {}
    queueMicrotask(() => {
      openRequest.result = { close: () => {}, transaction: () => {
        const staged = new Map()
        const tx = { error: null, objectStore: () => ({
          get: id => {
            const request = { result: structuredClone(records.get(id)) }
            queueMicrotask(() => {
              try { request.onsuccess() }
              catch (error) { tx.error = error; tx.onabort() ; return }
              queueMicrotask(() => { for (const [key, value] of staged) records.set(key, value); tx.oncomplete() })
            })
            return request
          },
          put: value => { if (failPut) { failPut = false; throw new Error('QuotaExceededError') } staged.set(value.id, structuredClone(value)) },
        }) }
        return tx
      } }
      openRequest.onsuccess()
    })
    return openRequest
  } }
}

test('a Food tokenellenőrzés és a két változat mentése egy tranzakcióban történik', async () => {
  const previous = globalThis.indexedDB
  const db = fakeIndexedDb(row('baseline', 'base'))
  globalThis.indexedDB = db
  try {
    await saveLocalFoodProject(row('A', 'A-token', 'base'))
    let conflict
    try { await saveLocalFoodProject(row('B', 'B-token', 'base')) } catch (error) { conflict = error }
    assert.equal(conflict?.code, 'FOOD_LOCAL_SAVE_CONFLICT')
    assert.equal(db.records.get('food-tracker-synthetic').data.diaryEntries[0].id, 'A')
    assert.equal(db.records.get(conflict.recoveryId).data.diaryEntries[0].id, 'B')
    assert.equal(db.records.get(conflict.recoveryId).originalId, 'food-tracker-synthetic')
  } finally { globalThis.indexedDB = previous }
})

test('kvótahibás konfliktusarchiválás nem írja felül a commitolt Food-rekordot', async () => {
  const previous = globalThis.indexedDB
  const db = fakeIndexedDb(row('committed', 'newer'))
  globalThis.indexedDB = db
  try {
    db.failNextPut()
    await assert.rejects(saveLocalFoodProject(row('stale', 'loser', 'old')), /QuotaExceededError/)
    assert.equal(db.records.size, 1)
    assert.equal(db.records.get('food-tracker-synthetic').data.diaryEntries[0].id, 'committed')
  } finally { globalThis.indexedDB = previous }
})

test('korábbi token nélküli Food-rekord egyszer biztonságosan felveheti az új revíziót', async () => {
  const previous = globalThis.indexedDB
  const db = fakeIndexedDb({ id: 'food-tracker-synthetic', data: { profile: { id: 'synthetic' }, diaryEntries: [{ id: 'legacy' }] } })
  globalThis.indexedDB = db
  try {
    await saveLocalFoodProject(row('converted', 'new-token'))
    assert.equal(db.records.get('food-tracker-synthetic').saveToken, 'new-token')
    assert.equal(db.records.get('food-tracker-synthetic').data.diaryEntries[0].id, 'converted')
  } finally { globalThis.indexedDB = previous }
})
