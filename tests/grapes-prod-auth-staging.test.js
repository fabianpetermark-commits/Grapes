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
  const wrongCallback = new URL(authorize)
  wrongCallback.searchParams.set('redirect_to', 'hu.grapes.healthconnect.test://auth/callback?state=' + state)
  assert.equal(validateProdAuthorizeUrl(wrongCallback.href, state), false)
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

test('native PROD callback and owner gate cannot expose unbound legacy data', () => {
  const activity = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  const gate = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/ProdAuthGate.kt')
  const callback = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/ProdAuthCallback.kt')
  const gradle = read('android-health-connect-poc/app/build.gradle.kts')
  const manifest = read('android-health-connect-poc/app/src/main/AndroidManifest.xml')
  const stableRelease = read('.github/workflows/release-android.yml')
  assert.match(activity, /BuildConfig\.GRAPES_PROD_AUTH_ENABLED/)
  assert.match(activity, /isTrustedProdAuthPage\(\)/)
  assert.match(activity, /prodGate\.allowApp\(isTrustedProdAuthPage\(\),/)
  assert.match(gate, /ownerPreferences\.getString\("owner-uid", null\)/)
  assert.doesNotMatch(gate, /putString\("owner-uid"/)
  assert.match(callback, /yopabovoxyffhokhbgxl\.supabase\.co/)
  assert.match(callback, /hu\.grapes\.healthconnect:\/\/auth\/callback/)
  assert.match(callback, /uri\.scheme != "hu\.grapes\.healthconnect"/)
  assert.doesNotMatch(callback, /uri\.scheme != "hu\.grapes\.healthconnect\.test"/)
  assert.match(gradle, /buildConfigField\("boolean", "GRAPES_PROD_AUTH_ENABLED", "false"\)/)
  assert.match(manifest, /android:scheme="hu\.grapes\.healthconnect"/)
  assert.doesNotMatch(stableRelease, /VITE_GRAPES_PROD_AUTH_ENABLED/)
})

test('PROD Grapes sign-out is independently gated and never replaces Drive sign-out', () => {
  const html = read('design/android-mobile-preview.html')
  const shell = read('src/android-mobile-shell.js')
  const icons = read('src/android-mobile-icons.js')
  assert.match(html, /data-prod-auth-signout hidden/)
  assert.match(html, /data-account-login/)
  assert.match(html, /data-mobile-icon="account"/)
  assert.match(icons, /account: '<circle/)
  assert.match(shell, /openProdAuthSignOut/)
  assert.match(shell, /VITE_GRAPES_PROD_AUTH_ENABLED/)
  assert.match(shell, /VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED/)
  assert.match(shell, /prodSignoutButton\.hidden = !prodAuthNative/)
  assert.match(shell, /disconnectGrapesDrive/)
})

test('empty installs need no backup; owner enrollment still requires informed consent and Android device credential', () => {
  const activity = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  const gate = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/ProdAuthGate.kt')
  const nativeOAuth = read('src/auth/grapes-android-prod-oauth.js')
  const entry = read('src/login-auth-prod.js')
  assert.match(gate, /canOfferBinding\(fromTrustedAuthPage: Boolean, verifiedUserId: String\)/)
  assert.match(gate, /ownerPreferences\.getString\("owner-uid", null\)\.isNullOrBlank\(\)/)
  assert.doesNotMatch(gate, /putString\("owner-uid"/)
  assert.match(activity, /KeyguardManager/)
  assert.match(activity, /keyguard\?\.isDeviceSecure != true/)
  assert.match(activity, /Ha a Grapes alkalmazás üres, nincs szükség biztonsági mentésre/)
  assert.match(activity, /nincs megőrzendő korábbi adatom/)
  assert.doesNotMatch(activity, /A fontos Grapes-adataimról biztonsági mentést készítettem/)
  assert.match(activity, /prodOwnerCredentialLauncher\.launch\(credentialIntent\)/)
  assert.match(activity, /result\.resultCode != RESULT_OK \|\| !prodGate\.canOfferBinding/)
  assert.match(activity, /prodGatePreferences\.edit\(\)\.putString\("owner-uid", verifiedUserId\)\.commit\(\)/)
  assert.match(activity, /val pending = pendingProdOwnerRequest \?: return@registerForActivityResult/)
  assert.match(nativeOAuth, /return call\('completeProdAuthLogin', \[verifiedUserId\]\)/)
  assert.match(entry, /await nativeOAuth\.enterApp\(verifiedUser\.id\)/)
  assert.match(entry, /navigatingToApp = false/)
  assert.doesNotMatch(activity, /\.clear\(\).*Food|deleteAllFood|deleteAllFinance|remove\("grapes-water-v1"\)/)
})

test('Food backup is directly reachable on Android through existing non-destructive dispatcher', () => {
  const html = read('design/android-mobile-preview.html')
  const food = read('src/food/food-mobile.js')
  const android = read('src/android-bridge.js')
  assert.match(html, /data-food-menu="backup-export"[^>]*>Ételnapló mentése<\/button>/)
  assert.match(food, /closest\('\[data-food-menu\]'\)/)
  assert.match(food, /return exportBackup\(\)/)
  assert.match(food, /await saveAndroidJsonBackup\(filename, json\)/)
  assert.match(android, /beginFoodBackupExport/)
  assert.match(html, /data-water-export/)
})
