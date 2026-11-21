import './ebook/standalone-config.js'
import { EBOOK_CONFIG } from './ebook/config.js'

const TOKEN_KEY = 'ebook-standalone-reader-token-v1'
const status = document.querySelector('#reader-status')
const form = document.querySelector('#pair-form')
const submit = document.querySelector('#pair-submit')

function parameter(name) {
  return new URL(window.location.href).searchParams.get(name) || ''
}
function valid(token) { return /^[A-F0-9]{64}$/i.test(token || '') }
function brokerUrl(action, values = {}) {
  if (!EBOOK_CONFIG.transferBrokerUrl) return ''
  const url = new URL(EBOOK_CONFIG.transferBrokerUrl)
  url.searchParams.set('action', action)
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value)
  return url.toString()
}
function saveToken(token) {
  const value = String(token || '').toUpperCase()
  try { window.localStorage.setItem(TOKEN_KEY, value) } catch {}
  try { document.cookie = TOKEN_KEY + '=' + encodeURIComponent(value) + '; Max-Age=15552000; Path=/; SameSite=Lax; Secure' } catch {}
}
function savedToken() {
  try {
    const value = window.localStorage.getItem(TOKEN_KEY) || ''
    if (valid(value)) return value
  } catch {}
  try {
    const prefix = TOKEN_KEY + '='
    const cookie = (document.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix))
    const value = cookie ? decodeURIComponent(cookie.slice(prefix.length)) : ''
    return valid(value) ? value : ''
  } catch { return '' }
}
function forgetToken() {
  try { window.localStorage.removeItem(TOKEN_KEY) } catch {}
  try { document.cookie = TOKEN_KEY + '=; Max-Age=0; Path=/; SameSite=Lax; Secure' } catch {}
}
function openLibrary(token) {
  const url = brokerUrl('reader', { token })
  if (!url) {
    if (status) status.textContent = 'Az önálló E-book broker nincs konfigurálva.'
    return
  }
  window.location.replace(url)
}

if (parameter('forget') === '1') forgetToken()
const incoming = parameter('reader-token')
if (valid(incoming)) {
  saveToken(incoming)
  openLibrary(incoming)
} else {
  const saved = savedToken()
  if (valid(saved)) openLibrary(saved)
}

if (form) {
  form.action = EBOOK_CONFIG.transferBrokerUrl || '#'
  if (!EBOOK_CONFIG.transferBrokerUrl) {
    submit.disabled = true
    if (status) status.textContent = 'A párosítás és az olvasókönyvtár még nem érhető el: nincs beállítva az önálló átviteli broker.'
  }
}
