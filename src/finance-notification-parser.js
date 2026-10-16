// B8.3 experimental parser. This module does not access notifications or store data.
// Only parse text explicitly supplied by an opt-in Android notification listener.
// A candidate must always be reviewed by the user before saving.
const MONEY = /(?:(HUF|EUR|USD|GBP|CZK|PLN)\s*([+-]?\d[\d\s.,]*)|([+-]?\d[\d\s.,]*)\s*(Ft|HUF|EUR|€|USD|GBP|£|CZK|Kč|PLN|zł))/iu
const CODES = { FT: 'HUF', '€': 'EUR', '£': 'GBP', KČ: 'CZK', ZŁ: 'PLN' }
const INCOME = /(?:jóváírás|jóváírt|beérkezett|received|credited|incoming|refund|visszatérítés)/iu
const EXPENSE = /(?:vásárlás|fizetés|terhelés|levonás|purchase|payment|charged|spent|card transaction)/iu
const NUMBER = /(?<!\d)(\d{1,3}(?:[ .]\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?!\d)/u
function amountFromText(raw) {
  const cleaned = String(raw).trim()
  const match = cleaned.match(NUMBER)
  if (!match) return null
  let value = match[1].replace(/\s/g, '')
  if (value.includes(',') && value.includes('.')) {
    const decimal = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.'
    value = value.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.')
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(value)) value = value.replace(/[.,]/g, '')
  else value = value.replace(',', '.')
  const result = Number(value)
  return Number.isFinite(result) && result > 0 && result <= 1e9 ? result : null
}
export function parseFinanceNotification({ title = '', text = '', packageName = '' } = {}) {
  // No automatic classification for notifications with unclear transaction direction.
  const content = [title, text].filter(Boolean).join(' ')
  const match = content.match(MONEY)
  if (!match) return null
  const currencyToken = String(match[1] || match[4]).toUpperCase()
  const currency = CODES[currencyToken] || currencyToken
  const amount = amountFromText(match[2] || match[3])
  if (!amount || !currency) return null
  const incoming = INCOME.test(content), outgoing = EXPENSE.test(content)
  if (incoming === outgoing) return null
  return { type: incoming ? 'income' : 'expense', originalAmount: amount, originalCurrency: currency,
    source: 'android-notification', packageName: String(packageName).slice(0, 180),
    requiresConfirmation: true }
}
