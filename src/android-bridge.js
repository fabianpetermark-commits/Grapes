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

export function readAndroidHealthExport(fromDate) {
  return nativeRequest('readHealthData', fromDate)
}
