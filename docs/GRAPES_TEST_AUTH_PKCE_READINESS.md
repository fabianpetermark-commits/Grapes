# Grapes TEST Auth — phase 1.5 PKCE runtime and activation gate

Baseline: #85 → #86 approved black/cyan UI → #87 Auth adapter → #88 separate TEST UI → this draft PR.

## What is actually implemented

- An independent official Supabase-JS-compatible client initializer in `src/auth/grapes-test-runtime.js`, controlled by injected `createClient` and **not active** in any production or TEST app startup yet.
- A constant, allowlisted project URL: `https://aighqtqjlzirlokxwupt.supabase.co` (Grapes TEST, eu-central-1). The runtime rejects any other project URL and any secret/service-role/legacy-anon key.
- PKCE OAuth, automatic refresh, URL callback detection, TEST-specific **sessionStorage** and unique auth storage key. TEST tokens are never placed in the existing E-book Drive credential store.
- Only the explicit `/Grapes/login-auth-test.html` route on the approved GitHub Pages or local loopback hosts may initialize TEST Auth.
- Session state is verified using the Supabase Auth `getUser()` method and updated with the official Auth state listener. Google, signup, password reset and local signout all use the #87 adapter.
- `.env.example` documents TEST-only URL/publishable key and disabled feature flag. No actual keys, users or live data have been added.
- Existing real Google Drive login, E-book source, Health data stores, login preview, Android TEST APK and main remain untouched.

## Critical dependency / activation gate

The connected execution container cannot resolve the npm registry. Do not fabricate or manually edit `package-lock.json`. The official Supabase JavaScript client is NOT YET installed, and the TEST page intentionally remains disabled. To complete activation, on a development environment with npm network access:

```sh
npm install --save-exact @supabase/supabase-js@2.118.0
npm ci
npm test
npm run build
npm run build:android-web
```

Review both package.json and the generated package-lock.json; commit both in the **next isolated draft PR**. Confirm package version and security advisories before installation. Add a static `import { createClient } from '@supabase/supabase-js'` inside the TEST route's entrypoint, then gate the start on `VITE_GRAPES_TEST_AUTH_ENABLED === 'true'` and the correct project URL and publishable key. When enabled, call `activateGrapesAuthTest({ createClient })` *instead of* `initializeGrapesAuthTest()` — not both (avoid double-registered form listeners). Do not import SDK from a third-party CDN.

## Supabase Auth configuration (requires interactive dashboard actions)

1. Check email/password provider under https://supabase.com/dashboard/project/aighqtqjlzirlokxwupt/auth/providers . Keep email confirmation enabled. Default Supabase SMTP is test-only and limited; arrange a proper SMTP provider before broad testing.
2. Configure `Site URL` and additional redirect allowlist under https://supabase.com/dashboard/project/aighqtqjlzirlokxwupt/auth/url-configuration . Use **exact** callback `https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html` and local test callback `http://localhost:5173/Grapes/login-auth-test.html`. Other local ports must be explicitly added, never use wildcard for production.
3. Google Cloud OAuth web application: create a **dedicated Grapes TEST Google OAuth client**. Its Authorized redirect URI points to **Supabase Auth**: `https://aighqtqjlzirlokxwupt.supabase.co/auth/v1/callback`; its JavaScript origin is the approved host. Enable only `openid`, email and profile; **never** Drive scopes.
4. Paste Google client ID and client secret **only** into Supabase dashboard's Google Auth provider configuration. Never put client secret into the repo, `.env`, `VITE_` variables, chats, or CI logs.
5. Pin the TEST publishable key and project URL via a *non-secret* TEST-specific deployment config; do not reuse any other Supabase project. Confirm GitHub Pages deployment is opt-in and not replacing the published Grapes app.
6. Password recovery requires a recovery-specific UI and server-verified password change on `PASSWORD_RECOVERY` using `supabase.auth.updateUser`. **This PR supports requesting the e-mail only**, not changing the password after callback. Do not claim the full flow works yet.

## Verification gates before Android TEST APK

- Unit test the allowlisted project, origin, storage isolation, synthetic signed-in/signed-out session events and invalid keys.
- Run full unit, browser, 98 E-book/Drive regressions, responsive layouts and both web builds against one commit.
- Two separate synthetic accounts: signup, confirmation, wrong password, Google account, page reload, session expiry, tab/restart, sign-out and cross-account denial.
- Android OAuth callback and safe login separately verified on an actual TEST installation.
- No account migration, real Health data writes, E-book Drive-token changes, merge or release without explicit approval. **Health release NO-GO**.

The new project has no Health tables; RLS/CAS proof from earlier ephemeral CI does **not** mean this hosted project has active Health sync.

