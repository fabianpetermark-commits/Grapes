# Grapes PROD Auth — staging / rollout gate

Created 2026-10-22. Target Android source: codex/android-app.
Status: PREPARATION ONLY; NO-GO for production release.

The signed, phone-approved Grapes TEST v24 proves the user experience, not production Auth, data ownership or account migration. Never merge the TEST branch wholesale into PROD.

## Verified environment

- PROD: android-v28, native ID hu.grapes.healthconnect, branch codex/android-app, manually signed via the existing release-android.yml workflow.
- TEST: android-test-v24, separate package hu.grapes.healthconnect.test, separate signing, and Supabase ref aighqtqjlzirlokxwupt in eu-central-1.
- Connected Supabase organization: fabianpetermark-commits's Org (rpotkuinbwxycjhiicuq). No separate Grapes PROD project currently exists. A second unrelated Supabase project is INACTIVE; do not alter or reuse it.
- New Supabase project incremental cost returned 0 USD/month on 2026-10-22, but the tool requires an explicit selection of the target organization before creating.
- TEST OAuth, Android callback and TEST publishable keys must never be reused for production.

## Prepared production config (does NOT turn on authentication)

- src/auth/grapes-prod-config.js is a pure, no-side-effect validation module.
- A production client must receive a separately approved project ref, the exact corresponding HTTPS Supabase URL and only a public sb_publishable_ API key. A secret/service-role key must NEVER go into the APK, code or chat.
- Dedicated production app ID: hu.grapes.healthconnect; callback planned as hu.grapes.healthconnect://auth/callback with a one-time PKCE state, or a verified HTTPS Android App Link. Auth WebView asset origin reserved: https://grapes-prod-auth.invalid/assets/login-auth-prod.html.
- Distinct local Supabase key: grapes-prod-auth-<production-project-ref>. Existing TEST tokens and user identities are not imported.
- Explicit legacyDataIsolationReviewed gate is required before enabling Auth. This is a technical preflight gate, not proof of data isolation.
- PROD Auth currently OFF; this branch changes no Android APK or PROD release workflow, no Drive data or existing Food/Water/Finance/E-book records.

## Remaining blockers BEFORE production release

1. Confirm owner target organization, create independent Grapes PROD Supabase project in agreed region and verify it. No existing data/project changes.
2. Set up Google OAuth provider with the production Supabase OAuth callback https://<prod-ref>.supabase.co/auth/v1/callback in Google Cloud, and the exact production Android redirect allowlist in the new Supabase project's Auth URL configuration. Store secrets in proper provider settings, and public variables in the separate PROD release settings. Verify on device.
3. Existing Android data is primarily LOCAL/Drive-scoped and not keyed to Supabase user ID. Sign-in alone does not authorize access to previous Food, grapes-water-v1, Finance, E-book and profiles. Define confirmed ownership/backup, account switch isolation, and explicit import or linking that cannot overwrite existing data. A second account must not see the first account's records on the same device.
4. Stage and review a **separate** complete minimal native Android integration on codex/android-app: exact-origin WebView bridge, server-validated session, PKCE one-time code/state, lifecycle-safe logout, approved logo, and separate Drive Google OAuth. Do not port the entire TEST branch or enable Health cloud sync.
5. Pass full unit + focused Android native, Auth, Food, Water, Finance, E-book/Drive checks. Use existing production signing identity. Verify in-place upgrade from signed v28 (no uninstall/clear), user data exports and rollback. Do phone smoke tests for login, startup, logout, Google Drive, offline/expired sessions and account switching.
6. Only after owner validation and approval merge the integration and publish the next Android stable version. Preserve the existing stable release and TEST builds.

**NO-GO remains:** This is a preparatory Draft PR and must never be merged or treated as a production APK by itself. PROD v28 and TEST v24 stay intact.
