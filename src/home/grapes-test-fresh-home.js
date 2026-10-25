import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from '../storage/grapes-test-local-owner-store.js'
import { applyHomeCommand, createHomeState, validateHomeState } from './home-data.js'

// Brand new empty Home for a verified native Grapes TEST subject.
// Never read, claim, copy, delete or automatically migrate HOME_KEY/HOME_PREVIOUS_KEY.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECORD_ID = 'home-current'
const MODULE = 'Home'
const SCHEMA = 2

function ownedState(candidate, ownerId) {
  const state = structuredClone(candidate)
  const migrated = validateHomeState(state) // Includes complete replay of confirmed event history.
  if (migrated.householdId !== ownerId || migrated.actorId !== ownerId) {
    throw new Error('A Home készlete vagy eseménynaplója másik Grapes-fiókhoz tartozik.')
  }
  return migrated
}

/**
 * TEST-only independent per-user Home repository.
 * The current Home is individual, NOT shared family stock or receipt ingestion.
 * CAS snapshot and previous valid snapshot are committed atomically in the same
 * IndexedDB owner document, without touching any legacy localStorage keys.
 */
export async function openGrapesTestFreshHome({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  if (!enabled || !isAndroid() || !(await authEnabled())) {
    throw new Error('A Home saját TEST-fióktárhelye nem aktív.')
  }
  const subject = await getSubject()
  if (typeof subject !== 'string' || !UUID.test(subject)) {
    throw new Error('A Home natív Grapes-fiókazonosító nem ellenőrizhető.')
  }
  const ownerId = subject.toLowerCase()
  let invalid = false
  let poisoned = null
  let revision = 0
  let state = createHomeState({ householdId: ownerId, actorId: ownerId })
  let previous = null
  let queue = Promise.resolve()

  async function verify() {
    if (invalid) throw new Error('A korábbi Home-munkamenet már nem használható.')
    try {
      if (!(await authEnabled()) || (await getSubject())?.toLowerCase() !== ownerId) {
        throw new Error('A Grapes-fiók megváltozott; a Home hozzáférés leállt.')
      }
    } catch (error) {
      invalid = true
      throw error
    }
    return ownerId
  }

  const store = createGrapesTestLocalOwnerStore({
    enabled: true, indexedDb, getVerifiedSubject: verify,
  })

  async function read() {
    await verify()
    const row = await store.read(RECORD_ID)
    if (row && (row.data?.module !== MODULE ||
        row.data?.ownerId !== ownerId || ![1, SCHEMA].includes(row.data?.schemaVersion) ||
        !row.data?.state)) {
      throw new Error('A Home fióktárhelyének formátuma sérült.')
    }
    const next = row
      ? ownedState(row.data.state, ownerId)
      : createHomeState({ householdId: ownerId, actorId: ownerId })
    const previousState = row?.data?.previousState == null
      ? null : ownedState(row.data.previousState, ownerId)
    await verify()
    revision = row?.revision || 0
    state = next
    previous = previousState
  }
  await read()

  async function assertOwner() {
    if (poisoned) throw poisoned
    await queue
    await verify()
    await store.read(RECORD_ID)
    return ownerId
  }

  function dispatch(command) {
    // Finance OCR remains closed until the Finance owner/read boundary is proven.
    if (command?.type === 'StockReceived') {
      return Promise.reject(new Error('Ez a Home integráció még nincs jóváhagyva a saját fiókhoz.'))
    }
    if (command?.type === 'CookingConfirmed' &&
        (command.sourceType !== 'food-recipe' ||
         command.sourceId !== `${ownerId}:${command.payload?.recipeRef}:${command.eventId}` ||
         typeof command.payload?.recipeRef !== 'string' || !command.payload.recipeRef)) {
      return Promise.reject(new Error('A főzés saját Food-forrásának stabil azonosítója hiányzik.'))
    }
    if (command?.type === 'PreparedConsumptionLinked' &&
        (command.sourceType !== 'food-diary' ||
         command.payload?.profileId !== ownerId ||
         !command.payload?.foodEntryId ||
         command.sourceId !== `${ownerId}:${command.payload.foodEntryId}`)) {
      return Promise.reject(new Error('A Food-napló forrása nem a saját Grapes-fiókhoz tartozik.'))
    }
    if (poisoned) return Promise.reject(poisoned)
    const operation = queue.then(async () => {
      if (poisoned) throw poisoned
      await verify()
      if (command.type === 'CookingConfirmed' && !state.events.some(event =>
          event.eventId === command.eventId ||
          (event.sourceType === command.sourceType && event.sourceId === command.sourceId))) {
        // An authenticated owner identifier alone does not prove the recipe exists.
        // The personal Food store stays read-only; there is no Drive or cross-owner fallback.
        const { openGrapesTestFreshFood } = await import('../food/grapes-test-fresh-food.js')
        const food = await openGrapesTestFreshFood({
          enabled: true, isAndroid, authEnabled, getSubject, indexedDb,
        })
        if (food.ownerId !== ownerId) throw new Error('A Food és Home fiók nem egyezik.')
        const project = await food.load()
        if (project.profile?.id !== ownerId || !project.recipes.some(recipe =>
            recipe.id === command.payload.recipeRef && recipe.ownerProfileId === ownerId)) {
          throw new Error('A saját Food-recept nem található; a Home készlete változatlan.')
        }
        await food.assertOwner()
        await verify()
      }
      if (command.type === 'PreparedConsumptionLinked' && !state.events.some(event =>
          event.eventId === command.eventId ||
          (event.sourceType === command.sourceType && event.sourceId === command.sourceId))) {
        const prepared = state.prepared.find(lot => lot.id === command.payload.preparedLotId)
        if (!prepared) throw new Error('A készétel már nem létezik.')
        const { openGrapesTestFreshFood } = await import('../food/grapes-test-fresh-food.js')
        const { reviewSavedFoodDiaryEntry } = await import('./home-food-diary-link.js')
        const food = await openGrapesTestFreshFood({
          enabled: true, isAndroid, authEnabled, getSubject, indexedDb,
        })
        if (food.ownerId !== ownerId) throw new Error('A Food és a Home tulajdonosa eltér.')
        const project = await food.load()
        const entry = project.diaryEntries.find(entry => entry.id === command.payload.foodEntryId)
        const expected = reviewSavedFoodDiaryEntry(project, ownerId, prepared, entry)
        if (!expected || Object.keys(expected).some(key => command.payload[key] !== expected[key])) {
          throw new Error('A mentett Food-étkezés nem kapcsolható biztonságosan ehhez a készételhez.')
        }
        await food.assertOwner()
        await verify()
      }
      // Invalid user commands do not invalidate the whole session; only an
      // identity/storage/conflict error poisons it.
      const result = applyHomeCommand(state, { ...command, actorId: ownerId })
      if (result.duplicate) {
        await verify()
        return { ...result, state: structuredClone(state) }
      }
      const candidate = ownedState(result.state, ownerId)
      try {
        // Both active and previous recoverable snapshots are one CAS write.
        const saved = await store.save({
          id: RECORD_ID, expectedRevision: revision,
          data: {
            module: MODULE, ownerId, schemaVersion: SCHEMA,
            name: 'Home / Háztartás',
            updatedAt: new Date().toISOString(),
            state: candidate,
            previousState: structuredClone(state),
          },
        })
        await verify()
        previous = structuredClone(state)
        state = candidate
        revision = saved.revision
        return { ...result, state: structuredClone(state) }
      } catch (error) {
        poisoned = error
        throw error
      }
    })
    queue = operation.catch(() => {})
    return operation
  }

  return Object.freeze({
    ownerId,
    getState: () => structuredClone(state),
    dispatch,
    assertOwner,
    async load() {
      await assertOwner()
      await read()
      return structuredClone(state)
    },
    previousSnapshot() { return previous ? structuredClone(previous) : null },
    async status() {
      await assertOwner()
      return { ownerId, revision, cloudSyncEnabled: false,
        sharingEnabled: false, legacyImportEnabled: false,
        receiptImportEnabled: false }
    },
  })
}
