# Grapes TEST — reset baseline from latest published PROD v28

**Scope:** A clean, isolated new TEST candidate built from the exact published Android **v28** source commit `39306e48455a54cf4037faf43688f42725882440`, instead of merging experimental Food/Health/Auth/Outdoor draft branches into the previous TEST app.

## Proven public releases and source identities

- Latest public production: `android-v28`, released 2026-10-19; `hu.grapes.healthconnect`; tagged source `39306e48455a54cf4037faf43688f42725882440`.
- Latest signed TEST prerelease: `android-test-v13`, released 2026-10-19, `hu.grapes.healthconnect.test`, branch `integration/grapes-test-food-20261017` head `1359af8fb13b7caf6ebd52a9be37222532a186ca`.
- **IMPORTANT:** v13 release notes **already include** the 2x2 Home/Health/Utility/Finance menu. If a phone lacks it, verify the actual installed package/version/signing and whether an older debug-signed preview is running. Never uninstall the app to solve this without a verified local data backup and a recovery plan.
- Compared these exact trees: 58 files differ. This is why arbitrary automatic cherry-picking/three-way merges are not safe for stored Food/Water/E-book data.

## Exact branch plan

1. Create `integration/grapes-test-v28-baseline-20261021` from the **exact v28 release commit**, not main/develop (they are different development targets). Do not modify PROD.
2. Create `feature/grapes-test-v28-qa-20261021` from the same v28 commit, adding only the minimum TEST fencing, signing support and TEST-only CI. A draft PR must target the new isolated baseline branch, **not** PROD `codex/android-app`, `main`, the old TEST branch or any release branch.
3. In QA build use Android package `hu.grapes.healthconnect.test`, label Grapes TEST and TEST updater restricted to `android-test-vN` prerelease APK assets. Preserve existing PRODUCTION stable feed separately in non-QA builds.
4. Build `VITE_GRAPES_TEST_CHANNEL=1` so Food projects use **Grapes TEST/Projects** and E-book books use **Grapes TEST E-book Library**. Never point QA at PROD Google Drive folders. Original E-book Drive Auth stays as-is; no new Supabase Auth.
5. Candidate CI is read-only, runs unit/browser/web build and native `:app:assembleQa` with ephemeral debug signing only. It **does not upload any APK** or initiate an install/update. An ephemeral signature cannot update the existing permanently signed TEST APK.
6. For a future **signed** `android-test-v14` release, explicitly create a separate protected release step using the previously configured `ANDROID_TEST_KEYSTORE_*` secrets. Verify certificate fingerprint **cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33**, package name and monotonically increasing QA versionCode; run full CI before publishing. **No use of PROD signing keys.**
7. Before updating the handset: user-verified exports and restore of synthetic TEST Food, Water, E-book, Finance and Home data; prove compatibility with existing signed v13 app, local IndexedDB and preferences; test safe upgrade (and fallback) on emulator/clean QA profile; explicitly inspect current phone's signed/debug installation. Do not promise invisible migrations/automatic rollback.
8. Only once a v28 TEST baseline has passed on-device acceptance, separately stage Health audit #57–#73, OFF locale/USDA language fixes, #86–#90 Auth, and Outdoor #74–#75, one independently tested change set at a time.

## Deliberate exclusions

**No Health audit fixes are automatically included.** The published v28 source is the only base; outstanding Health release still NO-GO. No changes to PROD source, releases, normal `main`, live Supabase tables, app user data, old TEST integration branch, Google Drive tokens or E-book storage schema.

## This draft's release gate

- Must pass CI with the exact branch HEAD, including native QA compile and Drive isolation checks.
- No signed or public APK, git merge, rewrite of current TEST baseline, version bump, installation or PROD deployment performed by this draft.
- The TEST v13 installer may be older than PROD v28 but **already has the new menu in source**; confirm installed version before diagnosing.
