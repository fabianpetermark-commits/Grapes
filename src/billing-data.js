export const DOCUMENT_TYPES = { quote: 'Árajánlat', proforma: 'Díjbekérő', invoice: 'Számlatervezet' }
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const money = value => Math.round((value + Number.EPSILON) * 100) / 100
export function calculateDocument(lines = []) {
  const items = lines.map(line => {
    const quantity = Number(line.quantity), price = Number(line.price)
    const vat = Number(line.vat), discount = Number(line.discount)
    if (!String(line.name || '').trim()) throw new Error('Minden tételhez szükséges megnevezés.')
    if (![quantity, price, vat, discount].every(Number.isFinite) || quantity <= 0 || price < 0 || vat < 0 || vat > 100 || discount < 0 || discount > 100) throw new Error('Ellenőrizd a mennyiséget, árat, áfát és kedvezményt.')
    const net = money(quantity * price * (1 - discount / 100))
    const tax = money(net * vat / 100)
    if (!Number.isSafeInteger(Math.round(net * 100)) || !Number.isSafeInteger(Math.round(tax * 100))) throw new Error('Túl nagy tételösszeg.')
    return { ...line, quantity, price, vat, discount, net, tax, gross: money(net + tax) }
  })
  const net = money(items.reduce((sum, item) => sum + item.net, 0))
  const tax = money(items.reduce((sum, item) => sum + item.tax, 0))
  return { items, net, tax, gross: money(net + tax) }
}
export function prepareDocument(value, documents = []) {
  if (!DOCUMENT_TYPES[value.type]) throw new Error('Ismeretlen dokumentumtípus.')
  if (!value.customer?.name?.trim() || !value.seller?.name?.trim()) throw new Error('A kiállító és az ügyfél neve kötelező.')
  if (!validDate(value.date) || !validDate(value.dueDate) || value.dueDate < value.date) throw new Error('Érvényes kiállítási dátum és későbbi fizetési határidő szükséges.')
  if (!value.lines?.length) throw new Error('Legalább egy tétel szükséges.')
  if (!['HUF', 'EUR', 'USD'].includes(value.currency)) throw new Error('Ismeretlen pénznem.')
  if (!String(value.number || '').trim()) throw new Error('A dokumentum azonosítója kötelező.')
  if (documents.some(item => item.id !== value.id && item.number === value.number)) throw new Error('Ez a dokumentumazonosító már foglalt.')
  calculateDocument(value.lines)
  return structuredClone({ ...value, id: value.id || crypto.randomUUID(), updatedAt: new Date().toISOString() })
}
export function convertDocument(document, type) {
  if (!DOCUMENT_TYPES[type]) throw new Error('Ismeretlen dokumentumtípus.')
  return { ...structuredClone(document), id: null, type, number: '', sourceId: document.id, sourceNumber: document.number }
}
