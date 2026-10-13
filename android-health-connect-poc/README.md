# Grapes Android app

Android application shell for the complete Grapes web interface, with a native Health Connect bridge for the Food module. The first milestone runs locally from packaged web assets, supports Android file selection and works without a Google account in local mode.

## Current scope

- packages the complete Grapes interface inside the APK;
- keeps the embedded app on the secure `appassets.androidplatform.net` origin;
- exposes the native bridge only to the top-level trusted Grapes frame;
- supports Android file selection for imports, photos and documents;
- reads `NutritionRecord` and `HydrationRecord` with pagination;
- writes `NutritionRecord` and requests history access when supported;
- passes a versioned JSON document directly to the Food import preview;
- excludes this package's own records from imports;
- writes one idempotent 250 kcal test snack with a stable `clientRecordId`;
- deletes only that Grapes test record;
- authorizes Google Drive through Android's native Google authorization flow;
- checks the latest signed GitHub Release and offers verified in-app APK updates;
- never performs background health-data sync.
- optionally reads Samsung Health `WaterIntake` directly through Samsung Health Data SDK 1.1.0.

Keys are `healthconnect:<source package>:<record id>` and `samsunghealth:<source app>:<record id>`. The Grapes Food web module persists them as `externalKey` values, previews every record, and skips already imported or file-internal duplicate keys.

## Optional Samsung water adapter

Samsung distributes its SDK as a proprietary AAR instead of a Maven dependency. Copy the official v1.1.0 library to `app/libs/samsung-health-data-api-1.1.0.aar`. Gradle then selects the real adapter automatically; without the file it selects a safe disabled stub.

The adapter requests read-only `WATER_INTAKE` permission and maps each record to the same bridge JSON contract. It requires Android 10+, Samsung Health 6.30.2+, JDK 17 and a real device. Developer mode can be used for local read testing; public distribution requires Samsung partner registration of the package and signing certificate.

## Build and device check

Prerequisites: Node.js 24, Android Studio with JDK 17, Android SDK 36, and an Android 10+ Google Play device. From the repository root, run `npm run build:android-web`, then open this directory as a standalone Android project, sync Gradle and install the `app` debug variant. The `Build Android APK` GitHub Actions workflow performs the same build and uploads `grapes-debug-apk`.

1. Enable Samsung Health/YAZIO sharing in Health Connect.
2. Grant Nutrition, Hydration and history permissions.
3. If testing direct water access, enable Samsung Health Data SDK developer read mode and grant Grapes Water intake read permission.
4. Open Food and tap `Health-adatok beolvasása`; review the records before importing.
5. Write the Health Connect test snack twice; one logical record should remain.
6. Compare Samsung water with any Health Connect hydration records and verify duplicate handling.
7. Revoke access and confirm reading fails cleanly.

## Signed releases and in-app updates

Run the `Release Android APK` GitHub Actions workflow with a monotonically increasing `version_code`, a visible `version_name`, and short release notes. The workflow requires these repository secrets:

- `ANDROID_KEYSTORE_BASE64`: the PKCS#12 release keystore encoded as one-line Base64;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`;
- `ANDROID_KEY_PASSWORD`.

Never commit the keystore or its passwords. Back them up securely: every update must be signed with the same key. The workflow publishes a release tagged `android-v<version_code>`. On startup the installed app checks the latest release at most once every six hours, verifies the APK against GitHub's SHA-256 digest, and opens Android's package installer. Android still requires the user to approve installation, and the first update may require enabling “Install unknown apps” for Grapes.

The Android OAuth client in Google Cloud must use package `hu.grapes.healthconnect` and the SHA-1 fingerprint of this same release certificate.

## Current boundary

Direct Samsung SDK device testing and Play Billing remain later release steps. The optional Samsung adapter still requires Samsung's proprietary AAR and partner approval for public distribution. If the application is later distributed through Google Play, replace the GitHub APK updater with Play In-App Updates.
