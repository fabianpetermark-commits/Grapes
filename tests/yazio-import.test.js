import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareYazioCsvImport, yazioImportEntries } from '../src/food/yazio-import.js'

const csv = `Date,Time,Meal,Product,Amount,Unit,Portions,Calories/g,Calories total,Protein/g,Fat/g,Carbs/g,Protein total,Fat total,Carbs total
2026-10-14,2026-10-14 08:10:00,breakfast,"Zabkása, almával",250,gram,1,1.68,420,0.024,0.014,0.048,24,14,48
2026-10-14,2026-10-14 16:02:00,snacks,Joghurt,150,gram,1,0.8,120,0.03,0.02,0.11,4.5,3,16.5`

test('a Yazio nutrition_log.csv étkezéseket és összesített makrókat importál', () => {
  const preview = prepareYazioCsvImport(csv, { profileId: 'profile-1' })
  assert.deepEqual(preview.counts, { ready: 2, duplicate: 0, invalid: 0 })
  const entries = yazioImportEntries(preview)
  assert.equal(entries[0].snapshot.name, 'Zabkása, almával')
  assert.equal(entries[0].mealType, 'breakfast')
  assert.equal(entries[0].snapshot.nutrients.energyKcal, 420)
  assert.equal(entries[1].mealType, 'afternoonSnack')
})

test('a Yazio import ismételt sorokat nem kettőz meg', () => {
  const first = yazioImportEntries(prepareYazioCsvImport(csv, { profileId: 'profile-1' }))
  const repeated = prepareYazioCsvImport(csv, { profileId: 'profile-1', existingEntries: first })
  assert.deepEqual(repeated.counts, { ready: 0, duplicate: 2, invalid: 0 })
})

test('a Yazio import elutasít más CSV-formátumot', () => {
  assert.throws(() => prepareYazioCsvImport('name,value\na,1', { profileId: 'profile-1' }), /nutrition_log/)
})
