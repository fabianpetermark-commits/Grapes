# Grapes — Supabase Auth Phase 1 (review-only)

Baseline: approved login UI draft PR #86 (d0c1c0bc01fd436c5c35ba654003332c1415c1b8), stacked on #85.

This PR is an isolated application-side authentication adapter and unit tests, **not a deployment or complete sign-in integration**.

## Scope
- src/auth/grapes-auth-flow.js delegates to a separately configured official Supabase JavaScript Auth client. Supports Google OAuth, email/password sign-in, email signup, password reset request, current-user lookup and local sign-out.
- This layer does not import/instantiate the SDK, persist tokens, expose a secret key, read/write Health data, or access Google Drive.
- Google login does **not** request Drive scopes; E-book must retain its independent Google Drive permission.
- Approved black (#000000)/cyan (#3BDCF2) login-preview.html and existing Google/Drive login remain unchanged.
- Username aliases require a future privacy-reviewed server-side resolver; no public username-to-email lookup.
- The source repository at this baseline returned NOT_FOUND for AGENTS.md and docs/GRAPES_PROJECT_CONTEXT.md in main, TEST integration and #86; no missing requirements are assumed.

## Not implemented
- Dedicated hosted Grapes Supabase TEST project and organization/cost confirmation.
- Pinning and installing @supabase/supabase-js, SDK startup, PKCE session configuration, Android callback/deep links, safe session persistence and refresh.
- Google OAuth provider configuration and redirect allowlist, password recovery callback page, SMTP setup.
- Account linking, full username login, staged activation of approved UI, real Google sign-in or Android TEST APK.
- Actual Health sync, Drive-to-Supabase migration or data access.

## Next gates
1. Review current Supabase Auth documentation and changelog, pin official SDK version with matching lockfile, and initialize client exclusively with publishable key and TEST URL. Never include service-role/secret keys in browser builds.
2. After separately choosing an organization and confirming any cost, provision a new isolated Grapes TEST project; never reuse the user's older unrelated project.
3. Implement Google OAuth with PKCE and allowed redirects as a TEST-only opt-in flow; add verified email/password registration, login and recovery. Confirm email verification, local sign-out, session refresh, and multi-identity account linking.
4. Wire these flows into the exact approved login UI only when correctly configured. Username aliases must not publicly expose user email addresses. Existing Drive/E-book authentication stays independent; preserve offline-first local Health data.
5. Verify two accounts, account changes, foreign-user RLS denial, local CAS, network interruption, Android device Google OAuth, the entire browser/unit suite and E-book Drive regressions. No automatic migrations or production changes.

## Evidence
Nine adapter contract tests were run locally with Node.js 22 and passed. These are synthetic, non-networked tests; they do not establish real Supabase connectivity or Google OAuth. Full repository CI must verify this cumulative branch. No merge, live Supabase access, TEST/PROD integration, APK, release or Health storage change.

Health release remains NO-GO.
