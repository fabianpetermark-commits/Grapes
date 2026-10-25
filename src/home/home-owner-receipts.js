import { normalizeTransaction } from '../finance-data.js'
import { recognizeReceiptImage } from '../receipt-ocr.js'
import { quantity } from './home-data.js'

const totalLine = /(?:v[eé]gösszeg|fizetend[oő]|mindösszesen|összesen|total|bankk[aá]rtya|fizetve|[aá]fa|kedvezm[eé]ny)/i
const itemLine = /^(.{2,100}?)\s+(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:[,.]\d{1,3})?)\s*(kg|dkg|g|l|dl|ml|db)\b/i
// A price-only line may be a product, but it must never imply a stock quantity.
const pricedLine = /^(.{2,100}?)\s+\d+(?:[\s.,]\d{3})*(?:[,.]\d{1,2})?\s*(?:Ft|HUF)\s*$/i
function lineFingerprint(value) {
  let hash = 0xcbf29ce484222325n
  for (const char of value.normalize('NFKC').toLocaleLowerCase('hu-HU')) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

async function financeTransactions(readFinance) {
  // Caller must provide ONLY a native-owner-pinned Finance reader; never
  // inspect legacy global localStorage, shared IndexedDB or Drive.
  const data = await readFinance()
  if (data == null) return []
  if (!Array.isArray(data.transactions)) throw new Error('A fiók saját Pénzügy-tranzakciói nem olvashatók.')
  if (data.transactions.some(row => typeof row.id !== 'string' || !row.id.trim()) ||
      new Set(data.transactions.map(row => row.id)).size !== data.transactions.length) {
    throw new Error('Ismétlődő vagy hiányzó Pénzügy-tranzakcióazonosító.')
  }
  return data.transactions.map(normalizeTransaction).filter(row =>
    row.type === 'expense' && !row.planned && row.receipt?.data)
}

export async function readOwnerFinanceReceipts(readFinance) {
  const rows = await financeTransactions(readFinance)
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
    // Non-product headers can be visible for manual review, but no data is trusted.
    if (/^[\d\s.,-]+(?:Ft|HUF|EUR|€)?\s*$/i.test(rawLine) || !/\p{L}{2,}/u.test(rawLine)) return []
    const match = rawLine.match(itemLine)
    let name = ''
    let amount = null
    let unit = null
    let status = 'raw'
    if (match) {
      const parsedAmount = Number(match[3].replace(',', '.')) * Number(match[2] || 1)
      const parsedUnit = match[4].toLowerCase()
      try {
        if (match[1].trim() && quantity(parsedAmount, parsedUnit).quantityBase > 0) {
          name = match[1].trim()
          amount = parsedAmount
          unit = parsedUnit
          status = 'review'
        }
      } catch { /* Keep the uncertain OCR line manual-only. */ }
    } else {
      const priced = rawLine.match(pricedLine)
      if (priced && /\p{L}{2,}/u.test(priced[1])) {
        name = priced[1].trim()
        status = 'manual'
      }
    }
    // Fingerprint remains identical to M2 for previously recognised rows.
    const fingerprint = lineFingerprint(rawLine)
    const occurrence = (occurrences.get(fingerprint) || 0) + 1
    occurrences.set(fingerprint, occurrence)
    const lineId = `ocr-${fingerprint}-${occurrence}`
    return [{ receiptId, lineId, lineNumber: index + 1, sourceId: `${receiptId}:${lineId}`, rawLine: rawLine.slice(0, 160), name, quantity: amount, unit, status }]
  })
}

export async function scanOwnerFinanceReceipt(receiptId, { readFinance, recognize = recognizeReceiptImage, onProgress = () => {} } = {}) {
  const row = (await financeTransactions(readFinance)).find(item => item.id === receiptId)
  if (!row) throw new Error('A mentett Pénzügy-bizonylat nem található.')
  if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(row.receipt.data)) throw new Error('Csak képes bizonylat olvasható helyben.')
  const text = await recognize(row.receipt.data, onProgress)
  return { receiptId, date: row.date, receiptData: row.receipt.data, candidates: receiptLineCandidates(text, receiptId) }
}

// Verify a candidate still belongs to an existing, non-planned own expense.
export async function receiptFromOwnerFinance(data, receiptId) {
  return (await financeTransactions(async () => data)).find(row => row.id === receiptId) || null
}
