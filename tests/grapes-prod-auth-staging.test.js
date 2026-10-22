import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateProdAuthorizeUrl } from '../src/auth/grapes-android-prod-oauth.js'
import { makeGrapesProdAuthConfig } from '../src/auth/grapes-prod-runtime.js'
import { GRAPES_PROD_PROJECT_REF } from '../src/auth/grapes-prod-config.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const project = 'https://' + GRAPES_PROD_PROJECT_REF + '.supabase.co'
const state = 'a'.repeat(64)
const callback = 'hu.grapes.healthconnect://auth/callback?state=' + state
const authorize = project + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(callback)

test('PROD native OAuth strict callback, project and request validation', () => {
  assert.equal(validateProdAuthorizeUrl(authorize, state), true)
  assert.equal(validateProdAuthorizeUrl(authorize.replace(project, 'https://aighqtqjlzirlokxwupt.supabase.co'), state), false)
  assert.equal(validateProdAuthorizeUrl(authorize.replace('hu.grapes.healthconnect:', 'hu.grapes.healthconnect.test:'), state), false)
  assert.equal(validateProdAuthorizeUrl(authorize + '&scope=drive', state), false)
  assert.equal(validateProdAuthorizeUrl(authorize + '&provider=google', state), false)
  assert.equal(validateProdAuthorizeUrl(authorize, 'b'.repeat(64)), false)
})

test('PROD gate forbids activation without reviewed local-data ownership', () => {
  const base = { url: project, publishableKey: 'sb_publishable_0123456789abcdefghijklmn',
    location: 'https://grapes-prod-auth.invalid/assets/login-auth-prod.html',
    nativeOAuth: { begin() {}, resume() {}, cancel() {} },
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} } }
  assert.throws(() => makeGrapesProdAuthConfig(base))
  const ok = makeGrapesProdAuthConfig({ ...base, legacyDataIsolationReviewed: true })
  assert.equal(ok.url, project)
  assert.equal(ok.storageKey, 'grapes-prod-auth-' + GRAPES_PROD_PROJECT_REF)
  assert.throws(() => makeGrapesProdAuthConfig({ ...base, legacyDataIsolationReviewed: true,
    url: 'https://aighqtqjlzirlokxwupt.supabase.co' }))
})

test('PROD login assets remain separate from TEST, guarded by explicit flags', () => {
  const entry = read('src/login-auth-prod.js')
  const html = read('login-auth-prod.html')
  const oauth = read('src/auth/grapes-android-prod-oauth.js')
  assert.match(entry, /VITE_GRAPES_PROD_AUTH_ENABLED/)
  assert.match(entry, /VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED/)
  assert.match(entry, /grapes-android-prod-oauth/)
  assert.match(html, /src="\.\/grapes-logo\.svg"/)
  assert.doesNotMatch(html, /Fiók ellenőrzése…<\/p>/)
  assert.doesNotMatch(entry, /grapes-test-auth|grapes-android-oauth\.js|data-grapes-qa-starting/)
  assert.doesNotMatch(oauth, /hu\.grapes\.healthconnect\.test:\/\/auth/)
  assert.match(read('vite.config.js'), /loginAuthProd: resolve\('login-auth-prod\.html'\)/)
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'))
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.118.0')
  assert.equal(lock.packages[''].dependencies['@supabase/supabase-js'], '2.118.0')
})
