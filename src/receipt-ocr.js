const TOTAL_WORDS = /(?:v[eé]gösszeg|fizetend[oő]|mindösszesen|összesen|total|amount\s+due|grand\s+total)/i
const PAYMENT_WORDS = /(?:bankk[aá]rtya|k[aá]rty[aá]val|fizetve|terhelve)/i
const CURRENCY_WORDS = /(?:\bft\b|\bhuf\b|€|\beur\b|\busd\b)/i
const MISLEADING_WORDS = /(?:áfa|afa|nett[oó]|ad[oó]|kedvezm[eé]ny|visszaj[aá]r[oó]|k[eé]szp[eé]nz|kapott|r[eé]szösszeg|subtotal)/i
const NUMBER_PATTERN = /(?<!\d)(\d{1,3}(?:[ .]\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?!\d)/g

function parseReceiptNumber(raw) {
  let value = String(raw).replace(/\s/g, '')
  const lastDot = value.lastIndexOf('.')
  const lastComma = value.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ','
    value = value.replace(decimal === '.' ? /,/g : /\./g, '').replace(decimal, '.')
  } else {
    const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : ''
    if (separator) {
      const tail = value.length - value.lastIndexOf(separator) - 1
      value = tail === 3 ? value.replaceAll(separator, '') : value.replace(separator, '.')
    }
  }
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null
}

/**
 * A blokk OCR-szövegéből rangsorolt végösszeg-jelölteket készít.
 * Nem dönt automatikusan: a sorrend csak a felhasználói választást segíti.
 */
export function extractReceiptAmountCandidates(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const candidates = []
  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(NUMBER_PATTERN)) {
      const amount = parseReceiptNumber(match[1])
      if (amount == null) continue
      let score = 0
      if (TOTAL_WORDS.test(line)) score += 12
      if (PAYMENT_WORDS.test(line)) score += 4
      if (CURRENCY_WORDS.test(line)) score += 5
      if (MISLEADING_WORDS.test(line)) score -= 10
      score += lines.length > 1 ? (lineIndex / (lines.length - 1)) * 2 : 1
      if (amount >= 100) score += 1
      if (/\b(?:19|20)\d{2}\b/.test(match[1]) && !CURRENCY_WORDS.test(line) && !TOTAL_WORDS.test(line)) score -= 8
      candidates.push({ amount, label: line.slice(0, 120), line: lineIndex + 1, score })
    }
  })

  const bestByAmount = new Map()
  for (const candidate of candidates) {
    const current = bestByAmount.get(candidate.amount)
    if (!current || candidate.score > current.score) bestByAmount.set(candidate.amount, candidate)
  }
  return [...bestByAmount.values()]
    .filter((candidate) => candidate.score > -4)
    .sort((left, right) => right.score - left.score || right.amount - left.amount)
}

/** Kizárólag a böngészőben fut; a bizonylat képe nem kerül OCR-szolgáltatóhoz. */
export async function recognizeReceiptImage(image, onProgress = () => {}) {
  if (typeof globalThis.__GRAPES_RECEIPT_OCR_TEST__ === 'function') {
    return globalThis.__GRAPES_RECEIPT_OCR_TEST__(image, onProgress)
  }
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['hun', 'eng'], 1, {
    logger(message) {
      if (message.status === 'recognizing text') onProgress(Number(message.progress) || 0)
    },
  })
  try {
    const result = await worker.recognize(image)
    return result.data.text || ''
  } finally {
    await worker.terminate()
  }
}
