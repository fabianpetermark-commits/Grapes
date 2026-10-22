# Grapes PROD Auth rollout — restricted staging, 2026-10-22

## Scope and immutable baseline

- **Production Android source:** `codex/android-app` at signed stable release `android-v28` / commit `39306e48455a54cf4037faf43688f42725882440`; application ID `hu.grapes.healthconnect`; own historical PROD signing key; updater remains stable channel.
- **Approved TEST UX:** independently signed `android-test-v24` / commit `f14127b72267db1c77c1751bded5027352837202`; package `hu.grapes.healthconnect.test`; only this exact version was approved by the user on a physical Android device.
- **This staging PR:** must target `codex/android-app`, not `main`. New isolated `feature/grapes-prod-auth-staging-20261022` branch; no TEST feature-branch merger and no source overwrite/copy from the newer TEST app.
- **Current status:** no Grapes PROD Supabase project yet. Connected Supabase account lists **Grapes TEST** (`aighqtqjlzirlokxwupt`, active) and another older inactive unrelated project. Never repurpose or alter them without express instruction. Supabase indicated project creation cost of **USD 0 per month incremental at time checked**; organization selection is required before creation.
- Neither existing PROD Google Drive/E-book nor local Food, Water, YAZIO, Finance data may be reset, migrated, merged or re-keyed in this work.

## Mandatory blockers and implementation gates

1. Explicitly select the Supabase organization; create a distinct **Grapes PROD** project (prefer EU Central 1) only there. Verify project status, publishable key, Google provider availability and allowed callback URL in Supabase Auth Dashboard. Do not commit project secrets or keys in code/repo. Do not silently reuse existing inactive unrelated project.
2. Confirm Google as OAuth provider, including correct Authorized Redirect URI to the **new project's** `https://<prodref>.supabase.co/auth/v1/callback` in Google Cloud. Register exact **Android PROD** deep link `hu.grapes.healthconnect://auth/callback` (or preferably an independently verified owned HTTPS App Link if configured); never use the TEST custom-scheme callback on PROD. Avoid wildcards for production redirect.
3. Port **auth-only** modules from TEST v24, not the full TEST app. Review `TestAuthCallback.kt` against PROD package, origins, anti-replay, strict one-time state, PKCE and callback restrictions. Rename QA/Test classes, preference namespaces and asset domain; ensure no `grapes-test-auth.invalid`, `hu.grapes.healthconnect.test` or Grapes TEST Supabase URL appears in a PROD artifact. Confirm unique web storage key for PROD.
4. Wire verified Google login + optional e-mail/password with existing accepted Grapes UX (one official-logo-only loading surface for preexisting session, direct login when signed out, remembered session, simple final Settings `Kijelentkezés` with emergency-exit icon). This must work with **new PROD account credentials**, not the separate TEST account. Native trusted-origin WebView navigation gate must not rely on local cache alone; verify `getUser()` and support sign-out/login retry safely.
5. **No data migration** under the new identity by default. Android app package and PROD signing key remain unchanged; existing WebView origin `https://appassets.androidplatform.net` still holds its data. Do not trigger `clearData`, delete storage, or reuse TEST keys. Maintain existing Google Drive authorization flow and its separate scopes/token storage.
6. Regression proof: build with Auth disabled before project readiness; `npm ci && npm test && npm run build:android-web`; QA native callback tests; targeted Android browser Food, Water, Finance and E-book/Drive; validate PROD applicationId and historical PROD signing SHA; archive checksum and signed source. Include crash/relaunch and offline/expired session safe fallbacks.
7. Physical device acceptance **before** stable release: upgrade real signed PROD v28 with existing user data, confirm backup/export, first login, Google browser callback, remembered login and single official splash, Settings logout, re-login, offline, app-update prompt, existing Food/Water/YAZIO/E-book/Finance/Drive intact. Roll back code via new signed forward release, never uninstall app or clear data.

## State machine & separation

| State | Visible screen | Native action |
| --- | --- | --- |
| No saved PROD Supabase session | PROD login directly | No account bypass |
| Saved token, still checking | One official Grapes logo only | Strict `getUser()` check |
| Verified PROD account | Existing original Grapes home | Native gate permits app origin |
| Token revoked/expired/invalid | PROD login with explanation | No app unlock |
| User selects Settings → Kijelentkezés | PROD login | Clear only PROD Supabase session; leave Drive and local records |

## Release decision

**NO-GO now.** The current PR only introduces an **unwired, fail-closed configuration validator and unit tests** for future production integration. It must not enable Auth in PROD, create identities by implication, merge into release or publish stable APK.

The user has authorized the eventual production rollout once safe, but prerequisites and device validation are not yet satisfied. The stable release workflow remains manual and uses `codex/android-app`. Recheck both branches and TEST #108 before any integration.
