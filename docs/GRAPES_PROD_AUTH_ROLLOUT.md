# Grapes PROD Auth — staging / rollout gate

Created 2026-10-22. Target Android source: codex/android-app.
Status: PREPARATION ONLY; NO-GO for production release.

The signed, phone-approved Grapes TEST v24 proves the user experience, not production Auth, data ownership or account migration. Never merge the TEST branch wholesale into PROD.

## Verified environment

- PROD: android-v28, native ID hu.grapes.healthconnect, branch codex/android-app, manually signed via the existing release-android.yml workflow.
- TEST: android-test-v24, separate package hu.grapes.healthconnect.test, separate signing, and Supabase ref aighqtqjlzirlokxwupt in eu-central-1.
- Connected Supabase organization: fabianpetermark-commits's Org (rpotkuinbwxycjhiicuq). **Separate Grapes PROD created and ACTIVE_HEALTHY on 2026-10-22:** ref `yopabovoxyffhokhbgxl`, Frankfurt (`eu-central-1`), URL `https://yopabovoxyffhokhbgxl.supabase.co`. Its publishable API key exists and is enabled, but has **not** been wired into any stable build.
- Grapes TEST remains distinct, ACTIVE_HEALTHY, ref `aighqtqjlzirlokxwupt`. The unrelated third project (`rrqrmbiclapopgrcypye`) is INACTIVE and untouched. Fresh PROD `public` schema has no application tables; the security advisor reported no lints when checked. This does not validate OAuth, accounts, or existing local records.
- User approved the **0 USD/month incremental cost** quote in chat; the cost confirmation succeeded and the separate PROD project was created in the sole connected organization.
- TEST OAuth, Android callback and TEST publishable keys must never be reused for production.

## Prepared production config (does NOT turn on authentication)

- src/auth/grapes-prod-config.js is a pure, no-side-effect validation module.
- The preflight now pins exactly `yopabovoxyffhokhbgxl` as the approved PROD ref and validates its matching HTTPS URL. Caller-controlled alternate refs (even valid 20-letter project IDs) and the TEST ref are rejected. Only a public `sb_publishable_` key may be used. A secret/service-role key must NEVER go into the APK, code or chat.
- Dedicated production app ID: hu.grapes.healthconnect; callback planned as hu.grapes.healthconnect://auth/callback with a one-time PKCE state, or a verified HTTPS Android App Link. Auth WebView asset origin reserved: https://grapes-prod-auth.invalid/assets/login-auth-prod.html.
- Distinct local Supabase key: grapes-prod-auth-<production-project-ref>. Existing TEST tokens and user identities are not imported.
- Explicit legacyDataIsolationReviewed gate is required before enabling Auth. This is a technical preflight gate, not proof of data isolation.
- PROD Auth currently OFF; this branch changes no Android APK or PROD release workflow, no Drive data or existing Food/Water/Finance/E-book records.

## Production web Auth integration staged (2026-10-22)

The separate PROD login HTML, styles, Supabase 2.118.0 locked client, login flow, Android OAuth JavaScript adapter and Vite bundling are now staged in this PR. Default remains **AUTH OFF**; activation requires both explicit environment flags `VITE_GRAPES_PROD_AUTH_ENABLED=true` and `VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED=true`. In addition the PROD runtime independently validates the hard-pinned production project ID, URL, key and data-isolation gate. This is only the JS layer: **native Android callback and fail-closed owner gate are now staged, but explicitly verified account ownership / migration, Google Cloud provider and Supabase redirect allowlisting are NOT complete**. Do not set these flags yet, publish an APK, or merge this PR.

## Remaining blockers BEFORE production release

1. **DONE:** owner approved organization, 0 USD/month quote, independent Grapes PROD created in Frankfurt and verified active. TEST project and older project unchanged.
2. **OPEN:** set up the PROD Google OAuth provider with callback `https://yopabovoxyffhokhbgxl.supabase.co/auth/v1/callback` in Google Cloud and the exact production Android redirect in Supabase Auth URL Configuration. Provider credentials belong only in the secure dashboards. Build-time public key settings belong in the isolated PROD release configuration. Verify on device.
3. **PARTIALLY STAGED:** Existing Android data is primarily LOCAL/Drive-scoped and not keyed to Supabase user ID. A native device-owner binding flow now provides explicit acknowledgement and physical-device confirmation, while denying other accounts from opening that legacy profile. Before turning this on, verify actual exports for Food, grapes-water-v1, Finance, E-book and profiles and document restore/rollback. A backup checkbox alone does not prove this. Do not claim profile-based multitenancy or shared-device account switching is supported.
4. **STAGED, NOT ENABLED:** native PROD-only WebView origin/intent callback, one-time PKCE handoff, explicit flags in Gradle defaulting OFF, and fail-closed `ProdAuthGate` on unbound/foreign UUIDs. One-time native ownership enrollment is now staged: the user must affirm an *existing* backup, explicitly approve the pairing, and complete the Android device-credential challenge; only then can Android persist `owner-uid` and open the legacy local app. This checkbox is **not backup verification**, does **not create an export**, and does not authorize cross-user migration. The native callback checks that the login page is still trusted before pinning ownership. A different Supabase user ID is denied. The frontend waits for native acceptance/cancellation and shows an error on refusal. Verify backup exports, device-owner UX, native logout, and Google Drive separation on a real phone before any release; never merge TEST branch wholesale.
5. Pass full unit + focused Android native, Auth, Food, Water, Finance, E-book/Drive checks. Use existing production signing identity. Verify in-place upgrade from signed v28 (no uninstall/clear), user data exports and rollback. Do phone smoke tests for login, startup, logout, Google Drive, offline/expired sessions and account switching.
6. Only after owner validation and approval merge the integration and publish the next Android stable version. Preserve the existing stable release and TEST builds.

**NO-GO remains:** This is a preparatory Draft PR and must never be merged or treated as a production APK by itself. PROD v28 and TEST v24 stay intact.

## External OAuth configuration still required

1. In Google Cloud, use the existing owner-approved OAuth application or create a separate OAuth Web client for Grapes PROD; register the exact authorized redirect URI `https://yopabovoxyffhokhbgxl.supabase.co/auth/v1/callback`. Keep the Google OAuth client secret in Supabase Auth provider settings only.
2. In the **PROD** Supabase project's Authentication > Providers > Google, enable Google and use its own OAuth client ID/secret. This project is not the TEST one.
3. In the **PROD** Supabase project's Authentication > URL Configuration, allow the narrowly scoped Android redirect pattern `hu.grapes.healthconnect://auth/callback?state=*` (the real OAuth `redirectTo` appends a per-login 64-character `state` query value) and check the Site URL. Validate the allowlist on-device; do not permit a global `**` or a TEST scheme. On-device PKCE and state validation are already staged in the PR.
4. Before signing any PROD release, obtain a verified backup of existing app data and test the first-owner enrollment, same-account relaunch, denied second-account login, cancellation, lock screen requirement, Google Drive independence, and in-place upgrade from v28. Feature flags must remain OFF until all checks pass.

The connected Supabase tools do not expose the Google provider's private credentials or Auth URL configuration, so those secure provider-side steps cannot be silently configured by a repository commit.
