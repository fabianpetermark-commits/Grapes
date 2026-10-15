import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../android-health-connect-poc/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('az Android alkalmazás csak a szükséges Health Connect jogokat kéri', async () => {
  const manifest = await read('app/src/main/AndroidManifest.xml');
  for (const permission of [
    'READ_NUTRITION',
    'READ_HYDRATION',
  ]) {
    assert.match(manifest, new RegExp(`android\\.permission\\.health\\.${permission}`));
  }
  assert.doesNotMatch(manifest, /WRITE_HYDRATION/);
  assert.doesNotMatch(manifest, /WRITE_NUTRITION/);
  assert.match(manifest, /READ_HEALTH_DATA_HISTORY/);
  assert.match(manifest, /ACTION_SHOW_PERMISSIONS_RATIONALE/);
  assert.match(manifest, /VIEW_PERMISSION_USAGE/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(manifest, /android:name="\.MainActivity"[\s\S]*android:screenOrientation="portrait"/);
});

test('a Grapes felület helyi Android assetként fut és csak a fő keret kap natív hidat', async () => {
  const activity = await read(
    'app/src/main/java/hu/grapes/healthconnect/MainActivity.kt',
  );
  const webBridge = await read('../src/android-bridge.js');
  const mobileFood = await read('../src/food/food-mobile.js');
  assert.match(activity, /WebViewAssetLoader\.AssetsPathHandler/);
  assert.match(activity, /https:\/\/\$APP_HOST\/assets\/design\/android-mobile-preview\.html/);
  assert.match(activity, /WebViewCompat\.addWebMessageListener/);
  assert.match(activity, /if \(!isMainFrame\)/);
  assert.match(activity, /allowFileAccess = false/);
  assert.match(webBridge, /GrapesAndroid\.postMessage/);
  assert.match(mobileFood, /readAndroidHealthExport\(fromDate\)/);
});

test('az Android vissza gomb előbb a mobilfelület belső nézetét zárja be', async () => {
  const activity = await read('app/src/main/java/hu/grapes/healthconnect/MainActivity.kt');
  const shell = await read('../src/android-mobile-shell.js');
  assert.match(activity, /grapesHandleAndroidBack/);
  assert.match(activity, /handled == "true"/);
  assert.match(shell, /window\.grapesHandleAndroidBack/);
  assert.match(shell, /mobileFood\?\.handleBack\(\)/);
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

test('a bridge saját rekordot kizár és lapozva olvas', async () => {
  const source = await read(
    'app/src/main/java/hu/grapes/healthconnect/HealthConnectBridge.kt',
  );
  assert.match(source, /filterNot \{ it\.sourcePackage == context\.packageName \}/);
  assert.match(source, /pageToken = token/g);
});

test('az Android Google Drive kapcsolat natív AuthorizationClientet használ', async () => {
  const activity = await read(
    'app/src/main/java/hu/grapes/healthconnect/MainActivity.kt',
  );
  const build = await read('app/build.gradle.kts');
  const webBridge = await read('../src/android-bridge.js');
  const drive = await read('../src/storage/grapes-drive.js');
  const manifest = await read('app/src/main/AndroidManifest.xml');
  assert.match(build, /play-services-auth:21\.5\.0/);
  assert.match(activity, /Identity\.getAuthorizationClient/);
  assert.match(activity, /AuthorizationRequest\.builder\(\)/);
  assert.match(activity, /DRIVE_FILE_SCOPE/);
  assert.match(activity, /DRIVE_READ_SCOPE/);
  assert.match(activity, /Google OAuth-konfigurációs hiba \(10\)/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(webBridge, /authorizeGoogleDrive/);
  assert.match(drive, /authorizeAndroidGoogleDrive/);
});

test('a Grapes Drive-hiba esetén is használható helyi módban', async () => {
  const page = await read('../index.html');
  const main = await read('../src/main.js');
  assert.match(page, /id="continue-local"/);
  assert.match(main, /LOCAL_MODE_KEY = 'grapes-local-mode'/);
  assert.match(main, /isGrapesDriveConnected\(\) \|\| isLocalMode\(\)/);
});

test('az Android frissítő csak ellenőrzött GitHub Release APK-t ad át a rendszertelepítőnek', async () => {
  const manifest = await read('app/src/main/AndroidManifest.xml');
  const updater = await read(
    'app/src/main/java/hu/grapes/healthconnect/AndroidUpdateManager.kt',
  );
  const workflow = await read('../.github/workflows/release-android.yml');
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(updater, /releases\/latest/);
  assert.match(updater, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(updater, /downloadedBytes <= MAX_DOWNLOAD_BYTES/);
  assert.match(updater, /check\(apk\.isFile\)/);
  assert.match(updater, /putLong\(LAST_CHECK_KEY, now\)/);
  assert.match(updater, /canRequestPackageInstalls/);
  const activity = await read(
    'app/src/main/java/hu/grapes/healthconnect/MainActivity.kt',
  );
  assert.match(activity, /val apk = updateManager\.download\(release\)[\s\S]*updateManager\.requestInstall\(apk\)/);
  assert.match(activity, /runCatching \{ updateManager\.resumePendingInstall\(\) \}/);
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
  assert.match(workflow, /gh release create/);
});
