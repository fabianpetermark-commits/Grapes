const RESULT_EVENT = 'grapes:android-result'
const REQUEST_TIMEOUT_MS = 120000

export function isGrapesAndroidApp() {
  try { return typeof window.GrapesAndroid?.postMessage === 'function' }
  catch { return false }
}

function nativeRequest(method, ...args) {
  if (!isGrapesAndroidApp()) {
    return Promise.reject(new Error('Ez a funkció csak a Grapes Android-alkalmazásban érhető el.'))
  }
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const finish = callback => {
      window.clearTimeout(timeout)
      window.removeEventListener(RESULT_EVENT, listener)
      callback()
    }
    const listener = event => {
      if (event.detail?.requestId !== requestId) return
      finish(() => event.detail.ok ? resolve(event.detail.payload) : reject(new Error(event.detail.error || 'Az Android-művelet nem sikerült.')))
    }
    const timeout = window.setTimeout(() => finish(() => reject(new Error('Az Android-művelet túl sokáig tartott.'))), REQUEST_TIMEOUT_MS)
    window.addEventListener(RESULT_EVENT, listener)
    try { window.GrapesAndroid.postMessage(JSON.stringify({ method, args, requestId })) }
    catch (error) { finish(() => reject(error)) }
  })
}

// The native TEST scanner displays its own camera UI with torch. Returns an
// EAN/UPC string, or "" when the user cancels. The OFF lookup stays in Food.
export function scanAndroidFoodBarcode() {
  return nativeRequest('scanFoodBarcode')
}

export function readAndroidHealthExport(fromDate) {
  return nativeRequest('readHealthData', fromDate)
}

export function readAndroidHealthExportSilent(fromDate) {
  return nativeRequest('readHealthDataSilent', fromDate)
}

export async function requestAndroidYazio(operation, ...args) {
  return JSON.parse(await nativeRequest('yazio', operation, ...args))
}

export function readAndroidSamsungHealthExport(fromDate) {
  return nativeRequest('readSamsungHealthData', fromDate)
}

export function openAndroidHealthConnectSettings() {
  return nativeRequest('openHealthConnectSettings')
}

export async function authorizeAndroidGoogleDrive(fullRead = false) {
  const payload = await nativeRequest('authorizeGoogleDrive', Boolean(fullRead))
  return JSON.parse(payload)
}

export function disconnectAndroidGoogleDrive(accessToken = '') {
  return nativeRequest('disconnectGoogleDrive', accessToken)
}

// Grapes account login is independent from the existing E-book Google Drive.
// Both methods are deliberately TEST-only on the native side.
export async function getAndroidTestAuthEnabled() {
  return (await nativeRequest('getTestAuthEnabled')) === 'true'
}

// QA native gate retains only the user ID verified at Auth login in memory.
// It never exposes an access token or the separate Auth page's storage.
export async function getAndroidTestAuthSubject() {
  const subject = await nativeRequest('getTestAuthSubject')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject)) {
    throw new Error('A TEST-fiókazonosító nem ellenőrizhető.')
  }
  return subject.toLowerCase()
}

// TEST-only native data transport. It returns RPC JSON, never the bearer.
// The native side allows only fixed Supabase RPC names and the exact app asset.
export function requestAndroidTestSupabase(method, ...args) {
  if (!['supabaseTestWhoAmI', 'supabaseTestRpc'].includes(method)) {
    throw new Error('Nem engedélyezett TEST Supabase-művelet.')
  }
  return nativeRequest(method, ...args)
}

export function requestAndroidTestAccountSignOut() {
  if (!isGrapesAndroidApp()) throw new Error('A Grapes TEST alkalmazás nem érhető el.')
  // The native Activity immediately navigates to the isolated Auth origin;
  // do not await a response from the WebView being navigated away from.
  window.GrapesAndroid.postMessage(JSON.stringify({
    method: 'openTestAuthSignOut', requestId: crypto.randomUUID(), args: [],
  }))
}

export async function getAndroidAppUpdate() {
  const payload = await nativeRequest('getAvailableUpdate')
  return JSON.parse(payload || 'null')
}

export function installAndroidAppUpdate(versionCode) {
  return nativeRequest('installAvailableUpdate', Number(versionCode))
}


export async function requestAndroidFoodApi(kind, query, page = 1, pageSize = 12, region = 'hu') {
  return JSON.parse(await nativeRequest('foodApi', kind, query, page, pageSize, region))
}

// Android WebView does not download blob: anchors. The native Storage Access
// Framework picker is the only successful-save signal for local Food exports.
// Send bounded chunks so large YAZIO histories do not exceed bridge limits.

/**
 * TEST migration snapshot only. Native must reopen the selected SAF document,
 * verify its SHA-256 and byte count, and return that receipt. A cancelled or
 * interrupted write must never appear successful.
 */
export async function saveAndroidVerifiedHealthBackup(prepared) {
  const { filename, json, bytes, sha256 } = prepared || {}
  if (!/^grapes-health-attekintes-\d{4}-\d{2}-\d{2}\.json$/.test(filename || '') ||
      typeof json !== 'string' || !Number.isSafeInteger(bytes) || bytes < 1 ||
      !/^[0-9a-f]{64}$/.test(sha256 || '')) {
    throw new Error('Érvénytelen Health-mentés.')
  }
  let parsed
  try { parsed = JSON.parse(json) } catch { throw new Error('Hibás Health-mentés JSON.') }
  if (parsed?.grapesHealthMigrationBackup !== true || parsed?.version !== 1 ||
      parsed?.ownership !== 'unclaimed' || !Array.isArray(parsed?.sources) ||
      parsed.sources.length === 0 || new Blob([json]).size !== bytes) {
    throw new Error('A Health-mentés tartalma nem ellenőrizhető.')
  }
  let token = ''
  try {
    token = await nativeRequest('beginFoodBackupExport', filename)
    let offset = 0
    while (offset < json.length) {
      let end = Math.min(offset + 48000, json.length)
      if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end -= 1
      await nativeRequest('appendFoodBackupExport', token, json.slice(offset, end))
      offset = end
    }
    const receipt = JSON.parse(await nativeRequest('finishFoodBackupExport', token, bytes))
    if (receipt?.bytes !== bytes || receipt?.sha256 !== sha256) {
      throw new Error('A mentett Health-fájl visszaolvasása nem igazolható.')
    }
    return receipt
  } catch (error) {
    if (token) await nativeRequest('cancelFoodBackupExport', token).catch(() => {})
    throw error
  }
}

/**
 * TEST-only, user-picked UNCLAIMED legacy backup. Not called by normal UI.
 * The native Android app validates its own signed QA feature flag, trusted
 * app origin and pinned Auth owner, then REOPENS the chosen SAF document for
 * an independent SHA-256 / byte-for-byte verification against staging.
 * Do not use this receipt to infer data ownership or authorize migration.
 */
export async function saveAndroidVerifiedUnclaimedBackup(prepared) {
  const { filename, json, sha256, bytes, manifest } = prepared || {}
  if (!/^grapes-helyi-adatok-\d{4}-\d{2}-\d{2}\.json$/.test(filename || '') ||
      typeof json !== 'string' ||
      !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 80 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(sha256 || '') || !Array.isArray(manifest) ||
      new TextEncoder().encode(json).byteLength !== bytes) {
    throw new Error('A tulajdonos nélküli helyi adatmentés nem érvényes.')
  }
  let envelope
  try { envelope = JSON.parse(json) }
  catch { throw new Error('A helyi adatmentés nem JSON.') }
  if (envelope?.grapesLocalMigrationBackup !== true || envelope.version !== 1 ||
      envelope.ownership !== 'unclaimed' ||
      !Array.isArray(envelope.sources) || !envelope.sources.length ||
      JSON.stringify(envelope.manifest) !== JSON.stringify(manifest)) {
    throw new Error('A helyi mentés forrásai nem igazolhatók.')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  const computed = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (computed !== sha256) {
    throw new Error('A helyi mentés ellenőrzőösszege eltér.')
  }
  let token = ''
  try {
    token = await nativeRequest('beginUnclaimedBackupExport', filename)
    let offset = 0
    while (offset < json.length) {
      let end = Math.min(offset + 48000, json.length)
      if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end -= 1
      if (end <= offset) throw new Error('A helyi mentés UTF-8 felosztása sikertelen.')
      await nativeRequest('appendFoodBackupExport', token, json.slice(offset, end))
      offset = end
    }
    const receipt = JSON.parse(await nativeRequest('finishFoodBackupExport', token, bytes))
    if (receipt?.bytes !== bytes || receipt?.sha256 !== sha256) {
      throw new Error('A fájl független Android-visszaolvasása eltér a mentéstől.')
    }
    return receipt
  } catch (error) {
    if (token) await nativeRequest('cancelFoodBackupExport', token).catch(() => {})
    throw error
  }
}

export async function saveAndroidJsonBackup(filename, json) {
  const safeName = String(filename || '')
  if (!/^grapes-(?:etelnaplo-\d{4}-\d{2}-\d{2}(?:-(?:helyi|drive))?|viznaplo-\d{4}-\d{2}-\d{2})\.json$/.test(safeName)) {
    throw new Error('Érvénytelen biztonsági mentés fájlnév.')
  }
  const content = String(json ?? '')
  let parsed
  try { parsed = JSON.parse(content) } catch { throw new Error('Hibás JSON biztonsági mentés.') }
  const water = safeName.startsWith('grapes-viznaplo-')
  if (!content || (water ? parsed?.grapesWaterBackup !== true : parsed?.grapesFoodBackup !== true)) {
    throw new Error('A biztonsági mentés formátuma érvénytelen.')
  }
  let token = ''
  try {
    token = await nativeRequest('beginFoodBackupExport', safeName)
    let offset = 0
    while (offset < content.length) {
      let end = Math.min(offset + 48000, content.length)
      // Never split a Unicode surrogate pair across UTF-8 write calls.
      if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1])) end -= 1
      await nativeRequest('appendFoodBackupExport', token, content.slice(offset, end))
      offset = end
    }
    const bytes = new Blob([content]).size
    await nativeRequest('finishFoodBackupExport', token, bytes)
    return safeName
  } catch (error) {
    if (token) await nativeRequest('cancelFoodBackupExport', token).catch(() => {})
    throw error
  }
}
