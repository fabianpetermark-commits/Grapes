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
const authHtml = read('login-auth-test.html')
const authCss = read('src/styles/screens/login-auth-test.css')
const icons = read('src/android-mobile-icons.js')

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


test('signed-in QA users see a branded startup cover until Supabase verification, never the login flash', () => {
  const head = authHtml.split('</head>')[0]
  assert.match(head, /document\.documentElement\.setAttribute\('data-grapes-qa-starting', 'true'\)/)
  assert.match(head, /https:\/\/grapes-test-auth\.invalid\/assets\/login-auth-test\.html/)
  assert.match(authHtml, /id="grapes-qa-startup"/)
  assert.match(authCss, /html\[data-grapes-qa-starting="true"\] \.login-page \{ visibility: hidden; \}/)
  assert.match(authCss, /html\[data-grapes-qa-starting="true"\] \.grapes-qa-startup/)
  assert.match(auth, /navigatingToApp = true/)
  assert.match(auth, /if \(nativeOAuth && !navigatingToApp\) revealLogin\(\)/)
  assert.match(auth, /app\.client\.auth\.getUser\(\)/)
  assert.match(auth, /app\.notifyVerified\(data\.user\)/)
  assert.match(auth, /document\.documentElement\.removeAttribute\('data-grapes-qa-starting'\)/)
  assert.match(auth, /suppressAutoOpen: logoutRequested/)
})

test('the last Settings action is exactly Kijelentkezés with a door exit pictogram', () => {
  const more = mobile.split('data-page="more" hidden>')[1]?.split('data-page="food"')[0]
  assert.ok(more, 'Settings markup missing')
  assert.match(more, /<h1>Beállítások<\/h1>/)
  assert.match(more, /<p class="eyebrow">Fiók és alkalmazás<\/p>/)
  assert.match(more, /aria-label="Kapcsolódó oldalak"/)
  assert.match(mobile, /more: \['Beállítások', 'Fiók és alkalmazás'\]/)
  assert.match(shell, /more: \['Beállítások', 'Fiók és alkalmazás'\]/)
  assert.ok(more.lastIndexOf('data-grapes-test-logout hidden') > more.lastIndexOf('A Grapes névjegye'))
  assert.match(more, /data-grapes-test-logout hidden[^>]*><span class="setting__icon" data-mobile-icon="exit"/)
  assert.match(more, /<strong>Kijelentkezés<\/strong><\/span>/)
  assert.doesNotMatch(more, /Kijelentkezés a Grapes-fiókból|Csak a TEST-fiók munkamenetét zárja le/)
  assert.match(icons, /exit: '<path d="M10 3H5/)
  assert.match(shell, /getAndroidTestAuthEnabled\(\)/)
  assert.match(shell, /grapesTestLogout\.hidden = !enabled/)
})
