import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('standalone platform uses native Android authorization instead of embedded GIS', async () => {
  const source = await read('../src/ebook/standalone-platform.js')
  assert.match(source, /window\.EbookAndroid\?\.postMessage/)
  assert.match(source, /androidRequest\('authorizeGoogleDrive', requestedFullRead\)/)
  assert.match(source, /androidRequest\('disconnectGoogleDrive', token\)/)
  assert.match(source, /if \(!native && !config\.clientId\)/)
  assert.match(source, /loadGoogleIdentity\(\)/)
  assert.match(source, /ebook:android-result/)
  assert.match(source, /config\.storageNamespace/)
  assert.match(source, /:drive-session/)
})

test('Android package is isolated from Grapes and exposes only the E-book bridge', async () => {
  const gradle = await read('../android-ebook/app/build.gradle.kts')
  const manifest = await read('../android-ebook/app/src/main/AndroidManifest.xml')
  const activity = await read('../android-ebook/app/src/main/java/hu/grapes/ebook/MainActivity.kt')
  assert.match(gradle, /applicationId = "hu\.grapes\.ebook"/)
  assert.doesNotMatch(gradle, /hu\.grapes\.healthconnect/)
  assert.match(manifest, /android:label="@string\/app_name"/)
  assert.match(activity, /EbookAndroid/)
  assert.match(activity, /appassets\.androidplatform\.net/)
  assert.match(activity, /authorizeGoogleDrive/)
  assert.match(activity, /disconnectGoogleDrive/)
  assert.match(activity, /JSONArray\(result\.grantedScopes\.map \{ it\.scopeUri \}\)/)
  const platform = await read('../src/ebook/platform.js')
  const library = await read('../src/ebook-library.js')
  const styles = await read('../src/styles/screens/ebook-library.css')
  assert.match(library, /typeof window\.EbookAndroid\?\.postMessage === 'function'/)
  assert.match(library, /Androidon válassz Google-fiókot/)
  assert.match(styles, /ebook-library__quick-add-actions\{flex:0 0 auto;width:100%;\}/)
  assert.match(styles, /ebook-library__quick-group--usb\{flex:none;\}/)
  assert.match(activity, /onJsConfirm/)
  assert.match(activity, /AlertDialog/)
  assert.doesNotMatch(activity, /GrapesAndroid|HealthConnect|Supabase|Yazio/i)
})

test('Android asset build is limited to the standalone E-book entry points', async () => {
  const packageJson = JSON.parse(await read('../package.json'))
  const vite = await read('../vite.config.js')
  assert.match(packageJson.scripts['build:ebook-android-web'], /--mode ebook-standalone/)
  assert.match(packageJson.scripts['build:ebook-android-web'], /android-ebook\/app\/src\/main\/assets/)
  assert.match(vite, /standaloneBuild\s*\?\s*\{/)
  assert.match(vite, /ebookReader: resolve/)
})
