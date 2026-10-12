# Grapes Health Connect POC

Minimal Android bridge for validating the Grapes Food ↔ Health Connect and direct Samsung Health paths on a real phone.

## Scope

- reads `NutritionRecord` and `HydrationRecord` with pagination;
- writes `NutritionRecord` and requests history access when supported;
- exports a versioned local JSON document from 2026-01-01;
- excludes this package's own records from imports;
- writes one idempotent 250 kcal test snack with a stable `clientRecordId`;
- deletes only that Grapes test record;
- never uploads data or performs background sync.
- optionally reads Samsung Health `WaterIntake` directly through Samsung Health Data SDK 1.1.0.

Keys are `healthconnect:<source package>:<record id>` and `samsunghealth:<source app>:<record id>`. The Grapes Food web module persists them as `externalKey` values, previews every record, and skips already imported or file-internal duplicate keys.

## Optional Samsung water adapter

Samsung distributes its SDK as a proprietary AAR instead of a Maven dependency. Copy the official v1.1.0 library to `app/libs/samsung-health-data-api-1.1.0.aar`. Gradle then selects the real adapter automatically; without the file it selects a safe disabled stub.

The adapter requests read-only `WATER_INTAKE` permission and maps each record to the same bridge JSON contract. It requires Android 10+, Samsung Health 6.30.2+, JDK 17 and a real device. Developer mode can be used for local read testing; public distribution requires Samsung partner registration of the package and signing certificate.

## Build and device check

Prerequisites: Android Studio with JDK 17, Android SDK 35, and an Android 9+ Google Play device. Open this directory as a standalone Android project, sync Gradle, install the `app` debug variant, then:

1. Enable Samsung Health/YAZIO sharing in Health Connect.
2. Grant Nutrition, Hydration and history permissions.
3. If testing direct water access, enable Samsung Health Data SDK developer read mode and grant Grapes Water intake read permission.
4. Read data and inspect/copy the JSON.
5. Write the Health Connect test snack twice; one logical record should remain.
6. Compare Samsung water with any Health Connect hydration records and verify duplicate handling.
7. Revoke access and confirm reading fails cleanly.

## Validation boundary

This machine currently has Java 8, Android SDK 33, no Gradle install and no connected Android device, so this checkout cannot compile or device-test the APK yet. The project targets stable `androidx.health.connect:connect-client:1.1.0`; Android Studio sync is the next executable verification.
