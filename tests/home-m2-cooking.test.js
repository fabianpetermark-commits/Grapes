import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHomeCommand, createHomeState, validateHomeState } from '../src/home/home-data.js'
import { createHomeStore, HOME_KEY } from '../src/home/home-store.js'

const run = (state, type, payload, eventId) => applyHomeCommand(state, { type, payload, eventId })
const memory = () => {
  const rows = new Map()
  return { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) }
}
function dividedStock() {
  const added = run(createHomeState(), 'StockCountConfirmed', { name: 'Csirkemell', quantity: 1, unit: 'kg', storageLocation: 'fridge' }, 'stock')
  return run(added.state, 'StockSplit', { id: added.state.inventory[0].id, fridgeQuantity: 600, unit: 'g' }, 'split').state
}
function cook(state, options = {}) {
  const chilled = state.inventory.find(lot => lot.storageLocation === 'fridge')
  return run(state, 'CookingConfirmed', { name: 'Csirkés étel', portions: 4, storageLocation: 'fridge', recipeRef: 'recipe-1', consumed: [{ id: chilled.id, quantity: 500, unit: 'g' }], ...options }, 'cook-1')
}

test('H-16: előnézet után csak a megerősített főzés von le 500 g-ot és teremt 4 adagot', () => {
  const before = dividedStock()
  const raw = JSON.stringify(before)
  assert.equal(JSON.stringify(before), raw)
  const first = cook(before)
  assert.deepEqual(first.state.inventory.map(lot => [lot.storageLocation, lot.quantityBase]).sort(), [['freezer', 400], ['fridge', 100]])
  assert.equal(first.state.prepared[0].portionsRemaining, 4)
  assert.equal(first.state.prepared[0].cookingEventId, first.event.eventId)
  assert.equal(first.state.prepared[0].recipeRef, 'recipe-1')
  assert.equal(first.event.changes.length, 2)
  assert.equal(cook(first.state).duplicate, true)
  assert.equal(first.state.prepared.length, 1)
})

test('főzés több nyers tételből atomikus; túlfogyasztás, inkompatibilis egység és duplikált lot tiltva', () => {
  const before = dividedStock()
  const [a, b] = before.inventory
  const base = { name: 'Étel', portions: 4, storageLocation: 'fridge' }
  const valid = run(before, 'CookingConfirmed', { ...base, consumed: [{ id: a.id, quantity: 200, unit: 'g' }, { id: b.id, quantity: 100, unit: 'g' }] }, 'multi')
  assert.equal(valid.state.inventory.reduce((sum, lot) => sum + lot.quantityBase, 0), 700)
  for (const consumed of [
    [{ id: a.id, quantity: 999, unit: 'g' }],
    [{ id: a.id, quantity: 1, unit: 'l' }],
    [{ id: a.id, quantity: 1, unit: 'g' }, { id: a.id, quantity: 1, unit: 'g' }],
    [],
  ]) assert.throws(() => run(before, 'CookingConfirmed', { ...base, consumed }, 'invalid'))
  assert.equal(before.revision, 2)
})

test('főzés visszavonása mindkét készletfajtát helyreállítja; módosított nyers lot konfliktus', () => {
  const before = dividedStock()
  const cooked = cook(before)
  const reversed = run(cooked.state, 'Reversed', { eventId: cooked.event.eventId }, 'undo')
  assert.deepEqual(reversed.state.inventory.toSorted((a, b) => a.id.localeCompare(b.id)), before.inventory.toSorted((a, b) => a.id.localeCompare(b.id)))
  assert.deepEqual(reversed.state.prepared, [])
  assert.throws(() => run(reversed.state, 'Reversed', { eventId: cooked.event.eventId }, 'undo-again'))
  const chilled = cooked.state.inventory.find(lot => lot.storageLocation === 'fridge')
  const edited = run(cooked.state, 'LotEdited', { id: chilled.id, name: chilled.name, quantity: 50, unit: 'g', storageLocation: 'fridge' }, 'edit').state
  assert.throws(() => run(edited, 'Reversed', { eventId: cooked.event.eventId }, 'conflict'), /megváltozott/)
})

test('M1 mentés megőrzése: v1 eseménynapló v2-ként olvasható, első írás előtt a régi bytes változatlan', () => {
  const storage = memory()
  const old = dividedStock()
  delete old.prepared
  old.schemaVersion = 1
  const oldRaw = JSON.stringify(old)
  storage.setItem(HOME_KEY, oldRaw)
  const store = createHomeStore(storage)
  assert.equal(store.getState().schemaVersion, 2)
  assert.deepEqual(store.getState().prepared, [])
  assert.equal(storage.getItem(HOME_KEY), oldRaw)
  const chilled = store.getState().inventory.find(lot => lot.storageLocation === 'fridge')
  store.dispatch({ type: 'CookingConfirmed', eventId: 'migrated-cook', payload: { name: 'Csirkés étel', portions: 4, storageLocation: 'fridge', consumed: [{ id: chilled.id, quantity: 500, unit: 'g' }] } })
  assert.equal(createHomeStore(storage).getState().prepared[0].portionsRemaining, 4)
  assert.equal(storage.getItem('grapes-home-household-v1-previous'), oldRaw)
  assert.equal(validateHomeState(JSON.parse(storage.getItem(HOME_KEY))).schemaVersion, 2)
})
