import QRCode from 'qrcode'
import { grapesDriveRequest, isGrapesDriveConnected } from './storage/grapes-drive.js'

const TRANSFER_BROKER_URL = import.meta.env.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const APP_RETURN_URL = 'https://fabianpetermark-commits.github.io/Grapes/'
const READER_PAGE_URL = new URL('ebook-reader.html', APP_RETURN_URL).toString()
const SHAREABLE = /\.(?:epub|pdf|mobi|azw|azw3|prc|txt|cbz|cbr)$/i

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

function brokerUrl(params = {}) {
  if (!TRANSFER_BROKER_URL) throw new Error('Az E-book Transfer broker nincs konfigurálva.')
  const url = new URL(TRANSFER_BROKER_URL)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

async function publicPermissions(fileId) {
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role,allowFileDiscovery)&pageSize=100`)
  const data = await response.json()
  return (data.permissions || []).filter(permission => permission.type === 'anyone' && permission.role === 'reader')
}

async function ensurePublicRead(fileId) {
  const existing = await publicPermissions(fileId)
  if (existing.length) return existing[0]
  const response = await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=id,type,role`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
  })
  return response.json()
}

export const isMobileShareableBook = book => SHAREABLE.test(String(book?.name || '')) && book?.isAppAuthorized !== false

export async function prepareMobileBookTransfer(book) {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot a Szinkron oldalon.')
  if (!isMobileShareableBook(book)) throw new Error('Ez a könyv jelenleg nem küldhető e-olvasóra.')
  await ensurePublicRead(book.id)
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(book.id)}&export=download&confirm=t`
  return {
    downloadUrl,
    qrUrl: await QRCode.toDataURL(downloadUrl, { width: 440, margin: 4, color: { dark: '#000000', light: '#ffffff' } }),
    codeUrl: brokerUrl({ action: 'create', fileId: book.id, returnUrl: APP_RETURN_URL, embed: '1' }),
  }
}

export async function revokeMobileBookTransfer(fileId) {
  const permissions = await publicPermissions(fileId)
  for (const permission of permissions) {
    await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permission.id)}`, { method: 'DELETE' })
  }
  return permissions.length
}

function nonce() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

export async function prepareMobileLibraryPairing(books) {
  if (!isGrapesDriveConnected()) throw new Error('Előbb csatlakoztasd a Google Drive-ot a Szinkron oldalon.')
  const shareable = books.filter(isMobileShareableBook)
  for (let index = 0; index < shareable.length; index += 10) {
    await Promise.all(shareable.slice(index, index + 10).map(book => ensurePublicRead(book.id)))
  }
  const requestNonce = nonce()
  const fields = {
    action: 'create-reader-pairing', nonce: requestNonce, returnUrl: READER_PAGE_URL,
    books: JSON.stringify(shareable.map(book => [book.id, book.name, Number(book.size) || 0, Date.parse(book.modifiedTime || book.createdTime || '') || 0])),
    omittedCount: String(Math.max(0, books.length - shareable.length)), embed: '1',
  }
  const inputs = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join('')
  const action = new URL(brokerUrl({})); action.search = ''
  return {
    nonce: requestNonce,
    count: shareable.length,
    omittedCount: Math.max(0, books.length - shareable.length),
    srcdoc: `<!doctype html><html><body><form method="post" action="${escapeHtml(action.toString())}">${inputs}</form><script>document.forms[0].submit()<\/script></body></html>`,
  }
}

export function isTrustedPairingMessage(event, expectedNonce) {
  let trusted = false
  try {
    const origin = new URL(event.origin)
    trusted = origin.protocol === 'https:' && (origin.hostname === 'script.google.com' || origin.hostname === 'script.googleusercontent.com' || origin.hostname.endsWith('.googleusercontent.com'))
  } catch {}
  return trusted && String(event.data?.nonce || '').toLowerCase() === String(expectedNonce || '').toLowerCase()
}
