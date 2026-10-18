import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const html=readFileSync(new URL('../design/android-mobile-preview.html',import.meta.url),'utf8')
const food=readFileSync(new URL('../src/food/food-mobile.js',import.meta.url),'utf8')
const shell=readFileSync(new URL('../src/android-mobile-shell.js',import.meta.url),'utf8')
const bridge=readFileSync(new URL('../src/android-bridge.js',import.meta.url),'utf8')
const native=readFileSync(new URL('../android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/MainActivity.kt',import.meta.url),'utf8')

test('food recovery UX binds a real preview, two separately verified originals, staged approval and rollback',()=>{
  for(const hook of ['data-food-menu="reconcile"','data-food-reconcile-sheet','data-food-reconcile-preview',
    'data-food-reconcile-local','data-food-reconcile-drive','data-food-reconcile-stage',
    'data-food-reconcile-publish','data-food-reconcile-rollback']) {
    assert.ok(html.includes(hook),'Missing reconciliation control: '+hook)
  }
  assert.match(food,/previewFoodSameAccountAdoption\(localSnapshot, remote\.data, account\.email\)/)
  assert.match(food,/account\.id !== remote\.data\.profile\?\.id/)
  assert.match(food,/reconciliationSavedLocal \|\| !reconciliationSavedDrive/)
  assert.match(food,/saveFoodReconciliationRecovery\(recovery\)/)
  assert.match(food,/await loadLocalProject\(localProjectId\(staged\.profile\.id\)\)/)
  assert.match(food,/getConnectedGrapesAccount\(\)/)
  assert.match(food,/if\s*\(reconciliationBusy \|\| project\.syncState\?\.reconciliation\?\.status === 'pending'\)/)
  assert.match(food,/if\(now!==before && now!==expectedSignature\)/)
  assert.match(food,/await loadGrapesProject\(checkpoint\.remoteFileId\)/)
  assert.match(food,/restore|rollbackReconciliation/)
})
test('Food cannot import another backup while Drive reconciliation is pending',()=>{
  assert.match(food,/if \(project\?\.syncState\?\.reconciliation\?\.status === 'pending'\) \{\s*showToast\('Előbb hagyd jóvá/)
})
test('Water history has its own real buttons, native saver and independent JSON schema',()=>{
  for(const key of ['data-water-export','data-water-restore','data-water-backup-input'])assert.ok(html.includes(key))
  assert.match(shell,/waterBackupToJson\(localStorage\)/)
  assert.match(shell,/waterBackupFromJson\(await file\.text\(\)\)/)
  assert.match(shell,/grapes-water-recovery-v1/)
  assert.match(bridge,/grapesWaterBackup/)
  assert.match(native,/viznaplo-/)
})
