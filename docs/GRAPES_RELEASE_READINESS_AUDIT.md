# Grapes release-readiness audit

Audit date: 2026-10-28  
Source of truth: `codex/android-app` plus the unmerged UI fixes in PR #218. This is a source-level audit, not a claim that the installed phone build has passed.

## Current source findings

| Area | Evidence in source | Status |
|---|---|---|
| One Home | `src/home/home-mobile.js` renders Shopping, Inventory and Suggestions together; `src/home/home-store.js` preserves local v1 journal | Present in source; final accepted visual review and phone test still required |
| Home family cloud sync | v2 CAS/outbox/auto-retry modules and native TEST gate exist; current production UI path remains separate | TEST-only; do not turn on in PROD without a separately approved production backend/schema and A/B proof |
| Main module navigation | Six-icon rail is in `design/android-mobile-preview.html`; previously remained visible inside modules | PR #218 changes it to home-only and updates the browser tests |
| Tools | E-book and QR destinations work through the shell, but the old two-card tile design was still in the source | PR #218 replaces it with compact neon launch rows |
| Outdoor / Plants | `src/outdoor/outdoor-mobile.js`, `src/outdoor/outdoor-data.js`, `src/outdoor/outdoor-api.js` exist; shell mounts Outdoor and the main menu links to it | Source implementation exists; actual installed APK asset/version has not yet been compared |
| Finance | `src/finance-tracker.js`, `src/finance-import-ui.js`, and Finance styles exist; five tabs are part of the module | Existing Finance function tests pass in earlier runs; the actual Android-shell entry route and reported white screen are being tested in PR #218 |
| Settings | `design/android-mobile-preview.html` has grouped settings and provider entry points | Existing browser regression checks must all pass; appearance alone is not functional proof |
| Samsung Health | Health Connect and owner-scoped Samsung Water adapter source exist. `android-health-connect-poc/README.md` says the licensed Samsung AAR/device validation is still a requirement for direct SDK support | Not a completed direct Samsung Health release integration until licensed AAR + real-device test pass |
| Google / Drive login | `PROJECT_STATUS.md` previously recorded `UNREGISTERED_ON_API_CONSOLE` and Android OAuth setup as a blocker | Must be revalidated with the intended Android OAuth client and a real device before claiming Drive login is release-ready |
| Supabase | TEST project contains private Home tables/RPCs; the TEST sync gates are explicit | No PROD schema migration or production family sync enabled; this is a separate, later approved milestone |

## Required gates before signing a new production APK

1. PR #218 CI is green, including the main navigation, Home preservation, Tools, Outdoor and Finance route tests.
2. Run `npm test` and `npm run build:android-web` on the exact source commit selected for release.
3. Build the Android assets into the APK from that same commit. Verify package ID, version code/name, APK SHA-256 and signing certificate against the intended release key.
4. Install the new build **over the existing installation** on the phone. Do not clear app data or uninstall; existing local Home, Food, Finance and Water data must remain.
5. On the phone verify: one global six-icon rail only (no duplicated in-module rail); Android Back exits a standalone module; Tools opens E-book and QR; Outdoor opens Növényeim, catalogue, weather/task sections; Finance opens with all five tabs and no blank screen; Settings actions open their real destinations.
6. Re-test Home: shopping, inventory and evidence-only suggestions; confirm “Megvettem” does not silently add inventory; confirm unknown stock is not presented as confirmed missing.
7. Re-test Health Connect read/write/permission revocation with explicit consent. Direct Samsung Health SDK is a separate gate and cannot pass using the stub adapter.
8. Test Google/Drive OAuth with the actual configured Android client. A web browser test cannot prove Android OAuth registration.
9. Keep family Supabase v2 disabled in PROD until the production schema, auth/authorization review, migrations, owner isolation, conflict handling and real authenticated A/B device tests are explicitly approved.

## Release decision

**NO-GO for a new production APK until the gates above pass.** The source already contains several modules that appear absent in the user's installed build, so first compare the exact APK's version/hash with the source commit and rebuild the web assets. Do not infer that a module is complete merely because its JavaScript file exists.

No PROD database writes or migrations are part of this audit.