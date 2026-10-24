import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
const html=read('design/android-mobile-preview.html')
const food=read('src/food/food-mobile.js')
const shell=read('src/android-mobile-shell.js')
const native=read('android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt')

test('Simple Food rollout keeps backup and separate Water history export/restore',()=>{
  for (const control of ['data-food-menu="backup-export"','data-food-menu="backup-import"',
    'data-water-export','data-water-restore','data-water-backup-input'])
    assert.ok(html.includes(control),'Missing backup control: '+control)
  assert.match(food,/foodBackupToJson\(project\)/)
  assert.match(food,/foodBackupFromJson\(await file\.text\(\), profile\.id\)/)
  assert.match(shell,/waterBackupToJson\(localStorage\)/)
  assert.match(shell,/waterBackupFromJson\(await file\.text\(\)\)/)
  assert.match(shell,/restoreWaterBackupVerified\(localStorage, restored, crypto\.randomUUID\(\), storageKey\)/)
  assert.match(native,/viznaplo-/)
})

test('Simple Food rollout has no profile-merging controls and blocks unknown Drive overwrites',()=>{
  assert.doesNotMatch(html,/data-food-reconcile/)
  assert.doesNotMatch(food,/previewFoodSameAccountAdoption|stageReconciliation|publishReconciliation/)
  assert.match(food,/assertFoodDriveCreateSafe\(await listGrapesProjects\(MODULE\)\)/)
  assert.match(food,/verifyFoodRemoteBeforeUpload\(remote\.data, snapshot, driveBaseline\)/)
})
