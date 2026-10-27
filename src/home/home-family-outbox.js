import { validateFamilyHome } from './home-family-data.js'

const DATABASE = 'grapes-test-one-home-family-outbox-v2'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key = value => {
  if (!UUID.test(value || '')) throw new Error('Érvénytelen családi szinkronazonosító.')
  return value.toLowerCase()
}
const stable = value => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)

function withDb(indexedDb, stores, mode, action) {
  if (!indexedDb?.open) return Promise.reject(new Error('Az offline Home-tárhely nem érhető el.'))
  return new Promise((resolve, reject) => {
    const open = indexedDb.open(DATABASE, 1)
    open.onupgradeneeded = () => {
      const db = open.result
      db.createObjectStore('snapshots', { keyPath: ['ownerId', 'householdId'] })
      const jobs = db.createObjectStore('jobs', { keyPath: 'operationId' })
      jobs.createIndex('household', ['ownerId', 'householdId'])
    }
    open.onerror = () => reject(open.error || new Error('Az offline Home-tárhely hibás.'))
    open.onblocked = () => reject(new Error('Az offline Home-tárhely megnyitása blokkolva van.'))
    open.onsuccess = () => {
      const db = open.result
      let tx, result, abortReason
      try {
        tx = db.transaction(stores, mode)
        action(tx, value => { result = value }, err => { abortReason = err; tx.abort() })
      } catch (error) { db.close(); reject(error); return }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onabort = () => { db.close(); reject(abortReason || tx.error || new Error('Az offline Home-mentés megszakadt.')) }
      tx.onerror = () => { /* tx abort reports the failure */ }
    }
  })
}

/**
 * Separate from individual Home and the Food/Water TEST outbox. One outstanding
 * proposal per household until the user reviews it; never speculative rebases.
 * Kept in IndexedDB before any network CAS, scoped by the native active owner.
 */
export function createHomeFamilyOutbox({
  ownerId, getActiveOwner, gateway, indexedDb = globalThis.indexedDB,
} = {}) {
  const owner = key(ownerId)
  if (typeof getActiveOwner !== 'function' ||
      !gateway?.verify || !gateway?.read || !gateway?.stage ||
      !gateway?.compareAndSwap || !gateway?.readAttempt)
    throw new Error('A közös Home-nak ellenőrzött natív fiók és CAS-kapu szükséges.')
  async function active() {
    if (key(await getActiveOwner()) !== owner) throw new Error('Fiókváltás történt. Más fiók offline művelete nem olvasható.')
  }
  async function jobsFor(householdId) {
    return withDb(indexedDb,['jobs'],'readonly',(tx,finish) => {
      const req = tx.objectStore('jobs').index('household').getAll([owner, householdId])
      req.onsuccess = () => finish(req.result)
    })
  }
  return Object.freeze({
    async refresh(householdId) {
      const id = key(householdId)
      await active()
      const verified = await gateway.read(id)
      await active()
      if (verified.householdId !== id || !['owner','editor','viewer'].includes(verified.role) ||
          verified.state.revision !== verified.revision)
        throw new Error('A családi Home szerverállapota nem igazolható.')
      const state = validateFamilyHome(verified.state,id)
      const record = {ownerId:owner,householdId:id,revision:verified.revision,
        role:verified.role,state}
      await withDb(indexedDb,['snapshots','jobs'],'readwrite',(tx,finish,abort) => {
        const pending = tx.objectStore('jobs').index('household').getAll([owner,id])
        pending.onsuccess = () => {
          if (pending.result.some(job => job.status !== 'committed'))
            return abort(new Error('Függő vagy ütköző művelet mellett nem cserélhető le a helyi pillanatkép.'))
          tx.objectStore('snapshots').put(record)
          finish(record)
        }
      })
      await active()
      return structuredClone(record)
    },
    async cached(householdId) {
      const id = key(householdId)
      await active()
      const saved = await withDb(indexedDb,['snapshots'],'readonly',(tx,finish) => {
        const req=tx.objectStore('snapshots').get([owner,id])
        req.onsuccess=()=>finish(req.result || null)
      })
      await active()
      return saved ? {...saved,state:validateFamilyHome(saved.state,id)} : null
    },
    async list(householdId) {
      const id=key(householdId)
      await active()
      const jobs=await jobsFor(id)
      await active()
      return jobs.map(job=>structuredClone(job))
    },
    async enqueue(householdId,command) {
      const id=key(householdId)
      await active()
      const proposed = await withDb(indexedDb,['jobs','snapshots'],'readwrite',(tx,finish,abort) => {
        const snapshots=tx.objectStore('snapshots')
        const jobs=tx.objectStore('jobs')
        const snapshot=snapshots.get([owner,id])
        snapshot.onsuccess=()=>{
          const base=snapshot.result
          if(!base) return abort(new Error('Először online töltsd le és ellenőrizd a családi Home-ot.'))
          const list=jobs.index('household').getAll([owner,id])
          list.onsuccess=()=>{
            if(list.result.some(job=>job.status!=='committed'))
              return abort(new Error('Ez a háztartás már tartalmaz függő változtatást; előbb azt rendezd.'))
            let staged
            try { staged=gateway.stage({current:{...base,householdId:id},command}) }
            catch(err){return abort(err)}
            const candidateJson=stable(staged.candidate)
            if(new TextEncoder().encode(candidateJson).length>1048576)
              return abort(new Error('Túl nagy családi szinkronjavaslat.'))
            const job={ownerId:owner,householdId:id,operationId:key(staged.operationId),
              expectedRevision:staged.expectedRevision,schemaVersion:staged.schemaVersion,
              candidate:staged.candidate,status:'pending',createdAt:new Date().toISOString()}
            // add() atomically rejects duplicate IDs, including concurrent tabs.
            jobs.add(job)
            finish(job)
          }
        }
      })
      await active()
      return structuredClone(proposed)
    },
    async retry(householdId) {
      const id=key(householdId)
      await active()
      const jobs=(await jobsFor(id)).filter(job=>job.status==='pending')
      if(jobs.length>1)throw new Error('Több függő Home-műveletet csak kézi ellenőrzéssel lehet feloldani.')
      if(!jobs.length)return null
      const job=jobs[0]
      await gateway.verify()
      await active()
      const result=await gateway.compareAndSwap({
        householdId:id,operationId:job.operationId,expectedRevision:job.expectedRevision,
        schemaVersion:job.schemaVersion,candidate:job.candidate,
      })
      await active()
      const proof=await gateway.readAttempt(job.operationId)
      await active()
      const expectedStatus=result.committed?'committed':'conflict'
      if(!proof || proof.householdId!==id ||
          proof.status!==expectedStatus ||
          proof.revision!==result.revision ||
          proof.expectedRevision!==job.expectedRevision ||
          stable(proof.candidate)!==stable(job.candidate) ||
          (result.committed && result.revision!==job.expectedRevision+1))
        throw new Error('A szerveroldali esemény visszaolvasása nem egyezik; a változás függőben marad.')
      const next = await withDb(indexedDb,['jobs'],'readwrite',(tx,finish,abort)=>{
        const store=tx.objectStore('jobs')
        const req=store.get(job.operationId)
        req.onsuccess=()=>{
          const saved=req.result
          if(!saved || saved.status!=='pending' ||
              saved.ownerId!==owner || saved.householdId!==id ||
              saved.expectedRevision!==job.expectedRevision ||
              stable(saved.candidate)!==stable(job.candidate))
            return abort(new Error('A helyi javaslat megváltozott; nem írható felül.'))
          const updated={...saved,status:expectedStatus,serverRevision:result.revision,
            settledAt:new Date().toISOString()}
          store.put(updated)
          finish(updated)
        }
      })
      await active()
      return structuredClone(next)
    },
  })
}
