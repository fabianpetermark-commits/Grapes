import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeGrapesTestAuthConfig, startGrapesTestAuth,
  GRAPES_TEST_PROJECT_URL, GRAPES_TEST_STORAGE_KEY,
} from '../src/auth/grapes-test-runtime.js'

const publishableKey = 'sb_publishable_EXAMPLEONLYNOTAREALKEYA1'
const location = 'https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html'
const storage = { getItem() { return null }, setItem() {}, removeItem() {} }
const config = (changes={})=>({
  url: GRAPES_TEST_PROJECT_URL, publishableKey, location,
  sessionStorage: storage, ...changes,
})
function fakeEl() {
  return {
    disabled:false, hidden:false, textContent:'', type:'password', value:'',attrs:{},listeners:{},
    setAttribute(k,v) {this.attrs[k]=v},
    addEventListener(k,v) {this.listeners[k]=v},
    closest() {return this},
    async emit(k) {return this.listeners[k]({preventDefault() {}})},
  }
}
function rootFixture() {
  const names = ['#grapes-login-form','#grapes-username','#grapes-password','#google-sign-in','#register','#forgot-password','#toggle-password','.submit-button','#grapes-feedback','#grapes-sign-out']
  const elements = Object.fromEntries(names.map(n=>[n,fakeEl()]))
  return { root:{querySelector:s=>elements[s]},elements }
}
function sdkFixture() {
  let callback, unsubscribed=false, args
  const auth = {
    signInWithPassword: async () => ({data:{user:{id:'user1'},session:{access_token:'fake'}},error:null}),
    signInWithOAuth: async () => ({data:{url:'https://google.example.invalid'},error:null}),
    signUp: async () => ({data:{user:{id:'user1'},session:null},error:null}),
    resetPasswordForEmail: async () => ({data:{},error:null}),
    getUser: async () => ({data:{user:{id:'user1',email:'fake@example.invalid'}},error:null}),
    signOut: async () => ({data:{},error:null}),
    onAuthStateChange(fn) {callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true}}}}}
  }
  return {
    createClient(...values) {args=values;return {auth}},
    get args() {return args},
    emit(event, session) {callback(event,session)},
    get unsubscribed() {return unsubscribed},
  }
}
test('TEST client requires exact Grapes project URL, never another user project',()=>{
  assert.throws(()=>makeGrapesTestAuthConfig(config({url:'https://different.supabase.co'})), /Grapes TEST Supabase URL/)
})
test('secret and legacy API keys are rejected; require publishable',()=>{
  for(const publishableKey of ['service_role_fake','sb_secret_fake','eyJhbGciOiJIUzI1NiJ9','']) {
    assert.throws(()=>makeGrapesTestAuthConfig(config({publishableKey})),/publishable/)
  }
})
test('only approved HTTPS origin and preview path permitted',()=>{
  for(const site of ['http://evil.test/Grapes/login-auth-test.html','https://evil.test/Grapes/login-auth-test.html','https://fabianpetermark-commits.github.io/Grapes/index.html']) {
    assert.throws(()=>makeGrapesTestAuthConfig(config({location:site})),/jóváhagyott/)
  }
})
test('no missing session store fallback to unscoped localStorage',()=>{
  assert.throws(()=>makeGrapesTestAuthConfig(config({sessionStorage:null})),/munkamenet/)
})
test('PKCE, isolated sessionStorage and recovery redirect are configured',()=>{
  const result=makeGrapesTestAuthConfig(config())
  assert.equal(result.callbackUrl,location)
  assert.equal(result.recoveryUrl,location)
  assert.equal(result.storageKey,GRAPES_TEST_STORAGE_KEY)
  assert.strictEqual(result.storage,storage)
})
test('no SDK factory means no TEST login and no network',async()=>{
  await assert.rejects(startGrapesTestAuth(config()), /kliens/)
})
test('official client factory is dependency-injected and session is validated',async()=>{
  const sdk=sdkFixture()
  const {root,elements}=rootFixture()
  const run=await startGrapesTestAuth({...config(),root,createClient:sdk.createClient})
  assert.equal(sdk.args[0],GRAPES_TEST_PROJECT_URL)
  assert.equal(sdk.args[1],publishableKey)
  assert.deepEqual(sdk.args[2].auth,{
    flowType:'pkce',
    detectSessionInUrl:true,
    autoRefreshToken:true,
    persistSession:true,
    storageKey:GRAPES_TEST_STORAGE_KEY,
    storage,
  })
  assert.equal(elements['#grapes-sign-out'].hidden,false)
  sdk.emit('SIGNED_OUT',null)
  assert.equal(elements['#grapes-sign-out'].hidden,true)
  sdk.emit('SIGNED_IN',{user:{id:'user1'}})
  assert.equal(elements['#grapes-sign-out'].hidden,false)
  run.dispose()
  assert.equal(sdk.unsubscribed,true)
})
