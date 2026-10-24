import {
  inventoryV24FoodSnapshot, inventoryV24WaterSnapshot
} from './grapes-health-v24-inventory.js'

const FOOD_DB = 'grapes-projects'
const FOOD_STORE = 'projects'
const WATER_KEY = 'grapes-water-v1'

function readExistingProjects(indexedDb) {
  if (!indexedDb?.open) throw new Error('IndexedDB is unavailable')
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(FOOD_DB)
    let absent = false
    request.onupgradeneeded = () => {
      // An absent database must not be created by a read-only scan.
      absent = true
      request.transaction.abort()
    }
    request.onerror = () => {
      if (absent) resolve([])
      else reject(request.error || new Error('Food database cannot be opened'))
    }
    request.onblocked = () => reject(new Error('Food database read is blocked'))
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FOOD_STORE)) {
        db.close()
        reject(new Error('Food project store is missing'))
        return
      }
      let rows
      try {
        const tx = db.transaction(FOOD_STORE, 'readonly')
        tx.objectStore(FOOD_STORE).getAll().onsuccess = event => {
          rows = event.target.result
        }
        tx.oncomplete = () => { db.close(); resolve(rows || []) }
        tx.onerror = () => { const error = tx.error; db.close(); reject(error) }
        tx.onabort = () => {
          const error = tx.error || new Error('Food read transaction aborted')
          db.close()
          reject(error)
        }
      } catch (error) { db.close(); reject(error) }
    }
  })
}

async function snapshotHash(value, subtle) {
  if (!subtle?.digest) throw new Error('SHA-256 is unavailable')
  const bytes = new TextEncoder().encode(value)
  const digest = await subtle.digest('SHA-256', bytes)
  return 'sha256:' + [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Explicit call only. Reads existing app-origin Food and Water stores without
 * creating or modifying them. The returned inventories remain unowned and
 * cannot authorize migration. Keep raw payloads within the app origin.
 */
export async function captureV24LocalHealthSources({
  indexedDb = globalThis.indexedDB,
  storage = globalThis.localStorage,
  subtle = globalThis.crypto?.subtle
} = {}) {
  if (!storage?.getItem) throw new Error('Local storage is unavailable')
  const projects = await readExistingProjects(indexedDb)
  const waterRaw = storage.getItem(WATER_KEY)
  const inventories = []
  const snapshots = []
  for (const project of projects) {
    if (!project || (project.module !== 'Ételnapló' &&
        !String(project.id || '').startsWith('food-tracker-'))) continue
    const version = await snapshotHash(JSON.stringify(project), subtle)
    inventories.push(inventoryV24FoodSnapshot({
      provider: 'indexeddb', sourceId: project.id, version, document: project
    }))
    snapshots.push({ provider: 'indexeddb', sourceId: project.id,
      version, document: project })
  }
  if (waterRaw !== null) {
    const version = await snapshotHash(waterRaw, subtle)
    inventories.push(inventoryV24WaterSnapshot({
      raw: waterRaw, version
    }))
    snapshots.push({ provider: 'localStorage', sourceId: WATER_KEY,
      version, raw: waterRaw })
  }
  return {
    inventories, snapshots,
    sourceCount: inventories.length,
    blockedCount: inventories.filter(item => !item.complete).length,
    // Never treat an empty local scan as a completed migration.
    originalSourcesUntouched: true
  }
}
