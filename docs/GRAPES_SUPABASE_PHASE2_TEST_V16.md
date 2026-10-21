# Grapes TEST v16 — Supabase Phase 2 review

Status: **development / NO-GO for Health sync or APK release**. Base is the exact
published TEST v16 source `ec8e7fa08f86967afc75f495e5fc82b62a5c4a97`.
PROD v28 `39306e48455a54cf4037faf43688f42725882440` is untouched.

## Audit before implementation

| Area | Found | Phase 2 action / remaining gap |
| --- | --- | --- |
| TEST v16 (#97/#100) | Food UI, USDA dictionary and existing Drive modules shipped; #100 CI passed. | Forward-port without replacing Food, Home, Finance or E-book files. |
| Phase 0 (#76–#78) | Draft private CAS, RLS, recovery attempt and synthetic + ephemeral local Supabase Auth/Postgres proof. | Extend as proposal; no hosted migration. Earlier local proof does not validate this modified SQL. |
| Auth (#86–#90) | Approved black/cyan UI, isolated Auth adapter, pinned SDK, PKCE, local session storage and stale-session guard. #90 CI passed, but no real hosted login. | Forward-port reviewed Auth files onto TEST v16; leave TEST route disabled by default. |
| Health (#94 / issue #95) | Water/YAZIO/stats libraries partly staged; local Food CAS, Water UI/backup and Drive guard not fully wired to shipping code. | Do not enable Health sync or use it to bypass local data durability gaps. |
| Project instructions | `AGENTS.md` and `docs/GRAPES_PROJECT_CONTEXT.md` returned 404 on main, PROD v28, TEST v16, #77, #90 and #94. | Use the named PR review documents and published release evidence. |

The reviewed references are `poc/supabase-sync/PHASE_0_ARCHITECTURE.md`,
`poc/supabase-sync/SECURITY_VERIFICATION_2026-10-20.md`,
`docs/GRAPES_TEST_AUTH_PKCE_READINESS.md`,
`docs/GRAPES_TEST_AUTH_SESSION_HARDENING.md`, and
`docs/GRAPES_HEALTH_V16_COMBINED_REVIEW.md` on their respective draft branches.

## Auth and module boundary

The exact Grapes TEST project URL is
`https://aighqtqjlzirlokxwupt.supabase.co`. Only a project publishable key is
accepted by the forward-ported runtime. `VITE_GRAPES_TEST_AUTH_ENABLED=false`
by default. The login is a separate `/Grapes/login-auth-test.html` entrypoint;
the shipped login and E-book Google Drive Auth, scopes, folder discovery,
import, reader state and user files remain unchanged. Supabase Google sign-in
must request only OpenID, email and profile, without Drive scopes.

Real signup confirmation, password email delivery, Google OAuth, password
recovery and Android callback remain **NOT TESTED** until TEST Dashboard and
Google Cloud settings are configured and two real synthetic TEST accounts are
used. Session handling is only proved by synthetic tests at present.

## Proposed data boundary

`poc/supabase-phase2/schema-proposal.sql` copies the reviewed Phase 0 private
schema and adds owner-created `grapes:<uuid>` profiles, owner-only head reads,
kind-filtered paged document reads, immutable revision reads/listing and bounded
payload size. A public client cannot choose a user ID. Allowed Health kinds
include diary entries, custom foods, recipes, ingredients, water, YAZIO imports,
nutrient goals and legacy Food/Water/Health/YAZIO blobs. E-book is excluded.
Original IDs, Health/YAZIO external keys, timestamps and original payloads must
be carried in each document payload without rewriting them.

The exposed `api` functions are invokers; privileged implementations are in
unexposed `grapes_private`. Functions use a fixed empty search path and
explicit grants; private tables have owner RLS and no direct Data API grant.
CAS stores each successful revision and each rejected candidate in immutable
history. An operation ID can be retried with identical content. Rollback uses
a new CAS operation against the **current** head revision. A conflict must be
resolved by comparing both owner-readable versions; no timestamp-based merge.

This is a **SQL proposal**, not a deployed migration. The local CI applies it
only to a disposable Supabase CLI stack. Do not apply it to the hosted TEST
project until an independent review, local SQL/Auth/RLS results, explicit
migration approval and Dashboard API-schema configuration are complete.
Storage buckets and policies are not proposed here; no Health binary data is
uploaded.

## Offline and migration preparation

`src/sync/grapes-health-outbox.js` is isolated from application entrypoints.
It persists operation ID, owner UUID, profile, local save token, expected
revision and exact JSON candidate in IndexedDB, and waits for transaction
completion before reporting queue success. Offline/network/unknown responses
remain pending. It validates Auth identity before and after each RPC; account
switch pauses replay. Conflict retains the candidate and server snapshot ID.
It **must not** be wired to the Food UI until #94/#95 local journal, profile
pinning and true IndexedDB CAS are resolved. A browser test covers synthetic
offline/reload, retries, account switch, conflict and aborted local add.

`src/sync/grapes-health-migration-preview.js` is pure and read-only. A future
inventory adapter must collect Food, Water, YAZIO, Health and recovery originals
with profile/source/version, validate IDs and schema, and export backups before
calling it. Its preview rejects E-book, corrupt profiles and existing target
heads; only identical record IDs from the same source/version are duplicates.
Equal-looking independent meals remain distinct. The preview result alone
never writes, deletes or claims ownership. Source version changes require a
new preview. Earlier missing TEST data recovery is intentionally deferred.

## Required external setup and first real TEST write

1. In the **Grapes TEST project only**, configure email/password with
   confirmation and a TEST SMTP provider, plus exact Site URL and allowed
   redirect `https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html`
   and explicit local loopback callback. No wildcard redirect.
2. Create a dedicated Google Cloud TEST OAuth web client. Its callback is
   `https://aighqtqjlzirlokxwupt.supabase.co/auth/v1/callback`.
   Put its client ID/secret only in the Supabase TEST Dashboard. No Drive scopes.
3. After a separate approval for the SQL migration, configure only `api` as
   exposed, keep `grapes_private` hidden, apply the reviewed schema in a
   dedicated TEST migration, inspect database advisors and rerun two real
   authenticated identities, anon denial, direct table denial, CAS race,
   history/retry/rollback and account switch tests against that **exact**
   hosted configuration. Never use an unrelated project.
4. Only then perform a **synthetic** first write: create a new `grapes:<uuid>`
   profile, CAS one synthetic Food record with expected revision 0, read head
   and revision, replay the same operation ID, then exercise a stale write and
   recover its candidate. No existing Health or Drive user data.
5. After #94/#95 durability fixes and device tests, separately review an
   opt-in Health pilot. Keep E-book on Drive permanently and retain original
   local/Drive backups and legacy APK coexistence warnings.

No merge, remote migration, TEST APK, PROD change or release is part of this PR.
