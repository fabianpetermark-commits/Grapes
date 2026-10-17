import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const gradle = read('android-health-connect-poc/app/build.gradle.kts')
const qaLabel = read('android-health-connect-poc/app/src/qa/res/values/strings.xml')
const updater = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/AndroidUpdateManager.kt')
const notifications = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/UpdateNotifications.kt')
const stableRelease = read('.github/workflows/release-android.yml')
const qaPreview = read('.github/workflows/build-android-test.yml')
const driveStorage = read('src/storage/grapes-drive.js')
const ebookLibrary = read('src/ebook-library.js')
const mobileEbookLibrary = read('src/ebook-mobile-library.js')

test('TEST APK has its own Android package ID and visual identity', () => {
  assert.match(gradle, /applicationId\s*=\s*"hu\.grapes\.healthconnect"/)
  assert.match(gradle, /create\("qa"\)[\s\S]*applicationIdSuffix\s*=\s*"\.test"/)
  assert.match(gradle, /versionNameSuffix\s*=\s*"-test"/)
  assert.match(qaLabel, /<string name="app_name">Grapes TEST<\/string>/)
  assert.match(notifications, /BuildConfig\.BUILD_TYPE == "qa"[\s\S]*Grapes TEST frissítés érhető el/)
})

test('QA release feed is separate from the unchanged stable latest feed', () => {
  assert.match(updater, /RELEASE_API_URL\s*=\s*"https:\/\/api\.github\.com\/repos\/fabianpetermark-commits\/Grapes\/releases\/latest"/)
  assert.match(updater, /TEST_RELEASES_API_URL\s*=\s*"https:\/\/api\.github\.com\/repos\/fabianpetermark-commits\/Grapes\/releases\?per_page=100"/)
  assert.match(updater, /BuildConfig\.BUILD_TYPE == "qa"/)
  assert.match(updater, /TEST_ANDROID_TAG = Regex\("android-test-v/)
  assert.match(updater, /release\.optBoolean\("draft"\) \|\| !release\.optBoolean\("prerelease"\)/)
  assert.match(updater, /if \(versionCode <= highestVersion\) continue/)
  assert.match(updater, /assetName != "grapes-test-v\$versionCode\.apk"/)
  assert.match(updater, /if \(!digest\.matches\(SHA256_PATTERN\)\) continue/)
  assert.match(updater, /if \(BuildConfig\.BUILD_TYPE == "qa"\)[\s\S]*archive\?\.packageName == context\.packageName/)
})

test('TEST previews use the QA variant and have no release publication', () => {
  assert.match(qaPreview, /gradle --project-dir android-health-connect-poc :app:assembleQa/)
  assert.match(qaPreview, /grapes-test-preview-apk/)
  assert.match(qaPreview, /hu\.grapes\.healthconnect\.test/)
  assert.doesNotMatch(qaPreview, /gh release create|contents: write/)
})

test('Existing production release remains on its original branch and latest channel', () => {
  assert.match(stableRelease, /ref: codex\/android-app/)
  assert.match(stableRelease, /:app:assembleRelease/)
  assert.match(stableRelease, /--latest/)
  assert.match(stableRelease, /android-v\$/)
  assert.doesNotMatch(stableRelease, /android-test-v|assembleQa/)
})

test('TEST web assets write into separate Drive folders', () => {
  assert.match(qaPreview, /VITE_GRAPES_TEST_CHANNEL: '1'/)
  for (const source of [driveStorage, ebookLibrary, mobileEbookLibrary]) {
    assert.match(source, /import\.meta\.env\.VITE_GRAPES_TEST_CHANNEL === '1'/)
  }
  assert.match(driveStorage, /'Grapes TEST' : 'Grapes'/)
  assert.match(ebookLibrary, /'Grapes TEST E-book Library' : 'Grapes E-book Library'/)
  assert.match(mobileEbookLibrary, /'Grapes TEST E-book Library' : 'Grapes E-book Library'/)
})

test('integrated Food v23 retains its new native bridges without active FatSecret API', () => {
  const food = read('src/food/food-mobile.js')
  const api = read('src/food/food-api.js')
  const activity = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  const gradle = read('android-health-connect-poc/app/build.gradle.kts')
  assert.match(food, /firstProductBarcode|food-barcode\.js/)
  assert.match(activity, /FoodApiBridge/)
  assert.doesNotMatch(api, /searchFatSecretProducts|lookupFatSecretProduct|fatSecretBridgeRequest/)
  assert.match(gradle, /applicationIdSuffix = "\.dev"/)
  assert.match(gradle, /applicationIdSuffix = "\.test"/)
})
