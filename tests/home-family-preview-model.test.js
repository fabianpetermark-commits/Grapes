import test from 'node:test'
import assert from 'node:assert/strict'
import { projectOneHomeFamilyPreview } from '../src/home/home-family-preview-model.js'
import { createHomeState, SCHEMA_VERSION } from '../src/home/home-data.js'
const H = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const source = () => ({
  householdId: H, role: 'editor', revision: 2,
  inventory: [{ id: 'stock-1', householdId: H, name: 'Közös liszt',
    quantityBase: 2000, displayUnit: 'g', dimension: 'mass',
    storageLocation: 'pantry', observedAt: '2026-10-27T08:00:00Z',
    evidenceStatus: 'confirmed', sourceType: 'manual', sourceId: null }],
  shopping: [{ id: 'shop-1', householdId: H, name: 'Közös tej',
    quantityBase: 1000, displayUnit: 'ml', dimension: 'volume',
    status: 'planned', sourceType: 'manual' }],
})
test('authenticated family v2 projects only manual inventory and shopping into One Home display', () => {
  const snapshot = source(), view = projectOneHomeFamilyPreview(snapshot,H)
  assert.equal(view.householdId,H)
  assert.equal(view.role,'editor')
  assert.equal(view.revision,2)
  assert.equal(view.inventory[0].quantityBase,2000)
  assert.equal(view.shopping[0].name,'Közös tej')
  assert.ok(Object.isFrozen(view.shopping) && Object.isFrozen(view.inventory))
  snapshot.shopping[0].name='Mutated on the wire'
  assert.equal(view.shopping[0].name,'Közös tej')
  assert.equal('events' in view,false)
  assert.equal('prepared' in view,false)
})
test('v1 local Home stays independent from TEST remote projection', () => {
  const v1 = createHomeState(), before = JSON.stringify(v1)
  assert.equal(SCHEMA_VERSION,1)
  projectOneHomeFamilyPreview(source(),H)
  assert.equal(JSON.stringify(v1),before)
})
test('reject remote snapshots for another home or invented owner/role', () => {
  assert.throws(()=>projectOneHomeFamilyPreview(source(),B))
  assert.throws(()=>projectOneHomeFamilyPreview({...source(),role:'administrator'},H))
  assert.throws(()=>projectOneHomeFamilyPreview({...source(),revision:1.2},H))
})
test('reject shared items with personal source, foreign household, unknown units or duplicate ID', () => {
  const s=source()
  for (const bad of [
    {...s, shopping:[{...s.shopping[0],householdId:B}]},
    {...s, shopping:[{...s.shopping[0],sourceType:'finance'}]},
    {...s, inventory:[{...s.inventory[0],sourceType:'health'}]},
    {...s, inventory:[{...s.inventory[0],displayUnit:'unknown'}]},
    {...s, inventory:[s.inventory[0],s.inventory[0]]},
    {...s, shopping:[{...s.shopping[0],quantityBase:-1000}]},
  ]) assert.throws(()=>projectOneHomeFamilyPreview(bad,H))
})
