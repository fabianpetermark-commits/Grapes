import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validateGrapesProdAuthConfig, GrapesProdAuthConfigError,
  GRAPES_TEST_PROJECT_REF, GRAPES_PROD_PROJECT_REF, GRAPES_PROD_ANDROID_PACKAGE,
  GRAPES_PROD_ANDROID_CALLBACK,
} from '../src/auth/grapes-prod-config.js'

const ref = GRAPES_PROD_PROJECT_REF
const valid = {
  enabled: true,
  applicationId: GRAPES_PROD_ANDROID_PACKAGE,
  projectRef: ref,
  approvedProjectRef: ref,
  legacyDataIsolationReviewed: true,
  supabaseUrl: `https://${ref}.supabase.co`,
  publishableKey: 'sb_publishable_0123456789abcdefghijklmn',
}
const fail = (args) => assert.throws(
  () => validateGrapesProdAuthConfig(args), GrapesProdAuthConfigError,
)

test('production auth stays OFF unless explicitly enabled', () => {
  assert.deepEqual(validateGrapesProdAuthConfig(), { enabled: false })
  assert.deepEqual(validateGrapesProdAuthConfig({ ...valid, enabled: false }), { enabled: false })
  assert.ok(Object.isFrozen(validateGrapesProdAuthConfig(valid)))
})

test('production MUST NOT use TEST Supabase project or spoofed production URLs', () => {
  fail({ ...valid, projectRef: GRAPES_TEST_PROJECT_REF, supabaseUrl: `https://${GRAPES_TEST_PROJECT_REF}.supabase.co` })
  fail({ ...valid, projectRef: 'abcdefghijklmnopqrst', approvedProjectRef: 'abcdefghijklmnopqrst', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co' })
  fail({ ...valid, supabaseUrl: `https://${GRAPES_TEST_PROJECT_REF}.supabase.co` })
  fail({ ...valid, supabaseUrl: 'http://' + ref + '.supabase.co' })
  fail({ ...valid, supabaseUrl: `https://${ref}.supabase.co/evil` })
  fail({ ...valid, supabaseUrl: `https://${ref}.supabase.co.evil.test` })
  fail({ ...valid, projectRef: 'rrqrmbiclapopgrcypye', supabaseUrl: 'https://rrqrmbiclapopgrcypye.supabase.co' })
  fail({ ...valid, projectRef: 'not a project!' })
  fail({ ...valid, approvedProjectRef: undefined })
  fail({ ...valid, legacyDataIsolationReviewed: false })
})

test('PROD package is distinct from TEST and no secret/service-role API key allowed', () => {
  fail({ ...valid, applicationId: 'hu.grapes.healthconnect.test' })
  fail({ ...valid, publishableKey: 'sb_secret_0123456789abcdefghijklmn' })
  fail({ ...valid, publishableKey: 'service_role' })
  fail({ ...valid, publishableKey: '' })
  fail({ ...valid, publishableKey: undefined })
})

test('valid configuration is scoped to PROD Android and its isolated auth origin', () => {
  const config = validateGrapesProdAuthConfig(valid)
  assert.equal(GRAPES_PROD_PROJECT_REF, 'yopabovoxyffhokhbgxl')
  assert.equal(config.enabled, true)
  assert.equal(config.supabaseUrl, `https://${ref}.supabase.co`)
  assert.equal(config.callbackUrl, GRAPES_PROD_ANDROID_CALLBACK)
  assert.equal(config.storageKey, `grapes-prod-auth-${ref}`)
  assert.ok(config.authUrl.startsWith('https://grapes-prod-auth.invalid/'))
  assert.equal(JSON.stringify(config).includes(GRAPES_TEST_PROJECT_REF), false)
})

test('no automatic migration or TEST key usage in the existing stable PROD application', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  const gradle = read('android-health-connect-poc/app/build.gradle.kts')
  const mainActivity = read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')
  const workflow = read('.github/workflows/release-android.yml')
  const prodConfig = read('src/auth/grapes-prod-config.js')
  assert.match(gradle, /applicationId = "hu.grapes.healthconnect"/)
  assert.match(workflow, /ref: codex\/android-app/)
  assert.doesNotMatch(workflow, /android-test-v\d+|GRAPES_TEST_SUPABASE_/)
  assert.doesNotMatch(mainActivity, /grapes-test-auth\.invalid|aighqtqjlzirlokxwupt/)
  assert.doesNotMatch(prodConfig, /localStorage\.|indexedDB|deleteAll|clearAll|migrateFood/)
})
