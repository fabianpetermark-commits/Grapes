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
