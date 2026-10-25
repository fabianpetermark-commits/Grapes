import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHomeCommand, createHomeState, displayQuantity, expiryLabel, quantity, splitPreset, splitPreview } from '../src/home/home-data.js'
import { createHomeStore, HOME_KEY } from '../src/home/home-store.js'

const memory = () => {
  const map = new Map()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map }
}
const command = (state, type, payload, eventId = crypto.randomUUID()) => applyHomeCommand(state, { type, payload, eventId })
const stock = (state = createHomeState(), unit = 'kg') => command(state, 'StockCountConfirmed', { name: 'Csirkemell', quantity: 1, unit, storageLocation: 'fridge' }).state
const total = state => state.inventory.reduce((sum, lot) => sum + lot.quantityBase, 0)

test('H-01 listaelem tervezett, készlet változatlan', () => {
  const state = command(createHomeState(), 'ShoppingItemAdded', { name: 'Csirkemell', quantity: 1, unit: 'kg' }).state
  assert.equal(state.shopping[0].status, 'planned')
  assert.equal(state.inventory.length, 0)
})
test('H-02 kipipálás egyszer, atomikusan növeli a készletet', () => {
  let state = command(createHomeState(), 'ShoppingItemAdded', { name: 'Csirkemell', quantity: 1, unit: 'kg' }).state
  state = command(state, 'ShoppingItemStatusChanged', { id: state.shopping[0].id, status: 'checked' }).state
  assert.equal(state.shopping[0].status, 'checked')
  assert.equal(state.inventory.length, 1)
  assert.equal(state.inventory[0].quantityBase, 1000)
  assert.equal(state.inventory[0].storageLocation, 'untracked')
})
test('H-03 megerősített 1 kg bevételezés egy 1000 g lot és esemény', () => {
  const state = stock()
  assert.equal(state.inventory.length, 1)
  assert.equal(total(state), 1000)
  assert.equal(state.inventory[0].evidenceStatus, 'confirmed')
  assert.equal(state.events[0].type, 'StockCountConfirmed')
})
test('H-04 előnézet nem ír, a 600/400 megosztás pontos', () => {
  const before = stock()
  assert.deepEqual(splitPreview(before.inventory[0], 600, 'g'), { fridgeBase: 600, freezerBase: 400, dimension: 'mass' })
  assert.equal(before.inventory.length, 1)
  const after = command(before, 'StockSplit', { id: before.inventory[0].id, fridgeQuantity: 600, unit: 'g' }).state
  assert.equal(total(after), 1000)
  assert.deepEqual(after.inventory.map(x => [x.storageLocation, x.quantityBase]).sort(), [['freezer', 400], ['fridge', 600]])
})
test('H-05 ugyanazon eseményazonosító idempotens, forrásazonosító is tartós', () => {
  const before = stock(); const id = before.inventory[0].id
  const first = command(before, 'StockSplit', { id, fridgeQuantity: 600, unit: 'g' }, 'split-1')
  const second = command(first.state, 'StockSplit', { id, fridgeQuantity: 600, unit: 'g' }, 'split-1')
  assert.equal(second.duplicate, true)
  assert.equal(second.state.events.length, 2)
  assert.equal(total(second.state), 1000)
  const received = applyHomeCommand(first.state, { type: 'StockCountConfirmed', eventId: 'receipt-1', sourceType: 'receipt', sourceId: 'line-1', payload: { name: 'Tej', quantity: 1, unit: 'l', storageLocation: 'fridge' } })
  assert.equal(applyHomeCommand(received.state, { type: 'StockCountConfirmed', eventId: 'receipt-2', sourceType: 'receipt', sourceId: 'line-1', payload: { name: 'Tej', quantity: 1, unit: 'l', storageLocation: 'fridge' } }).duplicate, true)
})
test('H-06 három gyorsválasztó megőrzi a bázismennyiséget', () => {
  for (const preset of ['half', 'fridge', 'freezer']) {
    const before = stock()
    const p = splitPreset(before.inventory[0], preset)
    assert.equal(p.fridgeBase + p.freezerBase, 1000)
    const after = command(before, 'StockSplit', { id: before.inventory[0].id, preset }).state
    assert.equal(total(after), 1000)
    assert.ok(after.inventory.every(lot => lot.quantityBase > 0))
  }
})
test('H-07 negatív, NaN és inkompatibilis egység blokkolt', () => {
  const state = stock(); const lot = state.inventory[0]
  for (const [value, unit] of [[-1, 'g'], ['NaN', 'g'], [1, 'db'], [1001, 'g']]) {
    assert.throws(() => splitPreview(lot, value, unit))
    assert.equal(state.revision, 1)
  }
})
test('H-08 visszavonás egyszer, módosított lot esetén konfliktus', () => {
  const before = stock(); const split = command(before, 'StockSplit', { id: before.inventory[0].id, preset: 'half' })
  const undo = command(split.state, 'Reversed', { eventId: split.event.eventId })
  assert.equal(total(undo.state), 1000)
  assert.equal(undo.state.inventory.length, 1)
  assert.throws(() => command(undo.state, 'Reversed', { eventId: split.event.eventId }))
  const edited = command(split.state, 'LotEdited', { ...split.state.inventory[0], quantity: 300, unit: 'g' }).state
  assert.throws(() => command(edited, 'Reversed', { eventId: split.event.eventId }), /megváltozott/)
})
test('H-09 mentés/újraindítás megőrzi a revíziót, bizonyosságot, listastátuszt', () => {
  const storage = memory(); const store = createHomeStore(storage)
  store.dispatch({ type: 'StockCountConfirmed', payload: { name: 'Tej', quantity: 1, unit: 'l', storageLocation: 'fridge' } })
  const add = store.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'Kenyér' } })
  store.dispatch({ type: 'ShoppingItemStatusChanged', payload: { id: add.state.shopping[0].id, status: 'checked' } })
  assert.deepEqual(createHomeStore(storage).getState(), store.getState())
})
test('H-10 sérült JSON és sikertelen írás nem csendes üresítés', () => {
  const storage = memory(); const store = createHomeStore(storage)
  store.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'Tej' } })
  const good = storage.getItem(HOME_KEY)
  storage.setItem(HOME_KEY, '{bad')
  assert.throws(() => createHomeStore(storage), /sérült JSON/)
  assert.equal(storage.getItem(HOME_KEY), '{bad')
  storage.setItem(HOME_KEY, good)
  const failing = { getItem: storage.getItem, setItem() { throw new Error('quota') } }
  const other = createHomeStore(failing)
  assert.throws(() => other.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'Kenyér' } }), /sikertelen/)
  assert.equal(other.getState().revision, 1)
})
test('H-11 hiányzó mennyiség nem 0, a készlethez ismert érték kell', () => {
  assert.throws(() => quantity('', 'g'))
  assert.throws(() => command(createHomeState(), 'StockCountConfirmed', { name: 'Tej', quantity: '', unit: 'l', storageLocation: 'fridge' }))
  const state = command(createHomeState(), 'ShoppingItemAdded', { name: 'Tej' }).state
  assert.equal(displayQuantity(state.shopping[0]), 'Mennyiség ismeretlen')
})
test('H-12 dátum nélküli termék nem kap kitalált lejáratot', () => {
  const lot = stock().inventory[0]
  assert.equal(lot.expiryDate, null)
  assert.match(expiryLabel(lot), /ismeretlen/)
})
test('készlet szerkesztés, tárolóváltás és törlés naplózott és visszavonható', () => {
  const added = stock(); const id = added.inventory[0].id
  const moved = command(added, 'LotEdited', { id, name: 'Csirkemell', quantity: 1, unit: 'kg', storageLocation: 'freezer' })
  assert.equal(moved.state.inventory[0].storageLocation, 'freezer')
  assert.ok(moved.state.inventory[0].frozenAt)
  const deleted = command(moved.state, 'LotDeleted', { id })
  assert.equal(deleted.state.inventory.length, 0)
  assert.equal(command(deleted.state, 'Reversed', { eventId: deleted.event.eventId }).state.inventory.length, 1)
})
test('sérült snapshot és újabb párhuzamos revízió blokkolja az írást', () => {
  const storage = memory(); const first = createHomeStore(storage)
  const second = createHomeStore(storage)
  first.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'Tej' } })
  assert.throws(() => second.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'Vaj' } }), /másik nézetben/)
  const invalid = JSON.parse(storage.getItem(HOME_KEY))
  invalid.shopping[0].name = 'Más adat'
  storage.setItem(HOME_KEY, JSON.stringify(invalid))
  assert.throws(() => createHomeStore(storage), /pillanatkép/)
})
