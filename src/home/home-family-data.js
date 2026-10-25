import { applyHomeCommand, createHomeState, validateHomeState } from './home-data.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EDIT_ROLES = new Set(['owner', 'editor'])
const SHARED_TYPES = new Set([
  'StockCountConfirmed', 'LotEdited', 'LotDeleted', 'StockSplit',
  'ShoppingItemAdded', 'ShoppingItemEdited', 'ShoppingItemStatusChanged',
  'ShoppingItemDeleted', 'Reversed',
])
const checkUuid = (value, label) => {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new Error(`Érvénytelen ${label}.`)
  return value.toLowerCase()
}

/**
 * Shared household begins EMPTY and requires explicit owner creation. No
 * export/import of personal Home, Food, Health, Finance or receipt history.
 * A remote shared Home is NOT the same data store as individual Home.
 */
export function createEmptyFamilyHome(householdId, creatorId) {
  const id = checkUuid(householdId, 'háztartásazonosító')
  const creator = checkUuid(creatorId, 'fiókazonosító')
  return createHomeState({ householdId: id, actorId: creator })
}

export function validateFamilyHome(candidate, householdId) {
  const state = validateHomeState(structuredClone(candidate))
  if (state.schemaVersion !== 2 ||
      state.householdId !== checkUuid(householdId, 'háztartásazonosító') ||
      !UUID.test(state.actorId || '') || state.prepared.length) {
    throw new Error('A közös Home csak az üres készétellistájú háztartási készletet és bevásárlólistát tartalmazhatja.')
  }
  for (const entry of state.events) {
    if (!SHARED_TYPES.has(entry.type) || !UUID.test(entry.actorId || '') ||
        entry.sourceType !== 'manual' || entry.sourceId != null ||
        entry.changes.some(change => change.collection === 'prepared')) {
      throw new Error('Személyes vagy nem támogatott esemény nem vihető át a közös Home-ba.')
    }
  }
  if (state.inventory.some(lot => lot.sourceType !== 'manual' || lot.sourceId != null) ||
      state.shopping.some(item => item.sourceType !== 'manual')) {
    throw new Error('Pénzügyi, Food- vagy importadat nem osztható meg automatikusan.')
  }
  return state
}

/**
 * Stage an explicit shared command against a verified baseline. The caller
 * MUST save the candidate and the same operation ID in an owner-bound durable
 * outbox before network transmission. No implicit conflict rebase/LWW.
 */
export function stageFamilyHomeCommand({ state, householdId, actorId, role, command }) {
  const actor = checkUuid(actorId, 'műveletvégző')
  const current = validateFamilyHome(state, householdId)
  if (!EDIT_ROLES.has(role)) throw new Error('A családtag csak megtekintheti a közös készletet.')
  if (!SHARED_TYPES.has(command?.type)) throw new Error('Személyes modulok műveleteit nem lehet közös készletként rögzíteni.')
  const id = checkUuid(command?.eventId, 'tartós műveletazonosító')
  if (command.sourceType != null && command.sourceType !== 'manual' || command.sourceId != null)
    throw new Error('Külső Food/Finance-forrást nem szinkronizálunk automatikusan.')
  const result = applyHomeCommand(current, {
    ...command, eventId: id, actorId: actor, sourceType: 'manual',
  })
  if (result.duplicate) throw new Error('A művelet már szerepel a közös eseménynaplóban.')
  const candidate = validateFamilyHome(result.state, householdId)
  return Object.freeze({
    householdId: current.householdId,
    operationId: id,
    expectedRevision: current.revision,
    schemaVersion: 2,
    candidate,
  })
}

/** Conflict is a stop signal. No silently last-write-wins merge. */
export function inspectFamilyConflict(staged, serverResponse) {
  if (serverResponse?.status === 'committed') {
    if (serverResponse.revision !== staged.expectedRevision + 1)
      throw new Error('A távoli Home-revízió nem igazolható.')
    return { committed: true, revision: serverResponse.revision }
  }
  if (serverResponse?.status === 'conflict' &&
      Number.isSafeInteger(serverResponse.revision) &&
      serverResponse.revision >= 0) {
    return {
      committed: false, revision: serverResponse.revision,
      requiresManualReview: true,
      // Preserve the entire rejected proposal for the owner-bound outbox.
      rejectedCandidate: structuredClone(staged.candidate),
      operationId: staged.operationId,
    }
  }
  throw new Error('Ismeretlen családi szinkroneredmény; a helyi műveletet őrizd meg.')
}
