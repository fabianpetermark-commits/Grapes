import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../android-health-connect-poc/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('a manifest csak a POC-hoz szükséges Health Connect jogokat kéri', async () => {
  const manifest = await read('app/src/main/AndroidManifest.xml');
  for (const permission of [
    'READ_NUTRITION',
    'WRITE_NUTRITION',
    'READ_HYDRATION',
    'READ_HEALTH_DATA_HISTORY',
  ]) {
    assert.match(manifest, new RegExp(`android\\.permission\\.health\\.${permission}`));
  }
  assert.doesNotMatch(manifest, /WRITE_HYDRATION/);
  assert.match(manifest, /ACTION_SHOW_PERMISSIONS_RATIONALE/);
  assert.match(manifest, /VIEW_PERMISSION_USAGE/);
});

test('az export szerződés verziózott és megköveteli a deduplikációs kulcsot', async () => {
  const schema = JSON.parse(await read('bridge-contract.schema.json'));
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.producer.const, 'hu.grapes.healthconnect');
  const record = schema.properties.records.items;
  assert.ok(record.required.includes('externalId'));
  assert.equal(record.properties.externalId.pattern, '^(healthconnect|samsunghealth):');
  assert.deepEqual(record.properties.type.enum, ['nutrition', 'hydration']);
});

test('a Samsung-víz adapter opcionális, csak olvasási jogosultságot kér', async () => {
  const build = await read('app/build.gradle.kts');
  const source = await read(
    'app/src/samsung/java/hu/grapes/healthconnect/SamsungWaterBridgeFactory.kt',
  );
  const stub = await read(
    'app/src/samsungStub/java/hu/grapes/healthconnect/SamsungWaterBridgeFactory.kt',
  );
  assert.match(build, /samsung-health-data-api-1\.1\.0\.aar/);
  assert.match(source, /Permission\.of\(DataTypes\.WATER_INTAKE, AccessType\.READ\)/);
  assert.doesNotMatch(source, /AccessType\.WRITE/);
  assert.match(source, /externalId = "samsunghealth:\$source:\$\{point\.uid\}"/);
  assert.match(stub, /override val available = false/);
});

test('a bridge saját rekordot kizár és stabil kliensazonosítóval ír', async () => {
  const source = await read(
    'app/src/main/java/hu/grapes/healthconnect/HealthConnectBridge.kt',
  );
  assert.match(source, /TEST_CLIENT_RECORD_ID = "grapes-poc-nutrition-v1"/);
  assert.match(source, /clientRecordVersion = 1/);
  assert.match(source, /filterNot \{ it\.sourcePackage == context\.packageName \}/);
  assert.match(source, /pageToken = token/g);
});
