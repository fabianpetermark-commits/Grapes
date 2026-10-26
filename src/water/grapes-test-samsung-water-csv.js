// Locally selected Samsung Health personal-data WATER CSV only.
// No Samsung credentials, global legacy Water, Google Drive or automatic import.
// The output is a normal read-only Health bridge export: existing owner-pinned
// Water preview/approval/CAS handles ALL writes. Reject unknown schema.
const MAX_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 50000
const HEADER = name => String(name || '').trim().replace(/^\uFEFF/, '')
  .toLowerCase().split('.').at(-1).replace(/[^a-z0-9]/g, '')
const allowedFilename = name => /(?:^|[.\\/_-])water[_-]?intake(?:[.\\/_-]|$)/i.test(name)

function parseRows(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > MAX_BYTES) {
    throw new Error('A Samsung Health víz-CSV legfeljebb 15 MB lehet.')
  }
  const rows = []
  let cell = '', row = [], quoted = false
  // Samsung Health export uses comma-separated rows, with possible quoted
  // commas, line breaks and escaped double quotes.
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') {
      if (cell) throw new Error('Hibás Samsung Health CSV idézőjelezés.')
      quoted = true
    } else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
      if (rows.length > MAX_ROWS + 10) throw new Error('Túl sok Samsung Health CSV-sor.')
    } else cell += char
  }
  if (quoted) throw new Error('Lezáratlan Samsung Health CSV mező.')
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

const dateIso = value => {
  const raw = String(value || '').trim()
  let stamp
  if (/^\d{13}$/.test(raw)) stamp = Number(raw)
  else if (/^\d{10}$/.test(raw)) stamp = Number(raw) * 1000
  else if (/^\d{4}-\d\d-\d\d(?:T| )\d\d:\d\d/.test(raw)) stamp = Date.parse(raw.replace(' ', 'T'))
  else throw new Error('Ismeretlen Samsung Health kezdődátum-formátum.')
  if (!Number.isFinite(stamp)) throw new Error('Érvénytelen Samsung Health időpont.')
  const iso = new Date(stamp).toISOString()
  if (Number.isNaN(Date.parse(iso)) || stamp > Date.now() + 86400000) {
    throw new Error('Érvénytelen vagy jövőbeli Samsung Health időpont.')
  }
  return iso
}

export function parseSamsungWaterCsv(source, { filename = '' } = {}) {
  if (!allowedFilename(filename) || !/[.]csv$/i.test(filename)) {
    throw new Error('A Samsung Health exportból a com.samsung.health.water_intake...csv fájlt válaszd ki.')
  }
  const rows = parseRows(source)
  // Some Samsung exports include descriptive lines ahead of the true header.
  const headerRow = rows.findIndex(row => {
    const keys = row.map(HEADER)
    return keys.includes('starttime') && keys.includes('amount') &&
      (keys.includes('datauuid') || keys.includes('uuid') || keys.includes('uid'))
  })
  if (headerRow < 0) {
    throw new Error('Nem ismert Samsung Health víz-CSV: start_time, amount és datauuid oszlop szükséges. A fájlt nem importáltuk.')
  }
  const headers = rows[headerRow].map(HEADER)
  const column = key => headers.indexOf(key)
  const index = name => column(name)
  const startIndex = index('starttime')
  const amountIndex = index('amount')
  const idIndex = ['datauuid', 'uuid', 'uid'].map(index).find(x => x >= 0)
  const sourceIndex = ['pkgname', 'package', 'sourcename'].map(index).find(x => x >= 0)
  const records = []
  const failedRows = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const values = rows[i]
    try {
      const id = String(values[idIndex] || '').trim()
      if (!id || id.length > 256 || /[\r\n]/.test(id)) throw new Error('Hiányzó vízrekord-azonosító.')
      const amountText = String(values[amountIndex] || '').trim()
      if (!/^\d+(?:[.]\d+)?$/.test(amountText)) throw new Error('Hibás vízmennyiség.')
      const amount = Number(amountText)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('Érvénytelen vízmennyiség (ml).')
      const occurredAt = dateIso(values[startIndex])
      const sourcePackage = String(sourceIndex === undefined ? '' : values[sourceIndex] || '').trim()
        || 'com.sec.android.app.shealth'
      if (!/^[a-z0-9_.-]{1,120}$/i.test(sourcePackage)) throw new Error('Érvénytelen vízadatforrás.')
      records.push({
        type: 'hydration',
        externalId: 'samsunghealth:' + sourcePackage + ':' + id,
        sourcePackage,
        startTime: occurredAt,
        endTime: occurredAt,
        name: 'Víz',
        volumeMilliliters: amount,
      })
    } catch (error) {
      failedRows.push({ row: i + 1, reason: error.message })
    }
  }
  if (!records.length) {
    throw new Error(failedRows.length
      ? 'A Samsung Health víz-CSV nem tartalmaz érvényes vízbejegyzést: ' + failedRows[0].reason
      : 'A Samsung Health víz-CSV üres.')
  }
  if (failedRows.length) {
    throw new Error(failedRows.length + ' hibás Samsung Health vízrekordot találtunk. A biztonság kedvéért semmit sem importálunk (első hibás sor: ' + failedRows[0].row + ').')
  }
  return {
    schemaVersion: 1,
    producer: 'hu.grapes.healthconnect',
    generatedAt: new Date().toISOString(),
    records,
  }
}
