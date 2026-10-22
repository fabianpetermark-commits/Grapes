import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateGrapesProdAuthEnvironment,
  GRAPES_PROD_AUTH_CALLBACK,
  GRAPES_TEST_PROJECT_REF,
} from '../src/auth/grapes-prod-environment.js'

const PROD_REF = 'qwertyuiopasdfghjklz'
const params = {
  approvedProjectRef: PROD_REF,
  projectUrl: `https://${PROD_REF}.supabase.co`,
  publishableKey: 'sb_publishable_example1234567890123456789',
}

test('only explicitly approved distinct production Supabase environment is accepted', () => {
  const cfg = validateGrapesProdAuthEnvironment(params)
  assert.equal(cfg.url, params.projectUrl)
  assert.equal(cfg.publishableKey, params.publishableKey)
  assert.equal(cfg.redirectTo, GRAPES_PROD_AUTH_CALLBACK)
  assert.equal(cfg.storageKey, 'grapes-prod-auth-' + PROD_REF)
  assert.ok(Object.isFrozen(cfg))
})

test('without an approved project, production Auth fails closed', () => {
  assert.throws(() => validateGrapesProdAuthEnvironment({
    projectUrl: params.projectUrl,
    publishableKey: params.publishableKey,
  }), /még nincs jóváhagyva/)
  assert.throws(() => validateGrapesProdAuthEnvironment({
    ...params,
    approvedProjectRef: GRAPES_TEST_PROJECT_REF,
    projectUrl: `https://${GRAPES_TEST_PROJECT_REF}.supabase.co`,
  }), /még nincs jóváhagyva/)
})

test('production Auth rejects swapped project URLs and unknown hosts', () => {
  for (const projectUrl of [
    `https://${GRAPES_TEST_PROJECT_REF}.supabase.co`,
    'https://example.com',
    'http://qwertyuiopasdfghjklz.supabase.co',
    'https://qwertyuiopasdfghjklz.supabase.co.evil.example',
  ]) {
    assert.throws(() => validateGrapesProdAuthEnvironment({ ...params, projectUrl }), /TEST vagy idegen/)
  }
})

test('never accept Supabase service-role, secret, or non-publishable keys', () => {
  for (const publishableKey of [
    undefined, '', 'sb_secret_aaaaaaaaaaaaaaaaaaaa',
    'service_role_secret_aaaaaaaa', 'eyJhbGciOiJIUzI1NiJ9',
    'sb_publishable_short',
  ]) {
    assert.throws(() => validateGrapesProdAuthEnvironment({ ...params, publishableKey }), /publishable/)
  }
})

test('Android production app callback is fixed and isolated from TEST scheme', () => {
  assert.throws(() => validateGrapesProdAuthEnvironment({
    ...params, callback: 'hu.grapes.healthconnect.test://auth/callback',
  }), /visszatérési cím/)
  assert.equal(GRAPES_PROD_AUTH_CALLBACK, 'hu.grapes.healthconnect://auth/callback')
  assert.notEqual(GRAPES_PROD_AUTH_CALLBACK, 'hu.grapes.healthconnect.test://auth/callback')
})
