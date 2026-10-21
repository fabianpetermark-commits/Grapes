# Grapes — TEST release policy (approved 2026-10-21)

The app owner authorized automatic **publication of TEST APKs once a change has been prepared and has cleared its required checks**, without a second manual "mehet" for each TEST release. This does **not** authorize any automatic production deployments, mergers, installation on the owner's device, deletion/migration of user data, or bypassing a Health data-safety NO-GO.

## Default workflow

1. Develop changes on isolated TEST feature branches derived from the latest signed TEST source; retain original E-book/Drive, Home, Food and Finance interfaces unless explicitly targeted.
2. CI on the exact code commit must pass: complete unit regressions, relevant integration tests, web/Android web builds, browser (menu, Food/Health, Home, E-book, responsiveness), and native QA Android Gradle compilation. Add new tests for changes.
3. Publish only the tested commit, with a monotonic Android TEST versionCode, using only `ANDROID_TEST_KEYSTORE_*` secrets, package `hu.grapes.healthconnect.test`, and the pinned TEST signer SHA-256 `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`. The TEST Google Drive and E-book folders must remain isolated with `VITE_GRAPES_TEST_CHANNEL=1`.
4. Create the TEST `android-test-vN` **prerelease** and attached APK + .sha256 automatically after all release gates have passed; do not alter `android-vN` production releases.
5. Confirm that the TEST release exists and `/releases/latest` still points at the production release. Let the user know an update is available; never claim it is installed.
6. Preserve a traceable draft PR and release provenance. Do not merge draft development PRs to PROD solely to distribute a TEST APK.
7. For changes carrying *unresolved* data loss/corruption, database migration, Drive multi-device conflict, backup/recovery, or authorization/security risks, treat that change as BLOCKED and **do not publish it just because individual tests are green**. Resolve the gate and obtain proven migration/backup compatibility first.

This policy is recorded to avoid repeated confirmation requests; build/publish jobs still need actual CI and signature checks. All TEST releases stay user-installable at their discretion and users should back up important TEST local data first.

## v15 authorization and verification

- Exact validated source SHA: `e968dc16dfb14fc4e1c7d9efba24b63795412746`, draft PR #93.
- Green CI runs: #39564979284 (all full Health v15 web/native QA), #39564979295 (connected Food search), #39564979339 (YAZIO import).
- Version: tag `android-test-v15`, code 15, name `0.9.6-test`.
- Changes: OFF region/language, Hungarian/English real names, brand/nullable nutrients, USDA Foundation/SR Legacy partial result handling, Health Statistics no-overview-flash.
- No Health audit #59–#73, no Water/Drive sync changes, no auth #86–#90, no production changes; full Health release NO-GO remains in effect.
