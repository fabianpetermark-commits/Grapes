# #107 — Android TEST Google OAuth handoff, review draft

## Baseline and scope
- Branch starts at released, signed TEST v16 source ec8e7fa08f86967afc75f495e5fc82b62a5c4a97. PROD v28, main, Pages preview #104 and scanner #106 are untouched.
- #102 at 8b6fa16ec23702a1bbc2a0f467ce79a70202cb84 supplied only the reviewed Auth UI, SDK, flow, tests, lockfile and Vite entry. Its SQL, Health outbox and migration code were not merged.
- #104's hosted web Google OAuth was confirmed by the owner for initial login, reload, sign-out and repeat login. That does not verify Android.
- #106 reserves TEST v17 for a signed but uninstalled scanner candidate. This PR remains based on v16 for review; any future combined TEST target needs a separate reviewed rebase/integration and new version decision. Do not overwrite v17.
- #94/#95 Health durability and Drive integration remain incomplete. Health sync flag stays OFF.
- AGENTS.md and docs/GRAPES_PROJECT_CONTEXT.md were absent (404) on the checked v16 and #102 branches.

## Boundary and threat model
- QA build only: BuildConfig.GRAPES_TEST_AUTH_ENABLED is true only when the TEST URL, a publishable-key-shaped public value and the explicit Auth flag are provided at build time. PROD/debug have it false. Normal builds default Auth OFF.
- A QA-only native navigation strip opens the approved login UI at https://test-auth.androidplatform.net/assets/login-auth-test.html, served by a second local WebViewAssetLoader domain. Existing app modules remain on appassets.androidplatform.net; their JavaScript cannot read the Auth origin's persistent localStorage. The bridge stays main-frame-only and Auth-origin requests may call only the three Auth handoff methods.
- Supabase JS on the Auth origin generates and stores the PKCE verifier in its app-private WebView localStorage. signInWithOAuth uses skipBrowserRedirect and returns the Google authorization URL; native code validates the exact Grapes TEST project, Google provider, absence of Drive scopes, and a random 256-bit state in the return URL before opening the external browser. No Google credentials are collected in WebView.
- Android QA's custom-scheme callback is hu.grapes.healthconnect.test://auth/callback?state=<64 hex>&code=<code>. The QA-only manifest declares precisely scheme/host/path. The Activity accepts it only for the QA package with the enabled gate, a fresh app-private pending state, exact parameters and a single return. The code is delivered once to the Auth page's original Supabase client for exchangeCodeForSession, followed by getUser. Invalid/replayed/expired callbacks cannot create a UI success.
- The Android pending transaction is in QA app-private preferences; the PKCE verifier and Supabase session are in the separate Auth WebView origin's app-private localStorage. Both survive Activity recreation and ordinary process death. A crash after one-shot callback consumption and before exchange requires a fresh login; it must never claim success.
- A custom scheme can be intercepted by another installed app. PKCE prevents token exchange there, while state checks stop forged return intents; interception can still deny login. A verified owned HTTPS App Link would remove scheme collision but no approved owned domain is available here. This remains a manual security review point before any signed phone artifact.
- No token, authorization code, verifier or account identity is sent to Drive, Food, Water, YAZIO, Finance, analytics or Android logs. Existing E-book Drive OAuth scopes and credentials are unchanged. No database RPC or storage mutation is introduced.

## Touched-file matrix
| Area | Files | Effect |
| --- | --- | --- |
| Reviewed Auth port | login-auth-test.html, src/auth/grapes-*, src/login-auth-test.js, Auth CSS, package/lockfile, vite.config.js | Isolated official SDK Auth route on released v16 |
| Native QA | app/src/qa/AndroidManifest.xml, MainActivity.kt, TestAuthCallback.kt, app/build.gradle.kts | QA-only navigation strip, origin-isolated assets, browser handoff, strict one-shot return |
| Tests | tests/grapes-android-oauth.test.js, TestAuthCallbackTest.kt, reviewed Auth and Drive boundary tests, CI workflow | Callback, PKCE handoff, rejection, retry/session and regression evidence |
| Config/docs | .env.example, this document | Flags OFF by default; TEST-only setup |

## Owner configuration required for eventual phone UAT
1. Supabase Grapes TEST project aighqtqjlzirlokxwupt only, Authentication → URL Configuration → Redirect URLs: add a narrow custom-scheme rule for hu.grapes.healthconnect.test://auth/callback?state=*, verify the Dashboard's matching behavior with a synthetic state, and retain the existing web redirect. Do not alter any other project.
2. Keep the existing Google Cloud TEST web OAuth client callback https://aighqtqjlzirlokxwupt.supabase.co/auth/v1/callback. Do not add Drive scopes or put a client secret into the app or repository.
3. A future reviewed QA build needs only the project's public sb_publishable_... key as Vite build configuration and VITE_GRAPES_TEST_AUTH_ENABLED=true. The TEST URL must match exactly. Keep VITE_GRAPES_TEST_HEALTH_SYNC_ENABLED=false. No key value is needed in issue comments or chat.
4. Do not install or publish an APK from this PR. After native/security review and resolution of #106's v17 reservation, choose a new TEST candidate version and verify package, signer, upgrade backups and device data continuity separately.

## Verification and rollback
The draft CI runs clean Node 24 npm ci, full unit tests, focused Auth/Drive tests, web build, focused browser regressions, complete browser suite with all failures reported, QA-only Android web build using a fake publishable key, Robolectric callback tests and unsigned-for-release assembleQa without uploading an APK. #103 already records six browser failures on untouched v16; new failures must be investigated separately. Passing CI does not prove real Google return, installed Android navigation, process-kill persistence or custom-scheme collision behavior.

Phone UAT remains manual: first Google login, reload/relaunch, sign-out/re-login, cancel, airplane mode, rotation and process restart, forged/stale callbacks, account switching, and unchanged Food/Water/YAZIO/Finance/E-book local data. To roll back, leave this draft unmerged and build/install only the previously approved signed TEST version following data backup and signer checks; no data migration is needed.
