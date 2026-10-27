import { isGrapesAndroidApp } from '../android-bridge.js'

const EVENT='grapes:android-result'
const TIMEOUT_MS=120000

/**
 * TEST-only Android message transport. Deliberately independent from the
 * protected stable src/android-bridge.js. The native Activity alone verifies
 * the origin, authorized owner, TEST package, bearer and RPC allowlist.
 * This module never receives, logs or stores Supabase credentials.
 */
function callNative(method,...args) {
  if (!isGrapesAndroidApp())
    return Promise.reject(new Error('A Grapes natív TEST alkalmazás nem érhető el.'))
  const id=globalThis.crypto?.randomUUID?.()
  if (!id) return Promise.reject(new Error('Nem hozható létre biztonságos kérésazonosító.'))
  return new Promise((resolve,reject)=>{
    let done=false
    const finish=callback=>{
      if(done)return
      done=true
      globalThis.clearTimeout(timer)
      globalThis.removeEventListener(EVENT,listener)
      callback()
    }
    const listener=event=>{
      if(event.detail?.requestId!==id)return
      finish(()=>event.detail.ok
        ? resolve(event.detail.payload)
        : reject(new Error(event.detail?.error||'A natív TEST-művelet sikertelen.')))
    }
    const timer=globalThis.setTimeout(()=>
      finish(()=>reject(new Error('A TEST Android-válasz túl sokáig tartott.'))),TIMEOUT_MS)
    globalThis.addEventListener(EVENT,listener)
    try{
      globalThis.GrapesAndroid.postMessage(JSON.stringify({method,requestId:id,args}))
    }catch(error){finish(()=>reject(error))}
  })
}
export async function getAndroidTestAuthEnabled() {
  return (await callNative('getTestAuthEnabled'))==='true'
}
export async function getAndroidTestAuthSubject() {
  const user=await callNative('getTestAuthSubject')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user||''))
    throw new Error('A natív TEST-fiókazonosító nem ellenőrizhető.')
  return user.toLowerCase()
}
export function requestAndroidTestSupabase(method,...args) {
  if (!['supabaseTestWhoAmI','supabaseTestRpc'].includes(method))
    throw new Error('Tiltott Android TEST Supabase-művelet.')
  return callNative(method,...args)
}
export function requestAndroidTestAccountSignOut() {
  if (!isGrapesAndroidApp())
    throw new Error('A Grapes TEST alkalmazás nem érhető el.')
  // Navigation disposes the source WebView; do not await an orphaned reply.
  const id=globalThis.crypto?.randomUUID?.()
  if (!id) throw new Error('Hiányzó TEST-kérésazonosító.')
  globalThis.GrapesAndroid.postMessage(JSON.stringify({
    method:'openTestAuthSignOut',requestId:id,args:[],
  }))
}
