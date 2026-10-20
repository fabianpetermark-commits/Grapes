import test from 'node:test'
import assert from 'node:assert/strict'
import { saveLocalProject } from '../src/storage/local-project-store.js'

test('helyi mentés csak a teljes IndexedDB tranzakció után sikeres', async () => {
  const previous = globalThis.indexedDB
  let tx, put, closeCount = 0
  globalThis.indexedDB = { open: () => {
    const request = {}
    queueMicrotask(() => { request.result = { transaction: () => {
      tx = { objectStore: () => ({ put: value => { put = value } }) }
      return tx
    }, close: () => { closeCount += 1 } }; request.onsuccess() })
    return request
  } }
  try {
    let settled = false
    const saving = saveLocalProject({ id: 'food-tracker-a', data: { diaryEntries: [{ id: 'one' }] } }).then(() => { settled = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(put.data.diaryEntries[0].id, 'one')
    assert.equal(settled, false)
    tx.oncomplete()
    await saving
    assert.equal(settled, true)
    assert.equal(closeCount, 1)
  } finally { globalThis.indexedDB = previous }
})

test('megszakított vagy kvótahibás tranzakció nem állíthat sikeres mentést', async () => {
  const previous = globalThis.indexedDB
  let tx
  globalThis.indexedDB = { open: () => {
    const request = {}
    queueMicrotask(() => { request.result = { transaction: () => {
      tx = { error: new Error('QuotaExceededError'), objectStore: () => ({ put: () => {} }) }
      return tx
    }, close: () => {} }; request.onsuccess() })
    return request
  } }
  try {
    const saving = saveLocalProject({ id: 'food-tracker-a', data: {} })
    await new Promise(resolve => setImmediate(resolve))
    tx.onabort()
    await assert.rejects(saving, /QuotaExceededError/)
  } finally { globalThis.indexedDB = previous }
})
