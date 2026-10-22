import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const native = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')
const gate = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/TestAuthGate.kt')
const mobile = read('design/android-mobile-preview.html')
const shell = read('src/android-mobile-shell.js')
const bridge = read('src/android-bridge.js')
const auth = read('src/login-auth-test.js')

test('QA no longer displays navigation strip and starts isolated Auth first', () => {
  assert.doesNotMatch(native, /Grapes TEST-fiók \/ alkalmazás/)
  assert.match(native, /setContentView\(webView\)/)
  assert.match(native, /webView\.loadUrl\(testGate\.initialUrl\(APP_URL, TEST_AUTH_URL\)\)/)
  assert.match(gate, /if \(enabled\) authUrl else appUrl/)
  assert.match(gate, /authorized = false/)
  assert.match(native, /private val isTestQa get\(\) = BuildConfig\.APPLICATION_ID == "hu\.grapes\.healthconnect\.test"/)
})

test('native QA app cannot be opened from an unverified browser navigation', () => {
  assert.match(native, /!testGate\.canDisplayApp\(\)/)
  assert.match(native, /testGate\.allowApp\(isTrustedTestAuthPage\(\)\)/)
  assert.match(native, /"completeTestAuthLogin"/)
  assert.match(gate, /if \(!enabled \|\| !fromTrustedAuthPage\) return false/)
})

test('logout is QA-only, separate from Drive, pending across process restart and clears after signout', () => {
  assert.match(native, /"openTestAuthSignOut"/)
  assert.match(native, /"takeTestAuthLaunchMode"/)
  assert.match(native, /"finishTestAuthSignOut"/)
  assert.match(native, /putBoolean\("logout-pending", true\)\.commit\(\)/)
  assert.match(native, /remove\("logout-pending"\)\.commit\(\)/)
  assert.match(mobile, /data-grapes-test-logout hidden/)
  assert.match(shell, /getAndroidTestAuthEnabled\(\)/)
  assert.match(shell, /requestAndroidTestAccountSignOut\(\)/)
  assert.match(bridge, /getAndroidTestAuthEnabled/)
  assert.match(mobile, /data-account-login/)
  assert.match(native, /"authorizeGoogleDrive"/)
  assert.match(auth, /scope: 'local'/)
  assert.match(auth, /suppressAutoOpen: logoutRequested/)
})

test('PROD Auth remains disabled and never shares the E-book Drive OAuth credentials', () => {
  const build = read('android-health-connect-poc/app/build.gradle.kts')
  assert.match(build, /buildConfigField\("boolean", "GRAPES_TEST_AUTH_ENABLED", "false"\)/)
  assert.match(build, /applicationIdSuffix = "\.test"/)
  assert.match(bridge, /authorizeAndroidGoogleDrive/)
  assert.match(bridge, /disconnectAndroidGoogleDrive/)
  assert.doesNotMatch(auth, /disconnectGrapesDrive|clearToken|revokeDrive/)
})
