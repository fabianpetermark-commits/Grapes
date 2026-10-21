import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const get = p => readFileSync(p, 'utf8')
const build = get('android-health-connect-poc/app/build.gradle.kts')
const updater = get('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/AndroidUpdateManager.kt')
const notifications = get('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/UpdateNotifications.kt')
const label = get('android-health-connect-poc/app/src/qa/res/values/strings.xml')
const drive = get('src/storage/grapes-drive.js')
const ebookWeb = get('src/ebook-library.js')
const ebookMobile = get('src/ebook-mobile-library.js')
const workflow = get('.github/workflows/grapes-test-v28-candidate.yml')

test('latest PROD code has isolated QA APK package, display name and signing', () => {
  assert.match(build, /applicationId\s*=\s*"hu\.grapes\.healthconnect"/)
  assert.match(build, /create\("qa"\)[\s\S]*applicationIdSuffix\s*=\s*"\.test"/)
  assert.match(build, /ANDROID_TEST_KEYSTORE_PATH/)
  assert.match(build, /signingConfigs\.getByName\("qa"\)/)
  assert.match(label, /<string name="app_name">Grapes TEST<\/string>/)
  assert.match(notifications, /BuildConfig\.BUILD_TYPE == "qa"[\s\S]*Grapes TEST frissítés érhető el/)
})

test('TEST only updater rejects production releases and wrong package identity', () => {
  assert.match(updater, /BuildConfig\.BUILD_TYPE == "qa"\)[\s\S]*findTestRelease/)
  assert.match(updater, /TEST_ANDROID_TAG = Regex\("android-test-v/)
  assert.match(updater, /TEST_RELEASES_API_URL/)
  assert.match(updater, /if \(BuildConfig\.BUILD_TYPE == "qa"\)[\s\S]*archive\?\.packageName == context\.packageName/)
  assert.match(updater, /RELEASE_API_URL\s*=\s*"https:\/\/api\.github\.com\/repos\/fabianpetermark-commits\/Grapes\/releases\/latest"/)
})

test('TEST stays in independent Drive and E-book folders when flagged', () => {
  assert.match(drive, /VITE_GRAPES_TEST_CHANNEL === '1' \? 'Grapes TEST' : 'Grapes'/)
  for (const file of [ebookWeb, ebookMobile]) {
    assert.match(file, /VITE_GRAPES_TEST_CHANNEL === '1' \? 'Grapes TEST E-book Library' : 'Grapes E-book Library'/)
  }
})

test('candidate is validation-only: no automatic release, no write permission, no production signing', () => {
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /:app:assembleQa/)
  assert.doesNotMatch(workflow, /gh release create|:app:assembleRelease|ANDROID_KEYSTORE_BASE64|ANDROID_TEST_KEYSTORE_BASE64|upload-artifact/)
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches:/)
})
