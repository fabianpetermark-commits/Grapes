# Grapes TEST – two-account Auth / RLS verification gate

**Scope:** Grapes TEST only, no PROD or real Food-data synchronization. This gate intentionally distinguishes real local Auth verification from hosted TEST verification.

## Current evidence (24 October 2026)

- #131 synthetic Food offline outbox and independent server readback: focused CI PASS.
- #132 signed TEST v25 candidate: CI PASS; owner completed one real Android → hosted TEST Supabase synthetic save and independent readback (rev. 1).
- #133 strict immutable CAS attempt proof, offline retry regressions, mobile QA button layout: all CI jobs PASS (run [40132860442](https://github.com/fabianpetermark-commits/Grapes/actions/runs/40132860442)).
- **Hosted Grapes TEST currently has only one Auth user.** The two-account hosted gate is therefore not claimed as complete. Do not fabricate a second hosted JWT or confuse a SQL claim simulation with an actual second login.

## Automated two-real-user proof – isolated local Supabase

The `grapes-test-two-account-auth-isolation.yml` workflow invokes the established `poc/supabase-phase2/ci/verify-local.mjs`, which:
1. Starts a disposable Supabase CLI project on the GitHub runner with its own isolated Auth, PostgreSQL and Data API.
2. Creates two distinct synthetic accounts using the **local stack only**, signs in each with Auth, independently verifies `/auth/v1/user` and uses the two genuine Auth JWTs for Data API requests.
3. Tests profile ownership, anonymous denial, own writes/readback, stale CAS retry, immutable attempts, cross-account document/history reads, cross-account CAS denial and recovery isolation.
4. Verifies actual PostgreSQL RLS for both identities under temporary rolled-back grants, append-only recovery, transaction rollback and two concurrent database sessions.
5. Runs local security advisors. **No remote login, password or service-role key is needed; there are no hosted mutations or APK releases.**

## Hosted Grapes TEST: remaining required proof – NO-GO

Two separately controlled **TEST Auth accounts** must exist, with independently verified real login sessions. The second must not be simulated with SQL `set_config(request.jwt.claim.sub,...)`. Do **not** request or send passwords/access tokens in ChatGPT, GitHub PR comments or issue attachments.

Future explicitly approved synthetic-only hosted test must establish:
- A creates a new isolated synthetic profile; B creates a different isolated profile.
- Each user sees and can retry **only** their own `food_diary` record, revision and immutable attempt.
- A→B and B→A `read_document`, document/history listings, `read_revision` and CAS writes are denied or return no rows, and neither owner's document changes.
- Unauthenticated calls are denied. An account switch, logout, lost response or offline retry never reports a false successful write.
- Record IDs and candidate payloads are fixed synthetic QA data only; existing Food/Health/Water/Drive records are not read or modified.

**Do not enable normal Food sync or trigger a new signed APK on the strength of local integration alone.** A hosted multi-account proof requires a second independently controlled account. No data cleanup or user deletion should occur silently; the existing append-only audit and user data must remain intact.
