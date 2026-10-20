const DB_NAME = 'grapes-projects'
const DB_VERSION = 1
const STORE = 'projects'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveLocalProject(project) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let tx
    try {
      tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ ...project, updatedAt: new Date().toISOString() })
    } catch (error) { db.close(); reject(error); return }
    // A successful put request is not durable until the transaction completes.
    tx.oncomplete = () => { db.close(); resolve(project.id) }
    tx.onabort = () => { const error = tx.error || new Error('A helyi tranzakció megszakadt.'); db.close(); reject(error) }
    tx.onerror = () => { /* The transaction's abort event owns the rejection. */ }
  })
}

// Food's primary record is updated only if the observed writer token still
// matches. The read, comparison and both writes share one IndexedDB transaction,
// so separate tabs cannot both replace the same baseline unnoticed.
export async function saveLocalFoodProject(project) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let tx, conflict = null
    try {
      tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(project.id)
      request.onsuccess = () => {
        const current = request.result
        const actualToken = current?.saveToken || null
        if (actualToken !== (project.expectedSaveToken || null)) {
          const recoveryId = `food-conflict-${project.data.profile.id}-${encodeURIComponent(project.saveToken)}`
          conflict = new Error('Egy másik lap újabb Food-adatot mentett. A saját változat külön helyi helyreállító példányban megmaradt.')
          conflict.code = 'FOOD_LOCAL_SAVE_CONFLICT'
          conflict.recoveryId = recoveryId
          store.put({ ...project, id: recoveryId, originalId: project.id, conflictWithToken: actualToken,
            updatedAt: new Date().toISOString() })
        } else {
          const { expectedSaveToken, ...record } = project
          store.put({ ...record, updatedAt: new Date().toISOString() })
        }
      }
      request.onerror = () => { /* The transaction abort owns the failure. */ }
    } catch (error) { db.close(); reject(error); return }
    tx.oncomplete = () => { db.close(); conflict ? reject(conflict) : resolve(project.id) }
    tx.onabort = () => { const error = tx.error || new Error('A helyi tranzakció megszakadt.'); db.close(); reject(error) }
    tx.onerror = () => { /* The abort event owns the rejection. */ }
  })
}

export async function loadLocalProject(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => { db.close(); resolve(request.result || null) }
    request.onerror = () => { const error = request.error; db.close(); reject(error) }
  })
}

export async function listLocalProjects(limit = 5) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => {
      db.close()
      const projects = (request.result || [])
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, limit)
      resolve(projects)
    }
    request.onerror = () => { const error = request.error; db.close(); reject(error) }
  })
}

