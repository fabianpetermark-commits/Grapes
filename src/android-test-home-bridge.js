import { isGrapesAndroidApp } from './android-bridge.js'

const RESULT_EVENT = 'grapes:android-result'
const REQUEST_TIMEOUT_MS = 120000

/** QA-only bridge. Never returns a TEST JWT to the app WebView origin. */
function qaRequest(method, ...args) {
  if (!isGrapesAndroidApp()) {
    return Promise.reject(new Error('A külön Grapes Android TEST-alkalmazás szükséges.'))
  }
  const requestId = globalThis.crypto.randomUUID()
  return new Promise((resolve,reject) => {
    let timeout
    const finish = callback => {
      globalThis.clearTimeout(timeout)
      globalThis.removeEventListener(RESULT_EVENT,listener)
      callback()
    }
    const listener = event => {
      if (event.detail?.requestId !== requestId) return
      finish(() => event.detail.ok
        ? resolve(event.detail.payload)
        : reject(new Error(event.detail.error || 'Natív TEST-kapu hiba.')))
    }
    timeout = globalThis.setTimeout(
      () => finish(() => reject(new Error('A natív TEST-kapu nem válaszol.'))),
      REQUEST_TIMEOUT_MS)
    globalThis.addEventListener(RESULT_EVENT,listener)
    try {
      globalThis.GrapesAndroid.postMessage(JSON.stringify({ method,args,requestId }))
    } catch(error) { finish(() => reject(error)) }
  })
}
export { isGrapesAndroidApp }

export async function getAndroidTestAuthEnabled() {
  return (await qaRequest('getTestAuthEnabled')) === 'true'
}
export async function getAndroidTestAuthSubject() {
  const user = await qaRequest('getTestAuthSubject')
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user))
    throw new Error('A hitelesített TEST-fiókazonosító nem ellenőrizhető.')
  return user.toLowerCase()
}
export function requestAndroidTestSupabase(method,...args) {
  if (!['supabaseTestWhoAmI','supabaseTestRpc'].includes(method))
    throw new Error('Nem engedélyezett natív Home TEST-művelet.')
  return qaRequest(method,...args)
}
export function requestAndroidTestAccountSignOut() {
  if (!isGrapesAndroidApp())
    throw new Error('A Grapes TEST Android app nem aktív.')
  globalThis.GrapesAndroid.postMessage(JSON.stringify({
    method:'openTestAuthSignOut',args:[],requestId:globalThis.crypto.randomUUID(),
  }))
}
