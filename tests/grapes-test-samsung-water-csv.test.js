import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSamsungWaterCsv } from '../src/water/grapes-test-samsung-water-csv.js'
import { prepareFreshOwnerWaterHydration } from '../src/water/grapes-test-fresh-water-health.js'

const NAME = 'com.samsung.health.water_intake.20261026.csv'
const A = '00000000-0000-4000-8000-000000000001'
const HEADER = 'com.samsung.health.water_intake.datauuid,com.samsung.health.water_intake.start_time,com.samsung.health.water_intake.amount,com.samsung.health.water_intake.pkg_name'
const row = (id, ms, amount) => `"${id}",${ms},${amount},com.sec.android.app.shealth`

test('Samsung Health CSV to actual native Water preview, dedup and strict source', () => {
  const csv = [HEADER, row('water-1', 1792919700000, 250), row('water-2', 1792920300000, 300)].join('\r\n')
  const bundle = parseSamsungWaterCsv(csv, { filename: NAME })
  assert.equal(bundle.schemaVersion, 1)
  assert.equal(bundle.producer, 'hu.grapes.healthconnect')
  assert.equal(bundle.records.length, 2)
  assert.equal(bundle.records[0].type, 'hydration')
  assert.equal(bundle.records[0].volumeMilliliters, 250)
  assert.equal(bundle.records[0].externalId, 'samsunghealth:com.sec.android.app.shealth:water-1')
  const first = prepareFreshOwnerWaterHydration(bundle, { ownerId: A })
  assert.equal(first.counts.ready, 2)
  const firstKey = first.records[0].entry.externalKey
  const repeated = prepareFreshOwnerWaterHydration(bundle, { ownerId: A,
    existingDays: { '2026-10-25': { entries: [{ externalKey: firstKey }] } } })
  assert.equal(repeated.counts.ready, 1)
  assert.equal(repeated.counts.duplicate, 1)
})

test('CSV refuses wrong filename, unknown header, malformed amount or missing UUID', () => {
  const valid = [HEADER, row('water-1', 1792919700000, 250)].join('\n')
  assert.throws(() => parseSamsungWaterCsv(valid, { filename: 'steps.csv' }), /water_intake/)
  assert.throws(() => parseSamsungWaterCsv('step_count,day_time\n50,50', { filename: NAME }), /Nem ismert/)
  assert.throws(() => parseSamsungWaterCsv([HEADER, row('water-1', 1792919700000, -100)].join('\n'), { filename: NAME }), /nem tartalmaz érvényes|Hibás/)
  assert.throws(() => parseSamsungWaterCsv([HEADER, row('', 1792919700000, 250)].join('\n'), { filename: NAME }), /nem tartalmaz érvényes|Hiányzó/)
  assert.throws(() => parseSamsungWaterCsv([HEADER, row('water-1', 1792919700000, 250),
    row('water-2', 1792919700000, 'bad')].join('\n'), { filename: NAME }), /semmit sem importálunk/)
})
test('CSV quoted header, safe quoted rows and stable source names', () => {
  const csv = ['Samsung Health export', HEADER,
    '"uuid,part",1792919700000,250,com.sec.android.app.shealth'].join('\n')
  const result = parseSamsungWaterCsv(csv, { filename: NAME })
  assert.equal(result.records[0].externalId,
    'samsunghealth:com.sec.android.app.shealth:uuid,part')
})
