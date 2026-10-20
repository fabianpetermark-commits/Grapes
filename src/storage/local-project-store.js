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

