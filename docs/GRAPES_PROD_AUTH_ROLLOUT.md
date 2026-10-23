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
2. **PROVIDER HANDOFF VERIFIED; RETURN ALLOWLIST FAILED ON DEVICE:** on 2026-10-22 the owner created the dedicated Google Cloud Web OAuth client with callback `https://yopabovoxyffhokhbgxl.supabase.co/auth/v1/callback`, configured the Google provider in Supabase PROD, and added the Android allowlist `hu.grapes.healthconnect://auth/callback?state=*`. The staging GitHub Actions live HTTP smoke check subsequently passed: `/auth/v1/settings` confirms `external.google=true`; `/auth/v1/authorize` with the exact Android redirect returns a handoff to `accounts.google.com`. No user signed in and no account/secret was accessed. This is **not** proof of working end-to-end OAuth on the phone. Stable release Auth flags remain OFF. The separately approved v29 candidate used the PROD public key and both explicit Auth flags; it still needs phone UAT.
3. **PARTIALLY STAGED; OWNER CONFIRMED EMPTY APP:** The owner stated on 2026-10-23 that the installed Grapes app contains no data worth preserving. Therefore no backup or export is required for their device. This is a user declaration, not a remote inspection. Onboarding now allows explicit acknowledgement of an empty app (or the same account owning pre-existing local data), followed by device-credential confirmation. If meaningful legacy records are found on a different device, preserve those before upgrading; never silently merge across user accounts. Native per-account storage remains out of scope.
4. **STAGED, NOT ENABLED:** The native PROD-only WebView callback, PKCE, Gradle flags (default OFF), and fail-closed `ProdAuthGate` remain isolated. First ownership binding requires a user acknowledgement that the installation is empty **or** existing local data belongs to the signing-in account, followed by Android screen-lock verification. It does not delete local data and cannot grant access to a different UID. The owner's empty-app confirmation means no export requirement for their device. End-to-end phone login, logout and user verification remain open.
5. Pass full unit + focused Android native, Auth, Food, Water, Finance, E-book/Drive checks. Use existing production signing identity. Verify in-place upgrade from signed v28 (no uninstall/clear), preserve meaningful data if any appears, and plan rollback. Do phone smoke tests for login, startup, logout, Google Drive, offline/expired sessions and account switching.
6. Only after owner validation and approval merge the integration and publish the next Android stable version. Preserve the existing stable release and TEST builds.

**NO-GO remains:** This is a preparatory Draft PR and must never be merged or treated as a production APK by itself. PROD v28 and TEST v24 stay intact.

## v28 preflight: no backup needed for owner's empty app

On 2026-10-23 the owner explicitly confirmed the installed Grapes app is empty. Do **not** require Food/Water/Finance/E-book exports or ask the owner to hunt for missing backup buttons. [Conditional backup preflight](./GRAPES_PROD_V28_BACKUP_PREFLIGHT.md) remains relevant only if meaningful existing records are later found. No Auth-enabled candidate has yet been installed and phone-tested.

## External OAuth configuration and validation

1. **OWNER COMPLETED:** Google Cloud Web OAuth client for Grapes PROD created, exact redirect `https://yopabovoxyffhokhbgxl.supabase.co/auth/v1/callback` entered. The secret remains exclusively in provider settings.
2. **OWNER COMPLETED; LIVE CONFIG VERIFIED:** Google provider enabled in **PROD**, with dedicated ID/secret. GitHub CI confirmed the Google provider reports enabled on the real Supabase PROD endpoint. TEST was untouched.
3. **OWNER REPORTED COMPLETED; RETURN ALLOWLIST NOT VERIFIED BY OLD SMOKE:** Supabase PROD URL Configuration includes `hu.grapes.healthconnect://auth/callback?state=*`, and GitHub CI successfully sent a 64-character state through the provider's real authorize endpoint, obtaining a Google handoff. Native PKCE callback/session and Google consent-screen behavior still require a real-device test. Do not allow global `**` or any TEST scheme. Verify Site URL behavior for email verification/recovery separately.
4. Before enabling or signing a PROD Auth release, verify owner-confirmed empty-app onboarding and the first-owner binding, same-account relaunch, denied different-account login, cancellation, lock-screen requirement, Google Drive independence and upgrade from v28. A backup is only necessary where meaningful pre-existing records are actually present. Default feature flags stay OFF until checks pass.

GitHub Actions tests the public hosted provider endpoints using only the **public, low-privilege PROD publishable key** in its staging workflow; no `sb_secret_`/service-role key or user tokens are committed. Secure provider-side IDs, secrets and allowlist changes were made by the owner in Google Cloud/Supabase UI, then functionally verified by a non-login live smoke test. No APK was published.

## #114 review and candidate handoff (2026-10-23)

**Implemented on this draft branch:** `ProdAuthCallback.kt` now commits the OAuth
state before opening the browser, commits the callback result before handling
the return, and commits one-shot consumption. If a write fails, the handoff
fails closed. `ProdAuthGateTest.kt::callbackSurvivesActivityRecreationAndCannotBeReplayed`
covers a new callback instance after browser return and one-shot consumption.
Existing native tests cover unbound/foreign UID denial and Auth-OFF navigation;
the JS tests cover PROD/TEST config and Drive-independent sign-out.
Baseline head `176dae8` had successful PROD Auth, Food backup, Food staging and
PROD menu workflow runs. Code head `a1691ae` passed PROD Auth config gate (including npm tests, Android Kotlin compile and native unit tests), PROD menu, Food staging and Food backup workflows on 2026-10-23. The final documentation-only commit still needs its own CI status checked.

**Candidate build procedure, now executed after owner approval:**
build the candidate only from this draft head using the existing PROD signing
keystore, unchanged application ID `hu.grapes.healthconnect`, and a version
code greater than v28. Build the Vite assets with the PROD URL, the PROD
`sb_publishable_` key and both explicit Auth flags; build Gradle with the
same environment so native `BuildConfig.GRAPES_PROD_AUTH_ENABLED` matches
the web bundle. Keep those values out of source and logs. Verify the candidate
APK's package and signing certificate against signed v28 with `apksigner`;
retain it as a private CI artifact, with no GitHub Release or Play upload.
The ordinary `release-android.yml` still checks out `codex/android-app`
and has Auth OFF. It was not used for the candidate. The separately staged
`grapes-prod-auth-encrypted-candidate.yml` workflow built one signed v29
candidate from this Draft branch after explicit owner approval, compared its
package and signing certificate against signed v28, and uploaded only encrypted
bytes as a one-day artifact. The candidate has not been installed.

**Minimal owner phone acceptance, only after explicit approval to install:**

1. Confirm the installed production app is still empty. If meaningful records
   appear, stop and preserve them before proceeding. Install the matching
   signed candidate over v28 without uninstalling or clearing data.
2. Start Google sign-in; complete the browser callback. Confirm the app offers
   the one-time empty-app/ownership acknowledgement and Android screen-lock
   prompt. Cancel each once and verify the app stays locked; then approve and
   verify the owner account enters.
3. Force-stop and reopen: the same account restores. Try a different PROD
   account: it must not see the local app. Confirm expired/offline verification
   does not open it.
4. Sign out of Grapes and verify the local app locks; check that Google Drive
   remains separately connected. Reopen and verify the owner can sign in
   again. Confirm Food, Water, Finance and E-book data remain unchanged.

**Release blockers:** real phone installation and verification; device end-to-end Google OAuth, process-restart callback, session restoration
and expiry, cancellation, first binding/foreign UID, Grapes sign-out versus
Drive, and in-place upgrade checks. Do not merge or publish based on CI alone.

## Approved signed candidate result (2026-10-23)

Owner explicitly approved the production-signed, encrypted CI candidate after
the scope of signing-secret use and encrypted artifact storage was explained.
Workflow [run 39916060591](https://github.com/fabianpetermark-commits/Grapes/actions/runs/39916060591)
completed successfully on code head `a7a3db3`: npm tests, Android web build,
native release unit tests, signed APK assembly, package/version check
(`hu.grapes.healthconnect`, versionCode 29), v28 signing-certificate match,
and encrypted artifact upload. The public artifact contains only AES-encrypted
APK bytes and an RSA-wrapped passphrase; it expires after one day. The APK was
decrypted locally and its SHA-256 verified as
`2046222d32e636b38c5b045e908b7b87ec335d1b584de47b0ad87094d1b59a51`.
The local candidate is `/workspace/grapes-candidate-output/grapes-prod-auth-v29.apk`.
No APK was published as a GitHub Release or installed on a phone. This runner
has no connected Android device, so the owner's in-place phone checks below
remain the acceptance gate. Do not uninstall or clear v28.

## Phone failure: localhost fallback (2026-10-23)

The owner installed the signed v29 candidate and completed Google sign-in, but
Supabase returned the browser to `http://localhost:3000` instead of Android.
The authorization code supplied in the report was not used or stored in source.
A fresh synthetic PKCE authorize request reproduced the failure: the PROD
service persisted `referrer=http://localhost:3000`; simulated denial of that
new flow also returned to localhost and lost the Android state.

This corrects the earlier claim that a 302 to Google verified the Android
allowlist. That only proved provider handoff. The new
`scripts/check-prod-oauth-redirect.mjs` also follows its own synthetic denial
through the PROD callback and requires the exact Android return and original
nonce. It does not exchange a user code or sign anyone in. Regressions cover
localhost fallback, missing/wrong/duplicate state, TEST scheme, unexpected
provider callback, and secret-key rejection.

Required external fix: in PROD Authentication → URL Configuration → Redirect
URLs, save `hu.grapes.healthconnect://auth/callback?state=*`. Changing Site URL
alone does not repair allowlisting or preserve the state. No Auth-config write
tool is available in this session, so the owner was given the exact field/link.
After saving, re-run the synthetic return check, then start a fresh Google
login from the installed v29 app. No APK rebuild is required for this configuration
fix. Real device success remains unverified until the owner completes that retry.
