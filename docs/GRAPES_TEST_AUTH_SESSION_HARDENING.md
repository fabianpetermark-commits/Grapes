# Grapes TEST Auth — session-state hardening after #89

Isolated follow-up draft PR stacked on #89. No changes to Android PROD/TEST entrypoints, ordinary Google Drive login, E-book or Health data.

## Found and addressed

- The Supabase `getUser()` response for a fresh browser with no session can contain `AuthSessionMissingError`. This is a normal signed-out state, not a failed authentication attempt. Other provider/network errors still remain errors.
- The initial asynchronous `getUser()` response could resolve **after** a newer `SIGNED_OUT` / `SIGNED_IN` event and incorrectly resurrect a previous account in the UI. An auth-event generation counter now discards stale results.
- Supabase explicitly warns against awaiting other Auth API calls within `onAuthStateChange` callbacks. Identity verification is now deferred outside that callback; only a server-verified `getUser()` response can mark the UI authenticated.
- During a signed-in session, the TEST UI now hides its login form, Google button and registration/recovery navigation; local sign-out clears both credential fields and re-enables login.
- During a password recovery session, the new-password form remains accessible. After session loss it is hidden and the UI resets to ordinary sign-in.
- No tokens, e-mail addresses, provider raw errors or credentials are sent to logs. Existing approved `login-preview.html` style and behavior remain intact; new visibility CSS is limited to `login-auth-test.html`.

## Verification

New synthetic tests cover idle startup, genuine provider errors, late initial response, late sign-in after logout, unsubscribed listener, visible account state, sign-out cleanup, and expired recovery form.

CI gates inherited from #89: pinned Supabase SDK, clean npm ci, complete unit tests including E-book, two Vite builds and browser/responsive checks. A green CI on the #90 head is required to mark the code checked.

## Remaining gates

- **Google Cloud TEST OAuth client and Supabase provider**: user configuration pending; do not use Drive scopes.
- **Supabase TEST auth URLs and e-mail verification**: hosted configuration not yet complete.
- Real TEST identities, login, recovery, and two-account isolation not yet tested; no production readiness claim.
- No APK, merge, release, actual Health sync, hosted data migration, or changes to other existing Supabase projects. Health remains NO-GO.
