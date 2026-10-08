import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  applyBlockRange, detectFinanceBlocks, importFingerprint, markImportDuplicates,
  monthNumber, rowsFromBlock, workbookToModel,
} from '../src/finance-import.js'

function modelFromSheets(sheets, filename = 'Havi_koltesek_formazva okgpt.xlsm') {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows, merges = []] of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!merges'] = merges
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  return workbookToModel(workbook, filename)
}

test('recognizes Hungarian month names and abbreviations', () => {
  assert.equal(monthNumber('Jan.'), 1)
  assert.equal(monthNumber('Március 2027'), 3)
  assert.equal(monthNumber('Szept'), 9)
  assert.equal(monthNumber('December'), 12)
  assert.equal(monthNumber('Összesen'), 0)
})

test('does not invent a year when a month header has none', () => {
  const model = modelFromSheets([['Havi kiadások', [['Jan', ''], ['Tétel', 'Összeg'], ['Kaja', 1000]], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]]])
  const block = detectFinanceBlocks(model)[0]
  assert.equal(block.month, '')
  assert.match(rowsFromBlock(model, block, block)[0].errors.join(' '), /Hiányzó dátum/)
})

test('detects twelve horizontal month blocks with merged headers', () => {
  const header = []
  const labelRow = []
  const valueRow = []
  const merges = []
  const names = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec']
  names.forEach((name, index) => {
    const col = index * 3
    header[col] = name
    labelRow[col] = 'Tétel'; labelRow[col + 1] = 'Összeg'
    valueRow[col] = `Kiadás ${index + 1}`; valueRow[col + 1] = (index + 1) * 1000
    merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 1 } })
  })
  const model = modelFromSheets([['Havi kiadások 2027', [header, labelRow, valueRow], merges]])
  const blocks = detectFinanceBlocks(model)
  assert.equal(blocks.length, 12)
  assert.equal(blocks[0].month, '2027-01')
  assert.equal(blocks[11].month, '2027-12')
  assert.equal(blocks[0].mapping.descriptionColumn, 0)
  assert.equal(blocks[0].mapping.amountColumn, 1)
})

test('splits separate savings tables and excludes overview sheets', () => {
  const model = modelFromSheets([
    ['Félretett', [['Tétel', 'Összeg', '', 'Tétel', 'Összeg'], ['Vésztartalék', 50000, '', 'Kivét', 10000]]],
    ['Áttekintés', [['Egyenleg', { f: 'SUM(B2:B3)', v: 40000 }]]],
  ])
  const blocks = detectFinanceBlocks(model)
  assert.equal(blocks.length, 2)
  assert.ok(blocks.every((block) => block.target === 'saving-deposit'))
})

test('normalizes month-only rows and excludes summaries and formulas', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Jan', ''], ['Tétel', 'Összeg'], ['Telekom', 42300], ['Összesen', { f: 'SUM(B3:B3)', v: 42300 }], ['Számolt', { f: 'B3*2', v: 84600 }],
  ])
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Havi kiadások 2027')
  const model = workbookToModel(workbook, 'minta.xlsm')
  const block = detectFinanceBlocks(model)[0]
  const rows = rowsFromBlock(model, block, { ...block, category: 'Számlák' })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].description, 'Telekom')
  assert.equal(rows[0].date, '2027-01-01')
  assert.equal(rows[0].estimatedDate, true)
  assert.equal(rows[0].category, 'Számlák')
  assert.equal(rows[1].included, false)
  assert.match(rows[1].errors.join(' '), /Képletet/)
})

test('allows validated A1 range corrections and rejects out-of-sheet ranges', () => {
  const model = modelFromSheets([['szémolős', [['Megjegyzés', 'Összeg'], ['Kaja', 12000], ['', ''], ['Másik', 5]]]])
  const sheet = model.sheets[0]
  const block = detectFinanceBlocks(model)[0]
  const updated = applyBlockRange(sheet, block, 'A1:B2')
  assert.equal(updated.endRow, 1)
  assert.throws(() => applyBlockRange(sheet, block, 'A1:Z99'), /kilóg/)
})

test('marks existing and within-import duplicates for explicit decisions', () => {
  const base = { target: 'expense', date: '2027-01-01', amount: 7000, note: 'Kaja · Import: minta / Jan', errors: [], included: true }
  const existing = [{ type: 'expense', date: base.date, amount: base.amount, note: 'Kaja' }]
  const marked = markImportDuplicates([{ ...base, id: '1' }, { ...base, id: '2', note: 'Benzin' }, { ...base, id: '3', note: 'Benzin' }], existing, [])
  assert.equal(marked[0].duplicate, true)
  assert.equal(marked[0].duplicateDecision, '')
  assert.equal(marked[1].duplicate, false)
  assert.equal(marked[2].duplicate, true)
  assert.equal(importFingerprint(base), importFingerprint({ ...base, note: '  KAJA   · IMPORT: MINTA / JAN ' }))
})

test('keeps negative source amounts positive while the selected target owns direction', () => {
  const model = modelFromSheets([['Bevétel 2027', [['Tétel', 'Összeg'], ['FIZU', -516540]]]])
  const block = detectFinanceBlocks(model)[0]
  block.month = '2027-09'
  const [row] = rowsFromBlock(model, block, { ...block, target: 'income' })
  assert.equal(row.amount, 516540)
  assert.equal(row.target, 'income')
})

test('preserves mixed CSV transaction types and source categories', () => {
  const model = modelFromSheets([['Munka1', [
    ['Dátum', 'Típus', 'Kategória', 'Összeg', 'Pénznem', 'Megjegyzés'],
    ['2027-01-03', 'Kiadás', 'Számlák', 7000, 'HUF', 'Telefon'],
    ['2027-01-05', 'Bevétel', 'Munkabér', -500000, 'HUF', 'Fizetés'],
  ]]], 'export.csv')
  const block = detectFinanceBlocks(model)[0]
  assert.equal(block.target, 'auto')
  assert.equal(block.mapping.typeColumn, 1)
  assert.equal(block.mapping.categoryColumn, 2)
  const rows = rowsFromBlock(model, block, block)
  assert.deepEqual(rows.map(({ target, category, amount }) => ({ target, category, amount })), [
    { target: 'expense', category: 'Számlák', amount: 7000 },
    { target: 'income', category: 'Munkabér', amount: 500000 },
  ])
})
