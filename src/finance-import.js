import * as XLSX from 'xlsx'
import { parseMoneyInput } from './finance-data.js'

export const FINANCE_IMPORT_FILE_LIMIT = 25 * 1024 * 1024
export const FINANCE_IMPORT_CELL_LIMIT = 250000

const MONTHS = new Map([
  ['jan', 1], ['januar', 1], ['január', 1],
  ['feb', 2], ['februar', 2], ['február', 2],
  ['mar', 3], ['marc', 3], ['marcius', 3], ['már', 3], ['márc', 3], ['március', 3],
  ['apr', 4], ['aprilis', 4], ['ápr', 4], ['április', 4],
  ['maj', 5], ['majus', 5], ['máj', 5], ['május', 5],
  ['jun', 6], ['junius', 6], ['jún', 6], ['június', 6],
  ['jul', 7], ['julius', 7], ['júl', 7], ['július', 7],
  ['aug', 8], ['augusztus', 8],
  ['szep', 9], ['szept', 9], ['szeptember', 9],
  ['okt', 10], ['oktober', 10], ['október', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12],
])

const SUMMARY_PATTERN = /^(?:összesen|osszesen|részösszeg|reszosszeg|havi összesen|havi osszesen|egyenleg|áttekintés|attekintes)\b/i

function normalizeLabel(value) {
  return String(value ?? '').trim().replace(/[.:]+$/, '').toLocaleLowerCase('hu-HU')
}

export function monthNumber(value) {
  const label = normalizeLabel(value).replace(/\s+\d{4}\b/g, '')
  return MONTHS.get(label) || 0
}

export function inferYear(...values) {
  for (const value of values) {
    const match = String(value ?? '').match(/\b(20\d{2})\b/)
    if (match) return Number(match[1])
  }
  return 0
}

function cellDisplay(cell) {
  if (!cell) return ''
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10)
  return String(cell.text ?? cell.value ?? '').trim()
}

function readCell(sheet, row, col) {
  const address = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[address]
  if (!cell) return { value: '', text: '', formula: '' }
  return {
    value: cell.v instanceof Date ? cell.v : cell.v ?? '',
    text: cell.w ?? (cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v ?? '')),
    formula: cell.f || '',
  }
}

function mergedOrigin(sheet, merges, row, col) {
  const merge = merges.find((item) => row >= item.s.r && row <= item.e.r && col >= item.s.c && col <= item.e.c)
  return merge ? readCell(sheet, merge.s.r, merge.s.c) : readCell(sheet, row, col)
}

export function workbookToModel(workbook, filename = 'munkafüzet') {
  let totalCells = 0
  const sheets = workbook.SheetNames.map((name) => {
    const source = workbook.Sheets[name]
    if (!source?.['!ref']) return { name, rows: [], maxRow: -1, maxCol: -1 }
    const used = XLSX.utils.decode_range(source['!ref'])
    totalCells += (used.e.r - used.s.r + 1) * (used.e.c - used.s.c + 1)
    if (totalCells > FINANCE_IMPORT_CELL_LIMIT) throw new Error('A munkafüzet túl nagy: legfeljebb 250 000 használt cella dolgozható fel egyszerre.')
    const merges = source['!merges'] || []
    const rows = []
    for (let row = used.s.r; row <= used.e.r; row += 1) {
      const cells = []
      for (let col = used.s.c; col <= used.e.c; col += 1) cells[col] = mergedOrigin(source, merges, row, col)
      rows[row] = cells
    }
    return { name, rows, maxRow: used.e.r, maxCol: used.e.c }
  })
  return { filename, sheets }
}

export async function readFinanceWorkbook(file) {
  if (!file) throw new Error('Előbb válassz egy fájlt.')
  if (file.size > FINANCE_IMPORT_FILE_LIMIT) throw new Error('Az importfájl legfeljebb 25 MiB lehet.')
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('hu-HU')
  if (!['xlsx', 'xlsm', 'xls', 'csv'].includes(extension)) throw new Error('XLSX, XLSM, XLS vagy CSV fájl importálható.')
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, cellFormula: true, dense: false })
  return workbookToModel(workbook, file.name)
}

function rowHasData(sheet, row, startCol, endCol) {
  for (let col = startCol; col <= endCol; col += 1) if (cellDisplay(sheet.rows[row]?.[col])) return true
  return false
}

function trimBlock(sheet, startRow, endRow, startCol, endCol) {
  while (startRow <= endRow && !rowHasData(sheet, startRow, startCol, endCol)) startRow += 1
  while (endRow >= startRow && !rowHasData(sheet, endRow, startCol, endCol)) endRow -= 1
  while (startCol <= endCol && !sheet.rows.some((_row, index) => index >= startRow && index <= endRow && cellDisplay(sheet.rows[index]?.[startCol]))) startCol += 1
  while (endCol >= startCol && !sheet.rows.some((_row, index) => index >= startRow && index <= endRow && cellDisplay(sheet.rows[index]?.[endCol]))) endCol -= 1
  return { startRow, endRow, startCol, endCol }
}

function findColumnSegments(sheet) {
  const occupied = []
  for (let col = 0; col <= sheet.maxCol; col += 1) occupied[col] = sheet.rows.some((row) => cellDisplay(row?.[col]))
  const segments = []
  for (let col = 0; col <= sheet.maxCol;) {
    while (col <= sheet.maxCol && !occupied[col]) col += 1
    if (col > sheet.maxCol) break
    const start = col
    while (col <= sheet.maxCol && occupied[col]) col += 1
    segments.push([start, col - 1])
  }
  return segments
}

function findRowSegments(sheet, startCol, endCol) {
  const segments = []
  for (let row = 0; row <= sheet.maxRow;) {
    while (row <= sheet.maxRow && !rowHasData(sheet, row, startCol, endCol)) row += 1
    if (row > sheet.maxRow) break
    const start = row
    while (row <= sheet.maxRow && rowHasData(sheet, row, startCol, endCol)) row += 1
    segments.push([start, row - 1])
  }
  return segments
}

function monthAnchors(sheet) {
  const anchors = []
  for (let row = 0; row <= Math.min(sheet.maxRow, 20); row += 1) {
    for (let col = 0; col <= sheet.maxCol; col += 1) {
      const month = monthNumber(cellDisplay(sheet.rows[row]?.[col]))
      const previousMonth = col > 0 ? monthNumber(cellDisplay(sheet.rows[row]?.[col - 1])) : 0
      if (month && previousMonth !== month) anchors.push({ row, col, month, year: inferYear(cellDisplay(sheet.rows[row]?.[col]), sheet.name) })
    }
  }
  return anchors
}

function blockId(sheetName, range) {
  return `${sheetName}:${range}`.replace(/[^\p{L}\p{N}:_-]+/gu, '-')
}

function inferTarget(sheetName) {
  const label = normalizeLabel(sheetName)
  if (/(félretett|felretett|megtakar|tartalék|tartalek)/.test(label)) return 'saving-deposit'
  if (/(bevétel|bevetel|jövedelem|jovedelem)/.test(label)) return 'income'
  return 'expense'
}

export function rangeLabel(block) {
  return XLSX.utils.encode_range({ s: { r: block.startRow, c: block.startCol }, e: { r: block.endRow, c: block.endCol } })
}

function createBlock(sheet, bounds, month = 0, year = 0) {
  const trimmed = trimBlock(sheet, bounds.startRow, bounds.endRow, bounds.startCol, bounds.endCol)
  const range = rangeLabel(trimmed)
  const block = {
    id: blockId(sheet.name, range), sheetName: sheet.name, enabled: true, ...trimmed,
    month: month && year ? `${year}-${String(month).padStart(2, '0')}` : '', target: inferTarget(sheet.name),
  }
  const mapping = inferBlockMapping(sheet, block)
  if (!block.target.startsWith('saving-') && mapping.typeColumn !== null) block.target = 'auto'
  return { ...block, mapping }
}

export function detectFinanceBlocks(model) {
  const blocks = []
  for (const sheet of model.sheets) {
    const sheetLabel = normalizeLabel(sheet.name)
    if (sheet.maxRow < 0 || sheetLabel.startsWith('áttekintés') || sheetLabel.startsWith('attekintes')) continue
    const anchors = monthAnchors(sheet)
    const anchorsByRow = new Map()
    for (const anchor of anchors) {
      const list = anchorsByRow.get(anchor.row) || []
      list.push(anchor); anchorsByRow.set(anchor.row, list)
    }
    const repeated = [...anchorsByRow.values()].filter((list) => list.length >= 2).sort((a, b) => b.length - a.length)[0]
    if (repeated) {
      repeated.sort((a, b) => a.col - b.col).forEach((anchor, index, list) => {
        const next = list[index + 1]?.col ?? sheet.maxCol + 2
        const endCol = Math.max(anchor.col, next - 2)
        blocks.push(createBlock(sheet, { startRow: anchor.row, endRow: sheet.maxRow, startCol: anchor.col, endCol }, anchor.month, anchor.year))
      })
      continue
    }
    for (const [startCol, endCol] of findColumnSegments(sheet)) {
      for (const [startRow, endRow] of findRowSegments(sheet, startCol, endCol)) {
        if (endRow - startRow < 1) continue
        const monthCell = anchors.find((item) => item.row >= startRow && item.row <= endRow && item.col >= startCol && item.col <= endCol)
        blocks.push(createBlock(sheet, { startRow, endRow, startCol, endCol }, monthCell?.month, monthCell?.year))
      }
    }
  }
  return blocks
}

function isNumberLike(cell) {
  if (typeof cell?.value === 'number' && Number.isFinite(cell.value)) return true
  return Number.isFinite(parseMoneyInput(cellDisplay(cell)))
}

function dateValue(cell) {
  const value = cell?.value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = cellDisplay(cell)
  const iso = text.match(/^(20\d{2})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`
  const hu = text.match(/^(\d{1,2})[-./](\d{1,2})[-./](20\d{2})$/)
  if (hu) return `${hu[3]}-${String(hu[2]).padStart(2, '0')}-${String(hu[1]).padStart(2, '0')}`
  return ''
}

export function inferBlockMapping(sheet, block) {
  const scores = []
  for (let col = block.startCol; col <= block.endCol; col += 1) {
    let numbers = 0; let texts = 0; let dates = 0
    for (let row = block.startRow; row <= block.endRow; row += 1) {
      const cell = sheet.rows[row]?.[col]
      const display = cellDisplay(cell)
      if (!display) continue
      if (dateValue(cell)) dates += 1
      else if (isNumberLike(cell)) numbers += 1
      else texts += 1
    }
    scores.push({ col, numbers, texts, dates })
  }
  const headerMap = new Map()
  for (let row = block.startRow; row <= Math.min(block.endRow, block.startRow + 5); row += 1) {
    for (let col = block.startCol; col <= block.endCol; col += 1) {
      const label = normalizeLabel(cellDisplay(sheet.rows[row]?.[col]))
      if (label && !headerMap.has(label)) headerMap.set(label, col)
    }
  }
  const headerColumn = (...names) => names.map((name) => headerMap.get(name)).find((value) => value !== undefined) ?? null
  const detectedAmount = headerColumn('összeg', 'osszeg', 'amount', 'érték', 'ertek')
  const amountColumn = detectedAmount ?? scores.toSorted((a, b) => b.numbers - a.numbers)[0]?.col ?? block.startCol
  const detectedDescription = headerColumn('megjegyzés', 'megjegyzes', 'description', 'leírás', 'leiras', 'tétel', 'tetel', 'megnevezés', 'megnevezes')
  const descriptionColumn = detectedDescription ?? scores.filter((item) => item.col !== amountColumn).toSorted((a, b) => b.texts - a.texts)[0]?.col ?? block.startCol
  const detectedDate = headerColumn('dátum', 'datum', 'date')
  const scoredDate = scores.toSorted((a, b) => b.dates - a.dates)[0]
  return {
    descriptionColumn, amountColumn, dateColumn: detectedDate ?? (scoredDate?.dates ? scoredDate.col : null),
    typeColumn: headerColumn('típus', 'tipus', 'type'),
    categoryColumn: headerColumn('kategória', 'kategoria', 'category'),
  }
}

export function applyBlockRange(sheet, block, rangeText) {
  let decoded
  try { decoded = XLSX.utils.decode_range(String(rangeText).trim().toUpperCase()) }
  catch { throw new Error('A tartomány például A1:B20 formájú legyen.') }
  if (decoded.s.r < 0 || decoded.s.c < 0 || decoded.e.r > sheet.maxRow || decoded.e.c > sheet.maxCol) throw new Error('A tartomány kilóg a munkalap használt területéről.')
  const updated = { ...block, startRow: decoded.s.r, endRow: decoded.e.r, startCol: decoded.s.c, endCol: decoded.e.c }
  return { ...updated, id: blockId(sheet.name, rangeLabel(updated)), mapping: inferBlockMapping(sheet, updated) }
}

export function columnLabel(index) {
  return XLSX.utils.encode_col(index)
}

export function blockPreview(sheet, block, limit = 10) {
  const rows = []
  for (let row = block.startRow; row <= block.endRow && rows.length < limit; row += 1) {
    rows.push({ row, cells: Array.from({ length: block.endCol - block.startCol + 1 }, (_, offset) => sheet.rows[row]?.[block.startCol + offset] || { value: '', text: '', formula: '' }) })
  }
  return rows
}

function summaryRow(description) {
  return SUMMARY_PATTERN.test(normalizeLabel(description))
}

function headerRow(description, amount) {
  const left = normalizeLabel(description)
  const right = normalizeLabel(amount)
  return /^(?:tétel|tetel|leírás|leiras|megnevezés|megnevezes|description|kategória|kategoria)$/.test(left)
    || /^(?:összeg|osszeg|amount|érték|ertek)$/.test(right)
}

function sourceNote(description, filename, sheetName) {
  return [description, `Import: ${filename} / ${sheetName}`].filter(Boolean).join(' · ').slice(0, 180)
}

export function rowsFromBlock(model, block, options = {}) {
  const sheet = model.sheets.find((item) => item.name === block.sheetName)
  if (!sheet) return []
  const mapping = { ...block.mapping, ...options.mapping }
  const target = options.target || block.target
  const month = options.month || block.month
  const defaultDate = month ? `${month}-01` : ''
  const defaultCategory = options.category || (target === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás')
  const personId = options.personId || ''
  const rows = []
  for (let row = block.startRow; row <= block.endRow; row += 1) {
    const descriptionCell = sheet.rows[row]?.[mapping.descriptionColumn]
    const amountCell = sheet.rows[row]?.[mapping.amountColumn]
    const sourceCategory = mapping.categoryColumn === null ? '' : cellDisplay(sheet.rows[row]?.[mapping.categoryColumn])
    const description = cellDisplay(descriptionCell) || sourceCategory
    const amount = Math.abs(parseMoneyInput(amountCell?.value ?? cellDisplay(amountCell)))
    const explicitDate = mapping.dateColumn === null ? '' : dateValue(sheet.rows[row]?.[mapping.dateColumn])
    const rawType = mapping.typeColumn === null ? '' : normalizeLabel(cellDisplay(sheet.rows[row]?.[mapping.typeColumn]))
    const rowTarget = target === 'auto' ? (rawType.includes('bev') || rawType === 'income' ? 'income' : 'expense') : target
    const category = sourceCategory || (target === 'auto' ? (rowTarget === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás') : defaultCategory)
    if (!description && !Number.isFinite(amount)) continue
    if (monthNumber(description) || monthNumber(cellDisplay(amountCell)) || headerRow(description, cellDisplay(amountCell))) continue
    if (summaryRow(description)) continue
    const formula = Boolean(descriptionCell?.formula || amountCell?.formula || (mapping.dateColumn !== null && sheet.rows[row]?.[mapping.dateColumn]?.formula))
    const errors = []
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Hiányzó vagy hibás összeg')
    if (!explicitDate && !defaultDate) errors.push('Hiányzó dátum vagy hónap')
    if (!description) errors.push('Hiányzó tételnév')
    if (formula) errors.push('Képletet tartalmazó sor')
    rows.push({
      id: `${block.id}:${row}`, blockId: block.id, sheetName: sheet.name, sourceRow: row + 1,
      included: errors.length === 0, target: rowTarget, amount, date: explicitDate || defaultDate,
      estimatedDate: !explicitDate && Boolean(defaultDate), category, personId,
      description, note: sourceNote(description, model.filename, sheet.name), formula, errors,
      duplicate: false, duplicateDecision: '',
    })
  }
  return rows
}

export function importFingerprint(item) {
  const target = item.target || item.type
  const note = String(item.note || '').replace(/\s*·\s*import:.*$/iu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU')
  return `${target}|${item.date}|${Math.round(Number(item.amount) * 100)}|${note}`
}

export function markImportDuplicates(rows, existingTransactions = [], existingSavings = []) {
  const fingerprints = new Set([
    ...existingTransactions.map((item) => importFingerprint({ ...item, target: item.type })),
    ...existingSavings.map((item) => importFingerprint({ ...item, target: item.type === 'withdrawal' ? 'saving-withdrawal' : 'saving-deposit' })),
  ])
  const seen = new Set()
  return rows.map((row) => {
    const fingerprint = importFingerprint(row)
    const duplicate = fingerprints.has(fingerprint) || seen.has(fingerprint)
    seen.add(fingerprint)
    return { ...row, duplicate, duplicateDecision: duplicate ? '' : 'import' }
  })
}
