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
    tx.oncomplete = () => { db.close(); resolve(project.id) }
    tx.onabort = () => { const error = tx.error || new Error('A helyi tranzakció megszakadt.'); db.close(); reject(error) }
    tx.onerror = () => { /* Transaction abort owns the rejection. */ }
  })
}

// The current Food row and a stale writer's recovery copy are decided in
// one readwrite transaction, so two tabs cannot accept the same token.
export async function saveLocalFoodProject(project) {
  if (!project?.id?.startsWith('food-tracker-') ||
      project.data?.profile?.id !== project.id.slice('food-tracker-'.length) ||
      typeof project.saveToken !== 'string' || !project.saveToken) {
    throw new Error('Érvénytelen Food helyi mentés.')
  }
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
          const recoveryId = `food-conflict-${encodeURIComponent(project.data.profile.id)}-${encodeURIComponent(project.saveToken)}`
          conflict = new Error('Egy másik lap újabb Food-adatot mentett. A saját változat külön helyreállító példányban megmaradt.')
          conflict.code = 'FOOD_LOCAL_SAVE_CONFLICT'
          conflict.recoveryId = recoveryId
          store.add({ ...project, id: recoveryId, originalId: project.id,
            conflictWithToken: actualToken, updatedAt: new Date().toISOString() })
        } else {
          const { expectedSaveToken, ...record } = project
          store.put({ ...record, updatedAt: new Date().toISOString() })
        }
      }
      request.onerror = () => { /* Transaction abort owns the rejection. */ }
    } catch (error) { db.close(); reject(error); return }
    tx.oncomplete = () => { db.close(); conflict ? reject(conflict) : resolve(project.id) }
    tx.onabort = () => { const error = tx.error || new Error('A helyi tranzakció megszakadt.'); db.close(); reject(error) }
    tx.onerror = () => { /* Transaction abort owns the rejection. */ }
  })
}

const WATER_LEGACY_OWNER_ID = 'water-legacy-owner-v1'

// One IndexedDB readwrite transaction assigns the unscoped legacy Water
// source to at most one profile. A failed later copy can be retried by that
// same profile; the original localStorage bytes are never deleted.
export async function claimLocalWaterOwner(profileId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new Error('Érvénytelen TEST Water-profil.')
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const rows = tx.objectStore(STORE)
    let owner = null
    const request = rows.get(WATER_LEGACY_OWNER_ID)
    request.onsuccess = () => {
      owner = request.result?.profileId || null
      if (owner && owner !== profileId) {
        tx.abort()
        return
      }
      if (!owner) rows.add({ id: WATER_LEGACY_OWNER_ID, profileId, claimedAt: new Date().toISOString() })
    }
    request.onerror = () => { /* Transaction abort owns the rejection. */ }
    tx.oncomplete = () => { db.close(); resolve(profileId) }
    tx.onabort = () => {
      db.close()
      reject(owner && owner !== profileId
        ? new Error('A régi Víz napló már másik TEST-profilhoz tartozik.')
        : tx.error || new Error('A Víz profilhoz rendelése megszakadt.'))
    }
  })
}

export async function getLocalWaterOwner() {
  return (await loadLocalProject(WATER_LEGACY_OWNER_ID))?.profileId || null
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
        .filter(project => project.id !== WATER_LEGACY_OWNER_ID)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, limit)
      resolve(projects)
    }
    request.onerror = () => { const error = request.error; db.close(); reject(error) }
  })
}
