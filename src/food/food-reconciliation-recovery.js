// Recovery snapshots use a separate IndexedDB database. Never place backup
// records in the visible Grapes Projects list and never synchronize them.
const DB = 'grapes-food-reconciliation-recovery'
const STORE = 'snapshots'
function open() {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DB,1)
    request.onupgradeneeded=()=>{
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'id'})
    }
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error || new Error('A helyi biztonsági tároló nem nyitható meg.'))
  })
}
export async function saveFoodReconciliationRecovery(snapshot) {
  if (!snapshot?.id || !snapshot.localProject || !snapshot.remoteProject || !snapshot.remoteFileId ||
      !snapshot.accountEmail || typeof snapshot.waterJson !== 'string') throw new Error('Hiányos helyreállítási mentés.')
  const db = await open()
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite')
      tx.objectStore(STORE).add(structuredClone(snapshot))
      tx.oncomplete=resolve
      tx.onerror=()=>reject(tx.error || new Error('A biztonsági másolat mentése sikertelen.'))
      tx.onabort=()=>reject(tx.error || new Error('A biztonsági másolat mentése megszakadt.'))
    })
  } finally {db.close()}
  const saved=await loadFoodReconciliationRecovery(snapshot.id)
  if (!saved || JSON.stringify(saved) !== JSON.stringify(snapshot)) {
    throw new Error('A helyreállítási mentés épsége nem ellenőrizhető.')
  }
  return snapshot.id
}
export async function loadFoodReconciliationRecovery(id) {
  if (!id || typeof id !== 'string') return null
  const db=await open()
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly')
      const request=tx.objectStore(STORE).get(id)
      request.onsuccess=()=>resolve(request.result || null)
      request.onerror=()=>reject(request.error || new Error('A biztonsági másolat nem olvasható.'))
      tx.onabort=()=>reject(tx.error)
    })
  } finally {db.close()}
}
