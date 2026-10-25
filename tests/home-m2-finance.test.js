import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHomeCommand, createHomeState } from '../src/home/home-data.js'
import { readLocalFinanceReceipts, receiptLineCandidates, scanLocalFinanceReceipt } from '../src/home/home-finance-receipts.js'

const receipt = data => ({ name: 'blokk.png', type: 'image/png', size: 1, data: `data:image/png;base64,${data}` })
const project = { data: { transactions: [
  { id: 'receipt-total', type: 'expense', amount: 5990, date: '2026-10-19', category: 'Élelmiszer', receipt: receipt('YQ==') },
  { id: 'receipt-lines', type: 'expense', amount: 998, date: '2026-10-19', category: 'Élelmiszer', receipt: receipt('Yg==') },
  { id: 'planned', type: 'expense', planned: true, amount: 1000, date: '2026-10-19', receipt: receipt('Yw==') },
] } }
const load = async id => { assert.equal(id, 'finance-tracker-current'); return project }

test('H-13: csak végösszeg vagy Pénzügy-tranzakció nem ad tételes készletjelöltet', async () => {
  const before = JSON.stringify(project)
  const home = createHomeState()
  const rows = await readLocalFinanceReceipts(load)
  assert.equal(rows.length, 2)
  const scanned = await scanLocalFinanceReceipt('receipt-total', { loadProject: load, recognize: async () => 'Végösszeg 5 990 Ft\nBankkártya 5 990 Ft' })
  assert.deepEqual(scanned.candidates, [])
  assert.equal(home.inventory.length, 0)
  assert.equal(home.events.length, 0)
  assert.equal(JSON.stringify(project), before)
})

test('H-14: ugyanazon OCR-bizonylatsor megerősítve egyszer kerül készletbe; forrásazonosító tartós', async () => {
  const scanned = await scanLocalFinanceReceipt('receipt-lines', { loadProject: load, recognize: async () => 'Tej 2 x 1 l 998 Ft\nVégösszeg 998 Ft' })
  assert.equal(scanned.candidates.length, 1)
  const row = scanned.candidates[0]
  assert.match(row.sourceId, /^receipt-lines:ocr-[0-9a-f]{16}-1$/)
  assert.equal(row.lineNumber, 1)
  assert.equal(receiptLineCandidates('bolt fejléce\nTej 2 x 1 l 998 Ft', 'receipt-lines')[0].sourceId, row.sourceId, 'Más sorpozíció nem duplázhat készletet.')
  assert.equal(row.quantity, 2)
  assert.equal(row.unit, 'l')
  let home = createHomeState()
  assert.equal(home.inventory.length, 0, 'Az OCR előnézete nem írhat készletet.')
  const payload = { name: 'Tej', quantity: 2, unit: 'l', storageLocation: 'fridge', receiptId: row.receiptId, lineId: row.lineId }
  const first = applyHomeCommand(home, { type: 'StockReceived', eventId: 'receive-1', sourceType: 'finance-receipt', sourceId: row.sourceId, payload })
  home = first.state
  assert.equal(home.inventory[0].quantityBase, 2000)
  assert.equal(home.inventory[0].sourceId, row.sourceId)
  const second = applyHomeCommand(home, { type: 'StockReceived', eventId: 'receive-2', sourceType: 'finance-receipt', sourceId: row.sourceId, payload })
  assert.equal(second.duplicate, true)
  assert.equal(second.state.inventory.length, 1)
  assert.equal(second.state.revision, 1)
  assert.throws(() => applyHomeCommand(createHomeState(), { type: 'StockReceived', sourceType: 'finance-receipt', sourceId: 'wrong', payload }))
  assert.throws(() => applyHomeCommand(createHomeState(), { type: 'StockReceived', sourceType: 'finance-receipt', sourceId: row.sourceId, payload: { ...payload, quantity: '' } }))
  assert.equal(applyHomeCommand(home, { type: 'Reversed', payload: { eventId: first.event.eventId } }).state.inventory.length, 0)
})

test('bizonytalan, nem tételes OCR-sor és hibás Pénzügy-azonosító blokkolt', async () => {
  assert.equal(receiptLineCandidates('Tej 1 l\nÖsszesen 999 Ft\nÁFA 27 db', 'r').length, 1)
  const raw = receiptLineCandidates('Tej 1,2,3 l\n5 990 Ft\nBolt neve', 'r')
  assert.equal(raw.length, 2)
  assert.deepEqual(receiptLineCandidates('5 990 Ft\n499 HUF', 'r'), [], 'Puszta pénzösszeg nem lehet kézi termékjelölt.')
  assert.ok(raw.every(row => row.status === 'raw' && row.name === '' && row.quantity == null && row.unit == null))
  await assert.rejects(readLocalFinanceReceipts(async () => ({ data: { transactions: [{ ...project.data.transactions[0], id: '' }] } })), /azonosítója/)
  await assert.rejects(scanLocalFinanceReceipt('planned', { loadProject: load, recognize: async () => 'Tej 1 l' }), /nem található/)
})

test('M2.1: ár alapú és nem azonosított OCR-sor csak teljes kézi megerősítés után hoz létre készletet', async () => {
  const financeBefore = JSON.stringify(project)
  const scanned = await scanLocalFinanceReceipt('receipt-lines', { loadProject: load, recognize: async () => 'ALDI Bolt\nKenyér 499 Ft\nSzendvics\nVégösszeg 499 Ft\nBankkártya 499 Ft\n5 990 Ft' })
  assert.equal(scanned.candidates.length, 3)
  const bread = scanned.candidates.find(row => row.name === 'Kenyér')
  const raw = scanned.candidates.find(row => row.rawLine === 'Szendvics')
  assert.equal(bread.status, 'manual')
  assert.equal(bread.quantity, null)
  assert.equal(bread.unit, null)
  assert.equal(raw.status, 'raw')
  assert.equal(raw.name, '')
  assert.equal(raw.quantity, null)
  assert.equal(raw.unit, null)
  assert.equal(receiptLineCandidates('Másik fejléc\nKenyér 499 Ft', 'receipt-lines').find(row => row.name === 'Kenyér').sourceId, bread.sourceId)
  let home = createHomeState()
  assert.equal(home.inventory.length, 0)
  assert.equal(home.events.length, 0)
  const payload = { receiptId: bread.receiptId, lineId: bread.lineId, name: bread.name, quantity: 1, unit: 'db', storageLocation: 'pantry' }
  const command = { type: 'StockReceived', sourceType: 'finance-receipt', sourceId: bread.sourceId, payload }
  assert.throws(() => applyHomeCommand(home, { ...command, payload: { ...payload, quantity: '' } }))
  assert.throws(() => applyHomeCommand(home, { ...command, payload: { ...payload, unit: '' } }))
  assert.throws(() => applyHomeCommand(home, { ...command, payload: { ...payload, storageLocation: '' } }))
  const first = applyHomeCommand(home, command)
  home = first.state
  assert.equal(home.inventory.length, 1)
  assert.equal(home.inventory[0].quantityBase, 1)
  assert.equal(home.inventory[0].storageLocation, 'pantry')
  assert.equal(applyHomeCommand(home, { ...command, eventId: 'repeat-bread' }).duplicate, true)
  assert.equal(home.inventory.length, 1)
  const rawPayload = { receiptId: raw.receiptId, lineId: raw.lineId, name: 'Szendvics', quantity: 1, unit: 'db', storageLocation: 'fridge' }
  home = applyHomeCommand(home, { type: 'StockReceived', sourceType: 'finance-receipt', sourceId: raw.sourceId, payload: rawPayload }).state
  assert.equal(home.inventory.length, 2)
  assert.equal(JSON.stringify(project), financeBefore, 'A Pénzügy eredeti mentése csak olvasható.')
})
