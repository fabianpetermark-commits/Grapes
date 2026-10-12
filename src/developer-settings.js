export const MODULE_SETTINGS_KEY = 'grapes-developer-module-flags-v1'
export const DEVELOPER_UNLOCK_KEY = 'grapes-developer-unlock-v1'
export const DEFAULT_DEVELOPER_PIN = '2026'

export const MODULE_DEFINITIONS = Object.freeze([
  { key: 'email', label: 'E-mail Stúdió' },
  { key: 'brochure', label: 'Brossúra Szerkesztő' },
  { key: 'qr', label: 'QR Stúdió' },
  { key: 'studio', label: '3D Nyomtatási Stúdió' },
  { key: 'ebook', label: 'E-book Könyvtár és Könyvszerkesztő' },
  { key: 'finance', label: 'Pénzügyi Napló' },
  { key: 'billing', label: 'Számla és árajánlat' },
  { key: 'food', label: 'Food ételnapló' },
])

const MODULE_KEYS = new Set(MODULE_DEFINITIONS.map(module => module.key))

export function normalizeEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US')
}

export function configuredDeveloperEmail() {
  return normalizeEmail(import.meta.env?.VITE_DEVELOPER_EMAIL || 'projectsoundmodel@gmail.com')
}

export function isDeveloperEmail(email, configuredEmail = configuredDeveloperEmail()) {
  const expected = normalizeEmail(configuredEmail)
  return Boolean(expected) && normalizeEmail(email) === expected
}

export function configuredDeveloperPin() {
  const configured = String(import.meta.env?.VITE_DEVELOPER_PIN || '').trim()
  return /^\d{4}$/.test(configured) ? configured : DEFAULT_DEVELOPER_PIN
}

export function isDeveloperPin(pin, configuredPin = configuredDeveloperPin()) {
  const value = String(pin || '').trim()
  const expected = String(configuredPin || '').trim()
  return /^\d{4}$/.test(value) && /^\d{4}$/.test(expected) && value === expected
}

export function isDeveloperSessionUnlocked(email, storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem(DEVELOPER_UNLOCK_KEY) === normalizeEmail(email)
  } catch {
    return false
  }
}

export function unlockDeveloperSession(email, storage = globalThis.sessionStorage) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  storage?.setItem(DEVELOPER_UNLOCK_KEY, normalized)
  return true
}

export function lockDeveloperSession(storage = globalThis.sessionStorage) {
  storage?.removeItem(DEVELOPER_UNLOCK_KEY)
}

export function readModuleSettings(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(MODULE_SETTINGS_KEY) || '{}')
    return Object.fromEntries(Object.entries(parsed).filter(
      ([key, value]) => MODULE_KEYS.has(key) && typeof value === 'boolean',
    ))
  } catch {
    return {}
  }
}

export function isModuleEnabled(key, storage = globalThis.localStorage) {
  if (!MODULE_KEYS.has(key)) return true
  return readModuleSettings(storage)[key] !== false
}

export function setModuleEnabled(key, enabled, storage = globalThis.localStorage) {
  if (!MODULE_KEYS.has(key)) throw new Error(`Ismeretlen modul: ${key}`)
  const settings = { ...readModuleSettings(storage), [key]: Boolean(enabled) }
  storage?.setItem(MODULE_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export function enableAllModules(storage = globalThis.localStorage) {
  storage?.removeItem(MODULE_SETTINGS_KEY)
}
