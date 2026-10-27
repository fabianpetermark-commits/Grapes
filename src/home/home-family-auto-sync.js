import { projectOneHomeFamilyPreview } from './home-family-preview-model.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = message => { throw new Error(message) }

/**
 * TEST-only, UI-facing foreground sync coordinator for the approved One Home.
 * Accepts ONLY an explicitly injected, owner-pinned v2 CAS/outbox capability.
 * Does not touch local Home v1, manage Supabase tokens, or run in PROD by default.
 *
 * Enqueued operations are persisted by the outbox BEFORE a network attempt.
 * On online / foreground return or explicit retry, the same operation ID is
 * replayed and its read_attempt proof is verified by the lower-level outbox.
 * Conflicts never rebase or silently overwrite another household member.
 */
export function createHomeFamilyAutoSync({
  sync, householdId, expectedUserId, getActiveOwner, onChange,
  eventTarget = globalThis.window,
  documentTarget = globalThis.document,
  isOnline = () => globalThis.navigator?.onLine !== false,
} = {}) {
  if (!UUID.test(householdId || '') || !UUID.test(expectedUserId || '') ||
      sync?.ownerId?.toLowerCase() !== expectedUserId.toLowerCase() ||
      !['pending','cached','refresh','queue','retry'].every(key => typeof sync?.[key] === 'function') ||
      typeof getActiveOwner !== 'function' || typeof onChange !== 'function')
    fail('Hiányzó vagy eltérő fiókhoz kötött családi TEST-szinkron.')
  const homeId = householdId.toLowerCase()
  const owner = expectedUserId.toLowerCase()
  let live = false
  let generation = 0
  let busy = false
  let snapshot = null
  let status = 'unverified'
  let count = 0
  let message = ''
  const publish = () => {
    if (!live) return
    onChange({ status, count, message, snapshot: snapshot ? structuredClone(snapshot) : null })
  }
  const update = (next, text = '', quantity = count) => {
    status = next
    message = text
    count = quantity
    publish()
  }
  async function pin(epoch) {
    if (!live || epoch !== generation) fail('A családi Otthon munkamenete megszűnt.')
    let active
    try { active = await getActiveOwner() } catch { active = null }
    if (!live || epoch !== generation || typeof active !== 'string' ||
        active.toLowerCase() !== owner) {
      generation += 1
      snapshot = null
      update('unverified', 'Fiókváltás történt; a korábbi közös Otthon adatai elrejtve.', 0)
      fail('Fiókváltás történt; a korábbi családi Otthon nem olvasható.')
    }
  }
  const projection = (state, role) => projectOneHomeFamilyPreview({
    householdId:homeId, role, revision:state.revision,
    inventory:state.inventory, shopping:state.shopping,
  }, homeId)
  async function reconciliate({ retryPending = false } = {}) {
    if (!live || busy) return
    const epoch = generation
    busy = true
    try {
      await pin(epoch)
      const jobs = await sync.pending(homeId)
      await pin(epoch)
      const conflict = jobs.filter(x => x.status === 'conflict')
      const pending = jobs.filter(x => x.status === 'pending')
      if (conflict.length) {
        // No guessed rebase; preserve rejected proposal in the persistent outbox.
        snapshot = null
        update('conflict', 'Ütközés: a módosítás megmaradt, kézi egyeztetés szükséges.', conflict.length + pending.length)
        return
      }
      if (pending.length) {
        if (pending.length !== 1) fail('Több függő családi művelet csak kézzel rendezhető.')
        const cached = await sync.cached(homeId)
        await pin(epoch)
        if (!cached || cached.ownerId !== owner || cached.householdId !== homeId ||
            !['owner','editor'].includes(cached.role))
          fail('A függő módosításhoz nincs ellenőrzött családi alapállapot.')
        snapshot = projection(pending[0].candidate, cached.role)
        update('pending', '1 módosítás várakozik a felhőbe mentésre.', 1)
        if (!retryPending || !isOnline()) return
        const result = await sync.retry(homeId)
        await pin(epoch)
        if (result?.status === 'conflict') {
          snapshot = null
          update('conflict', 'Ütközés: a változás megmaradt; kézi egyeztetés szükséges.', 1)
          return
        }
        if (result?.status !== 'committed') fail('A módosítás távoli mentése nem igazolható.')
      }
      if (!isOnline()) {
        const cached = await sync.cached(homeId)
        await pin(epoch)
        snapshot = cached ? projection(cached.state, cached.role) : null
        update('offline', 'Nincs kapcsolat. A korábban ellenőrzött adatok láthatók.', 0)
        return
      }
      const verified = await sync.refresh(homeId)
      await pin(epoch)
      if (verified?.ownerId !== owner || verified?.householdId !== homeId ||
          !['owner','editor','viewer'].includes(verified.role) ||
          verified.revision !== verified.state?.revision)
        fail('A közös Otthon szerverállapota nem ellenőrizhető.')
      snapshot = projection(verified.state, verified.role)
      update('synced', 'Szinkronizálva · ellenőrzött közös Otthon.', 0)
    } catch (error) {
      if (!live || epoch !== generation) return
      // Never claim "synced" after an ambiguous remote response.
      if (status === 'pending' || status === 'conflict') {
        update(status, status === 'pending'
          ? 'A módosítás helyben megmaradt; újrapróbálás szükséges.'
          : message, count)
      } else {
        snapshot = null
        update('unverified', 'A családi adatok most nem ellenőrizhetők.', 0)
      }
    } finally {
      busy = false
    }
  }
  const resume = () => { void reconciliate({ retryPending:true }) }
  const foreground = () => {
    if (documentTarget?.visibilityState === 'visible') resume()
  }
  return Object.freeze({
    start() {
      if (live) return
      live = true
      generation += 1
      eventTarget?.addEventListener?.('online', resume)
      documentTarget?.addEventListener?.('visibilitychange', foreground)
      update('checking', 'Családi Otthon ellenőrzése...', 0)
      void reconciliate({ retryPending:true })
    },
    async queue(command) {
      const epoch = generation
      if (!live || busy || status === 'conflict' || status === 'pending' ||
          !snapshot || !['owner','editor'].includes(snapshot.role))
        fail('Előbb rendezd a családi Otthon függő műveletét.')
      await pin(epoch)
      busy = true
      let job
      try {
        job = await sync.queue(homeId, command)
        await pin(epoch)
        if (job?.ownerId !== owner || job?.householdId !== homeId ||
            job?.operationId !== command.eventId || job?.status !== 'pending')
          fail('A tartós kimenő családi művelet visszaolvasása eltér.')
        snapshot = projection(job.candidate, snapshot.role)
        update('pending', '1 módosítás várakozik a felhőbe mentésre.', 1)
      } finally {
        busy = false
      }
      // No timer, polling, or unchecked background writes. One single attempt
      // after the durable local commit; later retries on connectivity/foreground.
      if (isOnline()) void reconciliate({ retryPending:true })
      return job
    },
    retry() { return reconciliate({ retryPending:true }) },
    dispose() {
      if (!live) return
      live = false
      generation += 1
      eventTarget?.removeEventListener?.('online', resume)
      documentTarget?.removeEventListener?.('visibilitychange', foreground)
      snapshot = null
      status = 'unverified'
      count = 0
    },
  })
}
