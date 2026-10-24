import { normalizeTransaction } from '../finance-data.js'
import { recognizeReceiptImage } from '../receipt-ocr.js'
import { loadLocalProject } from '../storage/local-project-store.js'
import { quantity } from './home-data.js'

const FINANCE_PROJECT_ID = 'finance-tracker-current'
const totalLine = /(?:v[eé]gösszeg|fizetend[oő]|mindösszesen|összesen|total|bankk[aá]rtya|fizetve|[aá]fa|kedvezm[eé]ny)/i
const itemLine = /^(.{2,100}?)\s+(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:[,.]\d{1,3})?)\s*(kg|dkg|g|l|dl|ml|db)\b/i
function lineFingerprint(value) {
  let hash = 0xcbf29ce484222325n
  for (const char of value.normalize('NFKC').toLocaleLowerCase('hu-HU')) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

async function financeTransactions(loadProject) {
  const saved = await loadProject(FINANCE_PROJECT_ID)
  if (!saved?.data) return []
  if (!Array.isArray(saved.data.transactions)) throw new Error('A Pénzügy helyi mentése nem olvasható.')
  if (saved.data.transactions.some(row => typeof row.id !== 'string' || !row.id.trim()) || new Set(saved.data.transactions.map(row => row.id)).size !== saved.data.transactions.length) throw new Error('A Pénzügy tranzakcióazonosítója hiányzik vagy ismétlődik.')
  return saved.data.transactions.map(normalizeTransaction).filter(row => row.type === 'expense' && !row.planned && row.receipt?.data)
}

export async function readLocalFinanceReceipts(loadProject = loadLocalProject) {
  const rows = await financeTransactions(loadProject)
  return rows.map(row => ({ id: row.id, date: row.date, name: row.receipt.name || 'Bizonylat', imageAvailable: /^data:image\/(?:png|jpeg|gif|webp);base64,/.test(row.receipt.data) }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// OCR text is only a suggestion. No product identity or current stock is inferred.
export function receiptLineCandidates(text, receiptId) {
  if (typeof receiptId !== 'string' || !receiptId) throw new Error('Hiányzó bizonylatazonosító.')
  const occurrences = new Map()
  return String(text || '').split(/\r?\n/).flatMap((original, index) => {
    const rawLine = original.trim().replace(/\s+/g, ' ')
    if (!rawLine || totalLine.test(rawLine)) return []
    const match = rawLine.match(itemLine)
    if (!match) return []
    const name = match[1].trim()
    const amount = Number(match[3].replace(',', '.')) * Number(match[2] || 1)
    const unit = match[4].toLowerCase()
    try {
      if (!name || quantity(amount, unit).quantityBase <= 0) return []
    } catch { return [] }
    const fingerprint = lineFingerprint(rawLine)
    const occurrence = (occurrences.get(fingerprint) || 0) + 1
    occurrences.set(fingerprint, occurrence)
    const lineId = `ocr-${fingerprint}-${occurrence}`
    return [{ receiptId, lineId, lineNumber: index + 1, sourceId: `${receiptId}:${lineId}`, rawLine: rawLine.slice(0, 160), name, quantity: amount, unit, status: 'review' }]
  })
}

export async function scanLocalFinanceReceipt(receiptId, { loadProject = loadLocalProject, recognize = recognizeReceiptImage, onProgress = () => {} } = {}) {
  const row = (await financeTransactions(loadProject)).find(item => item.id === receiptId)
  if (!row) throw new Error('A mentett Pénzügy-bizonylat nem található.')
  if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(row.receipt.data)) throw new Error('Csak képes bizonylat olvasható helyben.')
  const text = await recognize(row.receipt.data, onProgress)
  return { receiptId, date: row.date, candidates: receiptLineCandidates(text, receiptId) }
}
