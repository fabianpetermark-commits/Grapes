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
const signedTestRelease = read('.github/workflows/release-android-test.yml')
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

test('regular TEST commits use lightweight checks without Gradle, Java or APK uploads', () => {
  assert.match(qaPreview, /name: Grapes TEST fast checks \(manual APK only\)/)
  assert.match(qaPreview, /concurrency:[\s\S]*cancel-in-progress: true/)
  assert.match(qaPreview, /- run: npm test/)
  assert.match(qaPreview, /- run: npm run build:android-web/)
  assert.match(qaPreview, /node tests\/android-recipe-ingredient\.browser\.mjs/)
  assert.match(qaPreview, /workflow_dispatch:/)
  for (const step of [
    'uses: actions/setup-java@v4',
    'name: Install Android SDK 36',
    'uses: gradle/actions/setup-gradle@v4',
    'name: Build QA variant (debug-signed preview only)',
    'name: Check isolated package identity',
    'uses: actions/upload-artifact@v4',
  ]) {
    const position = qaPreview.indexOf(step)
    assert.ok(position >= 0, 'Missing opt-in step: ' + step)
    assert.match(qaPreview.slice(position).split(String.fromCharCode(10)).slice(0, 3).join(String.fromCharCode(10)), /if: github\.event_name == 'workflow_dispatch'/,
      'Native step must be manual-only: ' + step)
  }
  // Signed releases are a separate, explicit workflow; never generate them on
  // every pushed Food UI change.
  assert.match(signedTestRelease, /paths:\s*\n\s*- android-health-connect-poc\/test-release\.json/)
  assert.match(signedTestRelease, /:app:assembleQa/)
  assert.match(signedTestRelease, /Signer #1 certificate SHA-256 digest/)
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

test('TEST signed releases require a separate persistent key and are isolated from production', () => {
  assert.match(signedTestRelease, /name: Publish signed Grapes TEST prerelease/)
  assert.match(signedTestRelease, /branches:\s*\n\s*- integration\/grapes-test-food-20261017/)
  assert.match(signedTestRelease, /android-health-connect-poc\/test-release\.json/)
  assert.match(signedTestRelease, /if: github\.ref == 'refs\/heads\/integration\/grapes-test-food-20261017'/)
  assert.match(signedTestRelease, /ANDROID_TEST_KEYSTORE_BASE64/)
  assert.match(signedTestRelease, /ANDROID_TEST_KEYSTORE_PASSWORD/)
  assert.match(signedTestRelease, /ANDROID_TEST_KEY_ALIAS/)
  assert.match(signedTestRelease, /ANDROID_TEST_KEY_PASSWORD/)
  assert.match(signedTestRelease, /ANDROID_TEST_KEYSTORE_PATH/)
  assert.doesNotMatch(signedTestRelease, /ANDROID_KEYSTORE_BASE64|ANDROID_KEYSTORE_PASSWORD|assembleRelease/)
  assert.match(signedTestRelease, /gradle --project-dir android-health-connect-poc :app:assembleQa/)
  assert.match(signedTestRelease, /hu\.grapes\.healthconnect\.test/)
  assert.match(signedTestRelease, /versionCode='\$\{GRAPES_VERSION_CODE\}'/)
  assert.match(signedTestRelease, /Signer #1 certificate SHA-256 digest/)
  assert.match(signedTestRelease, /cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33/)
  assert.match(signedTestRelease, /gh release create "android-test-v/)
  assert.match(signedTestRelease, /--prerelease/)
  assert.doesNotMatch(signedTestRelease, /--latest|ref: codex\/android-app|pull_request:/)
  assert.match(signedTestRelease, /grapes-test-v\$\{GRAPES_VERSION_CODE\}\.apk/)
})

test('QA secrets are scoped to signing step, not npm or test execution', () => {
  const buildSection = signedTestRelease.slice(signedTestRelease.indexOf('Build APK with persistent TEST-only signing key'))
  const browserSection = signedTestRelease.slice(0, signedTestRelease.indexOf('Build APK with persistent TEST-only signing key'))
  assert.doesNotMatch(browserSection, /secrets\.ANDROID_TEST_/)
  assert.match(buildSection, /secrets\.ANDROID_TEST_KEYSTORE_BASE64/)
  assert.match(buildSection, /trap 'rm -f "\$TEST_KEYSTORE"' EXIT/)
  assert.match(buildSection, /base64 --decode/)
})

test('the approved stable release workflow is not retargeted to TEST', () => {
  assert.match(stableRelease, /ref: codex\/android-app/)
  assert.match(stableRelease, /gh release create "android-v/)
  assert.match(stableRelease, /--latest/)
  assert.doesNotMatch(stableRelease, /ANDROID_TEST_|--prerelease/)
})
