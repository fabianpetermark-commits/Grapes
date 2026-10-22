import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const authHtml = read('login-auth-test.html')
const appHtml = read('design/android-mobile-preview.html')
const shell = read('src/android-mobile-shell.js')
const authEntry = read('src/login-auth-test.js')
const authCss = read('src/styles/screens/login-auth-test.css')
const logo = read('public/grapes-logo.svg')
const SESSION = 'grapes-test-auth-aighqtqjlzirlokxwupt'
const AUTH_URL = 'https://grapes-test-auth.invalid/assets/login-auth-test.html'
const APP_URL = 'https://appassets.androidplatform.net/assets/design/android-mobile-preview.html'

function firstInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  assert.ok(match, 'the prepaint check must run in HEAD as an inline script')
  assert.ok(html.indexOf(match[0]) < html.indexOf('</head>'), 'must run before first paint')
  return match[1]
}
function runHead(script, { url, token = null, qaBuild = true, unavailable = false } = {}) {
  const attributes = new Map()
  const source = script.replaceAll('%VITE_GRAPES_TEST_AUTH_ENABLED%', qaBuild ? 'true' : 'false')
  runInNewContext(source, {
    location: { href: url },
    localStorage: {
      getItem(key) {
        assert.equal(key, SESSION, 'only the established TEST Supabase key may be examined')
        if (unavailable) throw new Error('Web storage unavailable')
        return token
      },
    },
    document: {
      documentElement: { setAttribute(key, value) { attributes.set(key, value) } },
    },
  })
  return attributes
}

test('signed-in Grapes TEST displays loader before paint but never uses storage as authorization', () => {
  const attributes = runHead(firstInlineScript(authHtml), {
    url: AUTH_URL,
    token: '{"access_token":"existing-test-only"}',
  })
  assert.equal(attributes.get('data-grapes-qa-starting'), 'true')
  assert.match(authEntry, /app\.client\.auth\.getUser\(\)/)
  assert.match(authEntry, /onAuthenticated: nativeOAuth/)
  assert.match(authCss, /html\[data-grapes-qa-starting="true"\] \.login-page \{ visibility: hidden; \}/)
})

test('never show extra loading screen for new or explicitly signed-out Grapes user', () => {
  const script = firstInlineScript(authHtml)
  assert.equal(runHead(script, { url: AUTH_URL }).size, 0)
  assert.equal(runHead(script, { url: AUTH_URL, unavailable: true }).size, 0)
  assert.equal(runHead(script, { url: 'https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html', token: '{}' }).size, 0)
  assert.match(authEntry, /finishSignOut\(\)/)
  assert.match(authEntry, /revealLogin\(\)/)
})

test('startup uses the exact canonical Grapes logo asset, not redrawn or misaligned shapes', () => {
  assert.match(authHtml, /<img src="\.\/grapes-logo\.svg" width="96" height="96" alt="" decoding="async">/)
  assert.match(logo, /viewBox="0 0 96 96"/)
  const container = authHtml.split('class="grapes-qa-startup__mark"')[1].split('</div>')[0]
  assert.doesNotMatch(container, /<svg/)
  assert.match(authCss, /object-fit: contain/)
  assert.match(authCss, /width: 96px;\s*height: 96px;/)
})

test('QA startup suppresses legacy Drive welcome from first paint, PROD and web do not', () => {
  const head = firstInlineScript(appHtml)
  assert.equal(runHead(head, { url: APP_URL, qaBuild: true }).get('data-grapes-qa-native-app'), 'true')
  assert.equal(runHead(head, { url: APP_URL, qaBuild: false }).size, 0)
  assert.equal(runHead(head, { url: 'https://fabianpetermark-commits.github.io/Grapes/design/android-mobile-preview.html', qaBuild: true }).size, 0)
  assert.match(appHtml, /html\[data-grapes-qa-native-app="true"\] #login \{ visibility: hidden; \}/)
  assert.match(shell, /qaNativeAuthenticated/)
  assert.match(shell, /isGrapesDriveConnected\(\) \|\| localMode\(\) \|\| qaNativeAuthenticated\) showApp\(\)/)
  assert.match(shell, /document\.documentElement\.removeAttribute\('data-grapes-qa-native-app'\)/)
  assert.doesNotMatch(shell, /if \(qaNativeAuthenticated\) setLocalMode\(true\)/)
})

test('TEST and existing Drive authorization remain separate; no new token or account storage', () => {
  assert.match(authHtml, /getItem\('grapes-test-auth-aighqtqjlzirlokxwupt'\)/)
  assert.doesNotMatch(authHtml, /setItem\(/)
  assert.doesNotMatch(appHtml.split('</head>')[0], /setItem\(/)
  assert.match(shell, /if \(isGrapesDriveConnected\(\)\) registerFoodSharing/)
  assert.match(shell, /function showLogin\(/)
})
