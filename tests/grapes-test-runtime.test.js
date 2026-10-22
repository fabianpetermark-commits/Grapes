import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeGrapesTestAuthConfig, startGrapesTestAuth,
  GRAPES_TEST_PROJECT_URL, GRAPES_TEST_STORAGE_KEY,
} from '../src/auth/grapes-test-runtime.js'

const publishableKey = 'sb_publishable_EXAMPLEONLYNOTAREALKEYA1'
const location = 'https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html'
const storage = { getItem() { return null }, setItem() {}, removeItem() {} }
const flush = () => new Promise(done => setImmediate(done))
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
  const names = ['#grapes-login-form','#grapes-username','#grapes-password','#google-sign-in','#register','#forgot-password','#toggle-password','.submit-button','#grapes-feedback','#grapes-sign-out','.separator','.footer-links']
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
    updateUser: async () => ({data:{user:{id:'user1'}},error:null}),
    onAuthStateChange(fn) {callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true}}}}}
  }
  return {
    auth,
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
  await flush()
  assert.equal(elements['#grapes-sign-out'].hidden,false)
  sdk.emit('PASSWORD_RECOVERY',{user:{id:'user1'}})
  await flush()
  assert.equal(run.ui.getMode(),'update')
  run.dispose()
  assert.equal(sdk.unsubscribed,true)
})


test('late startup getUser response never overrides a newer sign-out event', async () => {
  const sdk = sdkFixture()
  let completeFirst
  sdk.auth.getUser = () => new Promise(resolve => { completeFirst = resolve })
  const {root,elements} = rootFixture()
  const started = startGrapesTestAuth({...config(),root,createClient:sdk.createClient})
  assert.equal(typeof completeFirst, 'function')
  sdk.emit('SIGNED_OUT', null)
  completeFirst({data:{user:{id:'stale-account'}},error:null})
  const running = await started
  assert.equal(elements['#grapes-sign-out'].hidden, true)
  assert.equal(elements['#grapes-login-form'].hidden, false)
  running.dispose()
})

test('a late signed-in verification cannot reactivate a signed-out session', async () => {
  const sdk = sdkFixture()
  const {root,elements} = rootFixture()
  const running = await startGrapesTestAuth({...config(),root,createClient:sdk.createClient})
  let completeLate
  sdk.auth.getUser = () => new Promise(resolve => { completeLate = resolve })
  sdk.emit('SIGNED_IN', {user:{id:'account-a'}})
  await flush()
  assert.equal(typeof completeLate, 'function')
  sdk.emit('SIGNED_OUT', null)
  completeLate({data:{user:{id:'account-a'}},error:null})
  await flush()
  assert.equal(elements['#grapes-sign-out'].hidden, true)
  assert.equal(elements['#grapes-login-form'].hidden, false)
  running.dispose()
})

test('initial no-session page is a normal signed-out state', async () => {
  const sdk = sdkFixture()
  sdk.auth.getUser = async () => ({
    data: {user:null},
    error: {name:'AuthSessionMissingError', message:'Auth session missing'},
  })
  const {root,elements} = rootFixture()
  const running = await startGrapesTestAuth({...config(),root,createClient:sdk.createClient})
  assert.equal(elements['#grapes-sign-out'].hidden,true)
  assert.equal(elements['#grapes-login-form'].hidden,false)
  assert.doesNotMatch(elements['#grapes-feedback'].textContent, /nem ellenőrizhető/)
  running.dispose()
})

test('a disposed TEST runtime ignores subsequent auth events', async () => {
  const sdk = sdkFixture()
  const {root,elements} = rootFixture()
  const running = await startGrapesTestAuth({...config(),root,createClient:sdk.createClient})
  running.dispose()
  sdk.emit('SIGNED_OUT',null)
  assert.equal(elements['#grapes-sign-out'].hidden,false)
  assert.equal(sdk.unsubscribed,true)
})


test('verified persisted TEST session opens QA app once; Auth events do not duplicate navigation', async () => {
  const sdk = sdkFixture()
  const { root } = rootFixture()
  const routed = []
  const running = await startGrapesTestAuth({
    ...config(), root, createClient: sdk.createClient,
    onAuthenticated: user => routed.push(user.id),
  })
  await flush()
  assert.deepEqual(routed, ['user1'])
  sdk.emit('SIGNED_IN', {user:{id:'user1'}})
  await flush()
  assert.deepEqual(routed, ['user1'])
  running.dispose()
})

test('no Android app handoff for logged-out, revoked or unverified sessions', async () => {
  const sdk = sdkFixture()
  sdk.auth.getUser = async () => ({
    data:{ user:null }, error:{ name:'AuthSessionMissingError' },
  })
  const { root } = rootFixture()
  const routed = []
  const running = await startGrapesTestAuth({
    ...config(), root, createClient:sdk.createClient,
    onAuthenticated: user => routed.push(user.id),
  })
  sdk.emit('SIGNED_IN', { user:{id:'unverified-account'} })
  await flush()
  assert.deepEqual(routed, [])
  running.dispose()
})

test('explicit logout launch suppresses auto-open even when a persistent session exists', async () => {
  const sdk = sdkFixture()
  const { root } = rootFixture()
  const routed = []
  const running = await startGrapesTestAuth({
    ...config(), root, createClient:sdk.createClient,
    suppressAutoOpen:true,
    onAuthenticated: user => routed.push(user.id),
  })
  sdk.emit('SIGNED_IN', { user:{id:'user1'} })
  await flush()
  assert.deepEqual(routed, [])
  running.dispose()
})

test('Android QA logout releases only TEST Supabase session and clears native logout intent', async () => {
  const sdk = sdkFixture()
  const { root } = rootFixture()
  const actions = []
  const nativeOAuth = {
    begin:async()=>{},resume:async()=>{},cancel:async()=>actions.push('cancel'),
    finishSignOut: async()=>actions.push('finish-qa-logout'),
  }
  const running = await startGrapesTestAuth({
    ...config({location:'https://grapes-test-auth.invalid/assets/login-auth-test.html',nativeOAuth}),
    root,createClient:sdk.createClient,
  })
  await running.ui.getMode()
  const button = root.querySelector('#grapes-sign-out')
  await button.emit('click')
  assert.deepEqual(actions,['cancel','finish-qa-logout'])
  running.dispose()
})
