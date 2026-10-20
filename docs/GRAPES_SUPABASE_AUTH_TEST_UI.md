# Grapes Auth TEST UI — isolated integration staging

Stack: #85 → #86 approved UI → #87 Auth adapter → this draft PR.

- Approved black/cyan design is reused at /Grapes/login-auth-test.html.
- The original /Grapes/login-preview.html and existing Google/Drive/E-book login remain unchanged.
- In this branch the TEST page is intentionally **disabled** until a correctly pinned and installed official @supabase/supabase-js SDK, isolated Grapes TEST publishable key, allowlisted PKCE callback, Google provider and authenticated session handling have been reviewed. It must not accept or send credentials yet.
- The bindGrapesTestLogin(root, flow) controller binds the approved elements to a flow supplied by the host. It supports email/password, signup, password recovery, Google redirect and TEST-only sign-out, with non-enumerating/generic errors.
- The existing #87 adapter is never imported by the normal application. Only future TEST bootstrap code should create a correctly configured client and inject the adapter.
- Username alias login is not implemented; Supabase Auth password login uses an email address by default. A privacy-safe server-side username resolver must be designed before enabling aliases.
- No hosted-project RLS migration, database writes, credentials, E-book token changes, Android APK, release, main/TEST/PROD integration or Google Cloud changes.
- TEST project: aighqtqjlzirlokxwupt (Frankfurt eu-central-1). Do not reuse the older unrelated Supabase project. Do not commit a service_role/secret key.

## Remaining gates

1. Official SDK pinned to an exact version with complete npm lockfile and clean npm ci; TEST-only Vite environment variables for URL and publishable key.
2. Configure Supabase Google OAuth with a separate Google Cloud client and allowed redirects. Do not request Drive scopes. Use PKCE and verify callback/Android app-link.
3. Add opt-in TEST bootstrap, secure session lifecycle, account switching, confirmation and password reset callback. Ensure generic auth errors and no unsafe username lookup.
4. Verify two synthetic user accounts, session refresh, Google OAuth, offline, RLS/CAS and existing E-book/Drive regressions.
5. Only after verification and explicit approval produce an Android TEST APK.

Targeted test: node --test tests/grapes-login-controller.test.js

Health release remains NO-GO.
