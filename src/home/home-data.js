export const SCHEMA_VERSION = 2
export const LOCATIONS = ['fridge', 'freezer', 'pantry']
export const UNITS = Object.freeze({
  g: ['mass', 1], dkg: ['mass', 10], kg: ['mass', 1000],
  ml: ['volume', 1], dl: ['volume', 100], l: ['volume', 1000],
  db: ['piece', 1], csomag: ['package', 1], adag: ['serving', 1], szelet: ['slice', 1],
})
const uuid = () => globalThis.crypto?.randomUUID?.() || `home-${Date.now()}-${Math.random().toString(36).slice(2)}`
const now = () => new Date().toISOString()
const fail = message => { throw new Error(message) }
const cleanName = value => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!name || name.length > 160) fail('Adj meg egy legfeljebb 160 karakteres nevet.')
  return name
}
const validDate = value => {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('Érvénytelen dátum.')
  return value
}
export function quantity(value, unit) {
  if (!UNITS[unit]) fail('Ismeretlen mértékegység.')
  if (value == null || String(value).trim() === '' || typeof value === 'boolean') fail('Adj meg ismert mennyiséget; az üres érték nem nulla.')
  const amount = Number(String(value).replace(',', '.'))
  const base = amount * UNITS[unit][1]
  if (!Number.isFinite(base) || base < 0 || !Number.isSafeInteger(base)) fail('A mennyiség legyen nem negatív, bázisegységre pontos szám.')
  return { quantityBase: base, dimension: UNITS[unit][0], displayUnit: unit }
}
export function createHomeState({ householdId = uuid(), actorId = null } = {}) {
  return { schemaVersion: SCHEMA_VERSION, householdId, actorId, revision: 0, inventory: [], shopping: [], prepared: [], events: [] }
}
function unique(items, key) { return new Set(items.map(item => item[key])).size === items.length }
export function validateHomeState(state) {
  if (!state || state.schemaVersion !== SCHEMA_VERSION || typeof state.householdId !== 'string' || !state.householdId || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.inventory) || !Array.isArray(state.shopping) || !Array.isArray(state.prepared) || !Array.isArray(state.events)) fail('A Home mentés sérült vagy a verzió nem támogatott.')
  if (!unique(state.inventory, 'id') || !unique(state.shopping, 'id') || !unique(state.prepared, 'id') || !unique(state.events, 'eventId')) fail('Ismétlődő Home azonosító.')
  for (const lot of state.inventory) {
    if (!lot.id || lot.householdId !== state.householdId || !lot.name || !LOCATIONS.includes(lot.storageLocation) || lot.evidenceStatus !== 'confirmed' || !lot.originEventId || !lot.sourceType || !lot.observedAt || !lot.updatedAt || !UNITS[lot.displayUnit] || lot.dimension !== UNITS[lot.displayUnit][0] || !Number.isSafeInteger(lot.quantityBase) || lot.quantityBase < 0 || (lot.expiryDate && !lot.expiryKind) || (lot.expiryKind && !['bestBefore', 'useBy'].includes(lot.expiryKind))) fail('Sérült vagy inkompatibilis készlettétel.')
  }
  for (const finished of state.prepared) {
    if (!finished.id || finished.householdId !== state.householdId || !finished.name ||
      !finished.cookingEventId || !finished.confirmedAt || !finished.updatedAt ||
      !LOCATIONS.includes(finished.storageLocation) ||
      !Number.isSafeInteger(finished.portionsPrepared) || finished.portionsPrepared <= 0 ||
      !Number.isSafeInteger(finished.portionsRemaining) || finished.portionsRemaining < 0 ||
      finished.portionsRemaining > finished.portionsPrepared) fail('Sérült készétel-tétel.')
  }
  for (const item of state.shopping) {
    if (!item.id || item.householdId !== state.householdId || !item.name || !['planned', 'checked', 'deferred'].includes(item.status) || !item.updatedAt || (item.quantityBase == null && item.displayUnit != null) || (item.quantityBase != null && (!Number.isSafeInteger(item.quantityBase) || item.quantityBase < 0 || !UNITS[item.displayUnit] || item.dimension !== UNITS[item.displayUnit][0]))) fail('Sérült bevásárlólista-tétel.')
  }
  state.events.forEach((event, index) => {
    if (!event.eventId || event.householdId !== state.householdId || !event.type || !event.timestamp || event.confirmation !== true || event.resultingRevision !== index + 1 || !Array.isArray(event.changes)) fail('Sérült Home eseménynapló.')
  })
  if (state.revision !== state.events.length) fail('A Home revízió és az eseménynapló eltér.')
  const replay = { inventory: [], shopping: [], prepared: [] }
  for (const event of state.events) applyChanges(replay, event.changes)
  if (JSON.stringify(replay.inventory) !== JSON.stringify(state.inventory) || JSON.stringify(replay.shopping) !== JSON.stringify(state.shopping) || JSON.stringify(replay.prepared) !== JSON.stringify(state.prepared)) fail('A Home pillanatkép és az eseménynapló eltér.')
  return state
}
const clone = value => structuredClone(value)
const record = (state, collection, id) => state[collection].find(item => item.id === id) || null
const change = (collection, before, after) => ({ collection, id: (after || before).id, before: clone(before), after: clone(after) })
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function applyChanges(state, changes) {
  for (const entry of changes) {
    if (!['inventory', 'shopping', 'prepared'].includes(entry.collection) || !equal(record(state, entry.collection, entry.id), entry.before)) fail('A tétel azóta megváltozott. Biztonságos kézi javítás szükséges.')
    const index = state[entry.collection].findIndex(item => item.id === entry.id)
    if (index >= 0) state[entry.collection].splice(index, 1)
    if (entry.after) state[entry.collection].push(clone(entry.after))
  }
}
export function splitPreview(lot, fridgeValue, unit = lot.displayUnit) {
  const part = quantity(fridgeValue, unit)
  if (part.dimension !== lot.dimension) fail('A két mértékegység nem kompatibilis.')
  if (part.quantityBase > lot.quantityBase) fail('Az elosztás nagyobb a rendelkezésre álló mennyiségnél.')
  return { fridgeBase: part.quantityBase, freezerBase: lot.quantityBase - part.quantityBase, dimension: lot.dimension }
}
export function splitPreset(lot, preset) {
  if (preset === 'fridge') return { fridgeBase: lot.quantityBase, freezerBase: 0, dimension: lot.dimension }
  if (preset === 'freezer') return { fridgeBase: 0, freezerBase: lot.quantityBase, dimension: lot.dimension }
  if (preset === 'half') return { fridgeBase: Math.floor(lot.quantityBase / 2), freezerBase: Math.ceil(lot.quantityBase / 2), dimension: lot.dimension }
  fail('Ismeretlen elosztási gyorsválasztó.')
}
export function applyHomeCommand(current, command) {
  validateHomeState(current)
  const { type, payload = {}, eventId = uuid(), actorId = current.actorId } = command
  const existing = current.events.find(event => event.eventId === eventId)
  if (existing) return { state: current, event: existing, duplicate: true }
  if (command.sourceId && current.events.some(event => event.sourceType === command.sourceType && event.sourceId === command.sourceId)) return { state: current, event: null, duplicate: true }
  const state = clone(current)
  const stamp = now()
  let changes = []
  let reversalOf = null
  const lot = payload.id && record(state, 'inventory', payload.id)
  const item = payload.id && record(state, 'shopping', payload.id)
  if (type === 'StockCountConfirmed') {
    const q = quantity(payload.quantity, payload.unit)
    const id = payload.id || uuid()
    if (record(state, 'inventory', id)) fail('A készlettétel már létezik.')
    if (!LOCATIONS.includes(payload.storageLocation)) fail('Válassz tárolási helyet.')
    const expiryDate = validDate(payload.expiryDate)
    const expiryKind = expiryDate ? payload.expiryKind : null
    if (expiryDate && !['bestBefore', 'useBy'].includes(expiryKind)) fail('Válassz dátumtípust.')
    changes = [change('inventory', null, { id, householdId: state.householdId, name: cleanName(payload.name), ...q, storageLocation: payload.storageLocation, evidenceStatus: 'confirmed', sourceType: command.sourceType || 'manual', sourceId: command.sourceId || null, originEventId: eventId, lastConfirmationEventId: eventId, observedAt: stamp, confirmedAt: stamp, createdAt: stamp, updatedAt: stamp, expiryDate, expiryKind })]
  } else if (type === 'PurchaseConfirmed') {
    if (payload.confirmed !== true || command.sourceType !== 'financeReceiptLine' ||
      typeof command.sourceId !== 'string' || !/^[^:]{1,160}:[^:]{1,160}$/.test(command.sourceId))
      fail('Csak tételes, forrásazonosítós és külön jóváhagyott blokk alapján vételezhetsz be.')
    const q = quantity(payload.quantity, payload.unit)
    if (q.quantityBase <= 0 || !LOCATIONS.includes(payload.storageLocation)) fail('Érvényes bekerülő mennyiséget és helyet válassz.')
    const id = uuid()
    changes = [change('inventory', null, {
      id, householdId: state.householdId, name: cleanName(payload.name), ...q,
      storageLocation: payload.storageLocation, evidenceStatus: 'confirmed',
      sourceType: 'financeReceiptLine', sourceId: command.sourceId, originEventId: eventId,
      lastConfirmationEventId: eventId, observedAt: stamp, confirmedAt: stamp,
      createdAt: stamp, updatedAt: stamp, expiryDate: null, expiryKind: null,
    })]
  } else if (type === 'CookingConfirmed') {
    if (payload.confirmed !== true || !Array.isArray(payload.ingredients) || !payload.ingredients.length)
      fail('A főzéshez külön jóváhagyás és igazolt hozzávalók szükségesek.')
    const count = Number(payload.portions)
    if (!Number.isSafeInteger(count) || count <= 0) fail('A készétel adagjainak száma pozitív egész legyen.')
    const allocations = new Map()
    for (const input of payload.ingredients) {
      const stock = record(state, 'inventory', input.lotId)
      if (!stock || stock.evidenceStatus !== 'confirmed') fail('A megjelölt alapanyag nincs megerősítve.')
      const used = quantity(input.quantity, input.unit)
      if (used.dimension !== stock.dimension || used.quantityBase <= 0)
        fail('A főzéshez nem kompatibilis vagy nulla mennyiség tartozik.')
      allocations.set(stock.id, (allocations.get(stock.id) || 0) + used.quantityBase)
      if (!Number.isSafeInteger(allocations.get(stock.id))) fail('Túl nagy mennyiség.')
    }
    for (const [id, used] of allocations) {
      const stock = record(state, 'inventory', id)
      if (used > stock.quantityBase) fail('A főzés nem vonhat le a rendelkezésre állónál többet.')
      changes.push(change('inventory', stock, { ...stock, quantityBase: stock.quantityBase - used,
        observedAt: stamp, confirmedAt: stamp, updatedAt: stamp, lastConfirmationEventId: eventId }))
    }
    const preparedId = uuid()
    changes.push(change('prepared', null, {
      id: preparedId, householdId: state.householdId, name: cleanName(payload.recipeName),
      sourceRecipeId: String(payload.recipeId || ''), cookingEventId: eventId,
      portionsPrepared: count, portionsRemaining: count,
      storageLocation: LOCATIONS.includes(payload.storageLocation) ? payload.storageLocation : 'fridge',
      confirmedAt: stamp, updatedAt: stamp,
    }))
  } else if (type === 'PreparedPortionConsumed') {
    if (payload.confirmed !== true) fail('A készétel fogyasztását külön erősítsd meg.')
    const finished = record(state, 'prepared', payload.id)
    if (!finished) fail('A készétel-tétel nem található.')
    const count = Number(payload.portions)
    if (!Number.isSafeInteger(count) || count <= 0 || count > finished.portionsRemaining)
      fail('A készételből nem fogyasztható el több adag a meglévőnél.')
    changes = [change('prepared', finished, { ...finished, portionsRemaining: finished.portionsRemaining - count, updatedAt: stamp })]
  } else if (type === 'LotEdited') {
    if (!lot) fail('A készlettétel nem található.')
    const q = quantity(payload.quantity, payload.unit)
    const expiryDate = validDate(payload.expiryDate)
    const expiryKind = expiryDate ? payload.expiryKind : null
    if (expiryDate && !['bestBefore', 'useBy'].includes(expiryKind)) fail('Válassz dátumtípust.')
    if (!LOCATIONS.includes(payload.storageLocation)) fail('Válassz tárolási helyet.')
    changes = [change('inventory', lot, { ...lot, name: cleanName(payload.name), ...q, storageLocation: payload.storageLocation, observedAt: stamp, updatedAt: stamp, confirmedAt: stamp, lastConfirmationEventId: eventId, frozenAt: payload.storageLocation === 'freezer' && lot.storageLocation !== 'freezer' ? stamp : lot.frozenAt || null, thawedAt: lot.storageLocation === 'freezer' && payload.storageLocation !== 'freezer' ? stamp : lot.thawedAt || null, expiryDate, expiryKind })]
  } else if (type === 'LotDeleted') {
    if (!lot) fail('A készlettétel nem található.')
    changes = [change('inventory', lot, null)]
  } else if (type === 'StockSplit') {
    if (!lot) fail('A készlettétel nem található.')
    const preview = payload.preset ? splitPreset(lot, payload.preset) : splitPreview(lot, payload.fridgeQuantity, payload.unit)
    if (!lot.quantityBase) fail('Nulla mennyiség nem osztható el.')
    const pieces = [['fridge', preview.fridgeBase], ['freezer', preview.freezerBase]].filter(([, amount]) => amount > 0)
    const [first, second] = pieces
    const firstLot = { ...lot, quantityBase: first[1], storageLocation: first[0], observedAt: stamp, updatedAt: stamp, confirmedAt: stamp, lastConfirmationEventId: eventId, frozenAt: first[0] === 'freezer' && lot.storageLocation !== 'freezer' ? stamp : lot.frozenAt || null, thawedAt: lot.storageLocation === 'freezer' && first[0] !== 'freezer' ? stamp : lot.thawedAt || null }
    changes = [change('inventory', lot, firstLot)]
    if (second) changes.push(change('inventory', null, { ...firstLot, id: uuid(), quantityBase: second[1], storageLocation: second[0], originEventId: eventId, frozenAt: second[0] === 'freezer' && lot.storageLocation !== 'freezer' ? stamp : lot.frozenAt || null, thawedAt: lot.storageLocation === 'freezer' && second[0] !== 'freezer' ? stamp : lot.thawedAt || null }))
  } else if (type === 'ShoppingItemAdded') {
    const id = payload.id || uuid()
    if (record(state, 'shopping', id)) fail('A listaelem már létezik.')
    const q = payload.quantity === '' || payload.quantity == null ? { quantityBase: null, dimension: null, displayUnit: null } : quantity(payload.quantity, payload.unit)
    changes = [change('shopping', null, { id, householdId: state.householdId, name: cleanName(payload.name), ...q, status: 'planned', sourceType: 'manual', updatedAt: stamp })]
  } else if (type === 'ShoppingItemEdited') {
    if (!item) fail('A listaelem nem található.')
    const q = payload.quantity === '' || payload.quantity == null ? { quantityBase: null, dimension: null, displayUnit: null } : quantity(payload.quantity, payload.unit)
    changes = [change('shopping', item, { ...item, name: cleanName(payload.name), ...q, updatedAt: stamp })]
  } else if (type === 'ShoppingItemStatusChanged') {
    if (!item) fail('A listaelem nem található.')
    if (!['planned', 'checked', 'deferred'].includes(payload.status)) fail('Ismeretlen listaállapot.')
    changes = [change('shopping', item, { ...item, status: payload.status, updatedAt: stamp })]
  } else if (type === 'ShoppingItemDeleted') {
    if (!item) fail('A listaelem nem található.')
    changes = [change('shopping', item, null)]
  } else if (type === 'Reversed') {
    const target = state.events.find(event => event.eventId === payload.eventId)
    if (!target || target.type === 'Reversed' || state.events.some(event => event.reversalOf === payload.eventId)) fail('Ez a művelet nem vonható vissza újra.')
    changes = target.changes.map(entry => change(entry.collection, entry.after, entry.before))
    reversalOf = payload.eventId
  } else fail('Ismeretlen Home művelet.')
  applyChanges(state, changes)
  const event = { eventId, householdId: state.householdId, type, timestamp: stamp, actorId, sourceType: command.sourceType || 'manual', sourceId: command.sourceId || null, confirmation: true, reversalOf, changes, resultingRevision: state.revision + 1 }
  state.events.push(event)
  state.revision++
  validateHomeState(state)
  return { state, event, duplicate: false }
}
export function displayQuantity(item) {
  if (item.quantityBase == null) return 'Mennyiség ismeretlen'
  const factor = UNITS[item.displayUnit]?.[1]
  return `${(item.quantityBase / factor).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} ${item.displayUnit}`
}
export function expiryLabel(lot) {
  if (!lot.expiryDate) return 'Lejárati dátum: ismeretlen'
  return `Dátum megadva: ${lot.expiryDate} · ${lot.expiryKind === 'useBy' ? 'fogyaszthatósági idő' : 'minőségmegőrzési idő'} · érdemes ellenőrizni`
}
