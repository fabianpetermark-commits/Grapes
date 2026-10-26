# Grapes TEST – Samsung Health direct Water + per-account foreground sync

## Implementation

Stacked on #171 (Samsung-water personal-data CSV fallback).
- Native Android: `getSamsungWaterStatus` gives SDK availability plus already-granted
  READ permission, without displaying a permission dialog.
  `readSamsungHealthData` requests the water-only Samsung permission ONLY after
  a manual click; `readSamsungHealthDataSilent` NEVER requests permission.
  Both revalidate the current native Grapes TEST Auth subject, even after SDK returns.
- The Samsung card selects **Közvetlen** when the real SDK adapter exists in
  the APK, otherwise remains **CSV-import**. The fallback CSV button remains
  alongside the direct path when real SDK is available.
- Manual direct path uses the same owner-pinned Water preview/checklists
  and CAS confirmation as Health Connect water, not the legacy Food import.
- After the first real Samsung Health permission grant, the user can explicitly
  enable **Automatikus vízfrissítés** for this Grapes account only.
- Enabled account: on Grapes foreground and when opening Water/Sync, request
  a silent native Samsung read covering the previous 90 days, at most once
  per 30 minutes per app session. Never poll every few seconds, trigger an
  Android consent screen in the background, or claim the separate Samsung
  Health identity matches the Grapes subject.
- Silent reads flow into `prepareFreshOwnerWaterHydration` then a single
  `confirmFreshOwnerWaterHydration` CAS write. Only new, identity-checked
  water records are imported; existing external IDs, old unclaimed Water
  and all other owners remain untouched.
- **Important limitation:** this first auto-import imports newly added water
  entries only. It does not reconcile deletes or modified Samsung records,
  and it is NOT an always-on WorkManager background service when the app
  is completely closed. Full bidirectional or continuous sync is NOT claimed.

## Samsung licensing and distribution gate

SDK support already exists in the repository's
`app/src/samsung/java/.../SamsungWaterBridgeFactory.kt`, with
`app/src/samsungStub` as the safely disabled fallback.

The repository does **NOT contain** `app/libs/samsung-health-data-api-1.1.0.aar`.
Without the official library, only the stub can build and the direct
button must NOT appear. Do not copy/download the proprietary library
from random GitHub mirrors.

Get Samsung Health Data SDK v1.1.0 from the official page:
https://developer.samsung.com/health/data/overview.html

If you have permission to use the SDK internally, put its **unmodified
AAR bytes** in a *private GitHub Actions repository secret* named
`SAMSUNG_HEALTH_DATA_SDK_AAR_BASE64` as base64 text. The v32 workflow
decodes that secret only on the ephemeral GitHub runner into
`android-health-connect-poc/app/libs/samsung-health-data-api-1.1.0.aar`,
checks the AAR ZIP and `classes.jar`, builds the genuine signed QA
TEST-only artifact and deletes it with the runner.
The AAR must never be committed publicly or attached alone to release assets.

If the secret is missing, the v32 CI still runs unit/browser tests and
Android stub-unit checks, but **does not produce a signed direct-SDK APK**.
Any reported PASS in that case proves JS/owner wiring only.
The real Samsung adapter cannot be compiled or tested against Samsung
Health until the license-provided SDK is available.

Samsung Health Data SDK requires Samsung Health 6.30.2+ on Android 10+.
For SDK *developer testing* Samsung permits enabling its developer-mode
Data Read function; actual distribution requires partnership,
including registering the package name and signing-certificate SHA256.
Never represent a developer-mode TEST signed APK as production-ready.

https://developer.samsung.com/health/data/guide/developer-mode.html
https://developer.samsung.com/health/data/process.html

## Acceptance

1. Verified native Grapes A owner opens Samsung card (SDK-present signed TEST
   APK): **Közvetlen** and CSV fallback both visible.
2. Manual Samsung Water permission prompt, read actual stored water
   records, preview, choose records, confirm; verify own Water diary.
3. Enable **Automatikus vízfrissítés** with explicit A consent.
4. Add a water entry in Samsung Health; on return to Grapes refresh
   occurs silently within the app's foreground cadence, with no duplicate.
5. Switch A→B: B auto setting OFF and no A data. Return A, data intact.
6. Revoke Samsung Read permission: silent refresh refuses and writes nothing.
7. Do not claim background-service, changed/deleted record reconciliation
   or partner-approved production usage from this PR.

No Drive, PROD, release, global migration, or automatic Health/YAZIO
import changes are included.
