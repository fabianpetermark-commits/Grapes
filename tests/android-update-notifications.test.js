import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../android-health-connect-poc/app/', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('az Android app rendszerértesítést kérhet a frissítésekhez', () => {
  const manifest = read('src/main/AndroidManifest.xml')
  const activity = read('src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/)
  assert.match(activity, /Értesítés az új verziókról/)
  assert.match(activity, /notificationPermissionLauncher\.launch/)
})

test('a háttérmunka hatóránként ellenőrzi az új release-t', () => {
  const worker = read('src/main/java/hu/grapes/healthconnect/UpdateCheckWorker.kt')
  assert.match(worker, /PeriodicWorkRequestBuilder<UpdateCheckWorker>\(6, TimeUnit\.HOURS\)/)
  assert.match(worker, /enqueueUniquePeriodicWork/)
  assert.match(worker, /findAvailableRelease/)
})

test('a frissítési értesítés az app frissítési folyamatába vezet vissza', () => {
  const notifications = read('src/main/java/hu/grapes/healthconnect/UpdateNotifications.kt')
  const activity = read('src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  assert.match(notifications, /Grapes frissítés érhető el/)
  assert.match(notifications, /EXTRA_OPEN_UPDATE/)
  assert.match(activity, /findAvailableRelease\(force\)/)
  assert.doesNotMatch(activity, /showUpdateDialog\(release\)/)
  assert.match(activity, /publishAvailableUpdate\(release\)/)
  assert.match(activity, /"getAvailableUpdate"/)
  assert.match(activity, /"installAvailableUpdate"/)
  assert.match(activity, /"installAvailableUpdate"[\s\S]*downloadAndInstallUpdate\(release\)[\s\S]*sendResult\(requestId, "\{\}"\)/)
})

test('minden appindítás frissen ellenőrzi az elérhető kiadást', () => {
  const activity = read('src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  assert.match(activity, /webView\.loadUrl\(testGate\.initialUrl\(APP_URL, TEST_AUTH_URL\)\)[\s\S]*checkForAppUpdate\(force = true\)/)
})

test('az Android app közvetlenül a telefonos alkalmazáskeretet nyitja meg', () => {
  const activity = read('src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  assert.match(activity, /assets\/design\/android-mobile-preview\.html/)
})
