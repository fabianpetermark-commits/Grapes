import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../src/android-mobile-shell.js', import.meta.url), 'utf8')

test('Food QA panel remains hidden and requires explicit TEST-only native gates', () => {
  assert.match(html, /data-grapes-test-food-qa hidden/)
  assert.match(shell, /VITE_GRAPES_TEST_CHANNEL === '1'/)
  assert.match(shell, /VITE_GRAPES_TEST_DATA_ENABLED === 'true'/)
  assert.match(shell, /VITE_GRAPES_TEST_FOOD_SYNTHETIC_ENABLED === 'true'/)
  assert.match(shell, /getAndroidTestAuthEnabled\(\)/)
})

test('Food QA action buttons use the full panel width instead of the 42px settings icon grid', () => {
  for (const action of ['prepare', 'save', 'read', 'isolation']) {
    assert.match(html, new RegExp('class="grapes-test-food-action" type="button" data-grapes-test-food-' + action))
    assert.doesNotMatch(html, new RegExp('class="setting" type="button" data-grapes-test-food-' + action))
  }
  assert.match(html, /\[data-grapes-test-food-qa\] \.grapes-test-food-action \{/)
  assert.match(html, /width: 100%; min-height: 52px/)
  assert.match(html, /overflow-wrap: anywhere; cursor: pointer/)
})

test('Proof output distinguishes pending, failed and independently verified remote readback', () => {
  assert.match(html, /data-grapes-test-food-status>Nem indult próba\./)
  assert.match(html, /\[data-grapes-test-food-status\]\[data-state="success"\]/)
  assert.match(html, /\[data-grapes-test-food-status\]\[data-state="error"\]/)
  assert.match(shell, /qaStatus\.dataset\.state = method === 'readBack' \|\| method === 'isolation' \? 'success' : 'pending'/)
  assert.match(shell, /qaStatus\.dataset\.state = 'error'/)
  assert.match(shell, /PASS: a külön szerveroldali Food-visszaolvasás egyezik/)
  assert.match(shell, /a másik TEST-fiók szintetikus szerveradatai nem olvashatók/)
})
