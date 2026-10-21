import test from 'node:test'
import assert from 'node:assert/strict'
import { bindGrapesTestLogin } from '../src/auth/grapes-login-controller.js'

const fakeEl = () => ({ disabled: false, hidden: false, textContent: '', type: 'password', value: '', attrs: {}, handlers: {},
  setAttribute(k,v) { this.attrs[k] = v }, addEventListener(n,f) { this.handlers[n]=f },
  closest() { return this },
  async emit(n) { return this.handlers[n]({ preventDefault() {} }) },
})
function fixture(flow) {
  const selectors = ['#grapes-login-form','#grapes-username','#grapes-password','#google-sign-in','#register','#forgot-password','#toggle-password','.submit-button','#grapes-feedback','#grapes-sign-out','.separator','.footer-links']
  const elements = Object.fromEntries(selectors.map(s=>[s,fakeEl()]))
  return { elements, ...bindGrapesTestLogin({querySelector:s=>elements[s]},flow) }
}
test('without TEST config, no credential submission or Google redirect',async()=>{
  const f=fixture()
  assert.equal(f.configured,false)
  assert.equal(f.elements['.submit-button'].disabled,true)
  await f.elements['#grapes-login-form'].emit('submit')
  assert.match(f.elements['#grapes-feedback'].textContent,/nincs konfigurálva/)
})
test('email login delegates only on explicit form submit and empties password',async()=>{
  const calls=[]
  const f=fixture({signInWithPassword:async(...args)=>calls.push(args)})
  f.elements['#grapes-username'].value=' a@example.invalid '
  f.elements['#grapes-password'].value='secret'
  await f.elements['#grapes-login-form'].emit('submit')
  assert.deepEqual(calls,[['a@example.invalid','secret']])
  assert.equal(f.elements['#grapes-password'].value,'')
  assert.equal(f.elements['#grapes-sign-out'].hidden,false)
})
test('username aliases are safely rejected during TEST',async()=>{
  let called=false
  const f=fixture({signInWithPassword:async()=>{called=true}})
  f.elements['#grapes-username'].value='nickname'
  await f.elements['#grapes-login-form'].emit('submit')
  assert.equal(called,false)
})
test('Google redirect is supplied by the official adapter, not Drive',async()=>{
  let used=0
  const f=fixture({signInWithGoogle:async()=>{used++}})
  await f.elements['#google-sign-in'].emit('click')
  assert.equal(used,1)
})
test('signup needs a second deliberate submit',async()=>{
  let used=0
  const f=fixture({signUp:async()=>{used++;return {status:'confirmation_required'}}})
  await f.elements['#register'].emit('click')
  assert.equal(f.getMode(),'registration')
  assert.equal(used,0)
  f.elements['#grapes-username'].value='a@example.invalid'
  await f.elements['#grapes-login-form'].emit('submit')
  assert.equal(used,1)
})
test('password reset uses no password and gives non-enumerating feedback',async()=>{
  let email
  const f=fixture({requestPasswordReset:async e=>{email=e}})
  await f.elements['#forgot-password'].emit('click')
  f.elements['#grapes-username'].value='a@example.invalid'
  await f.elements['#grapes-login-form'].emit('submit')
  assert.equal(email,'a@example.invalid')
  assert.match(f.elements['#grapes-feedback'].textContent,/Ha ehhez/)
})

test('password recovery callback switches into password-only update mode', async () => {
  let changed
  const f = fixture({updatePassword: async password => {changed=password}})
  f.setRecoveryMode()
  assert.equal(f.getMode(),'update')
  assert.equal(f.elements['#grapes-username'].hidden,true)
  assert.equal(f.elements['.submit-button'].textContent,'Új jelszó mentése')
  f.elements['#grapes-password'].value='new-test-password'
  await f.elements['#grapes-login-form'].emit('submit')
  assert.equal(changed,'new-test-password')
  assert.equal(f.getMode(),'login')
})


test('verified account shows sign-out and hides credential inputs/Google sign-in', () => {
  const f = fixture({ signOut: async () => {} })
  f.setSession({id:'verified-user'})
  assert.equal(f.elements['#grapes-sign-out'].hidden,false)
  assert.equal(f.elements['#grapes-login-form'].hidden,true)
  assert.equal(f.elements['#google-sign-in'].hidden,true)
  assert.equal(f.elements['.footer-links'].hidden,true)
  f.setSession(null)
  assert.equal(f.elements['#grapes-sign-out'].hidden,true)
  assert.equal(f.elements['#grapes-login-form'].hidden,false)
  assert.equal(f.elements['#google-sign-in'].hidden,false)
  assert.equal(f.elements['.footer-links'].hidden,false)
})

test('sign-out clears credentials, mode and account-specific state', async () => {
  let signouts=0
  const f = fixture({signOut:async()=>{signouts++}})
  f.setSession({id:'verified-user'})
  f.elements['#grapes-username'].value = 'private@example.invalid'
  f.elements['#grapes-password'].value = 'previous password'
  await f.elements['#grapes-sign-out'].emit('click')
  assert.equal(signouts,1)
  assert.equal(f.elements['#grapes-username'].value,'')
  assert.equal(f.elements['#grapes-password'].value,'')
  assert.equal(f.elements['#grapes-login-form'].hidden,false)
  assert.equal(f.elements['#grapes-sign-out'].hidden,true)
  assert.match(f.elements['#grapes-feedback'].textContent,/Kijelentkeztél/)
})

test('expired recovery session cannot leave a password-update form available', () => {
  const f=fixture({updatePassword: async()=>{}})
  f.setSession({id:'recovering-user'})
  f.setRecoveryMode()
  assert.equal(f.elements['#grapes-login-form'].hidden,false)
  f.setSession(null)
  assert.equal(f.getMode(),'login')
  assert.equal(f.elements['#grapes-sign-out'].hidden,true)
  assert.equal(f.elements['#grapes-username'].hidden,false)
  assert.equal(f.elements['#grapes-login-form'].hidden,false)
})
