import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEmptyFoodProject, foodBackupToJson, foodBackupFromJson } from '../src/food/food-data.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Food overview exposes its existing safe backup export action', () => {
  const html = read('design/android-mobile-preview.html')
  const mobile = read('src/food/food-mobile.js')
  assert.match(html, /data-food-backup-export>Ételnapló mentése/)
  assert.equal((html.match(/data-food-backup-export>/g) || []).length, 1)
  assert.match(mobile, /\$\('\[data-food-backup-export\]'\)\.addEventListener\('click', exportBackup\)/)
  assert.match(mobile, /const json = foodBackupToJson\(project\)/)
  assert.match(mobile, /await saveAndroidJsonBackup\(filename, json\)/)
  assert.doesNotMatch(mobile, /data-food-backup-export[^\n]*importBackup/)
})

test('Food export is a read-only, self-contained JSON snapshot and preserves original project', () => {
  const profile = { id: 'backup-user', name: 'Teszt', email: 'backup@example.test' }
  const project = createEmptyFoodProject(profile)
  const before = JSON.stringify(project)
  const blob = foodBackupToJson(project, '2026-10-22T12:00:00.000Z')
  const payload = JSON.parse(blob)
  assert.equal(payload.grapesFoodBackup, true)
  assert.equal(payload.data.profile.id, profile.id)
  assert.equal(payload.exportedAt, '2026-10-22T12:00:00.000Z')
  assert.deepEqual(foodBackupFromJson(blob), project)
  assert.equal(JSON.stringify(project), before)
})
