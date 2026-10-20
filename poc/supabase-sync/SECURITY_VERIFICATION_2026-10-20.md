# Phase 0 security and PostgreSQL verification — 2026-10-20

Source: draft PR #76 at `6ef52f6`, stacked on Health PR #73 at `f05245c`. This report records observed outcomes in the managed workspace. No existing Supabase project was accessed.

## Security review and corrections

Current Supabase [Database Functions](https://supabase.com/docs/guides/database/functions) guidance says to prefer security invoker, set a fixed search path for any security definer, and explicitly revoke default function execution. The [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) notes that privileged functions can bypass RLS. The [authenticated security definer advisor](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable) warns against exposing such functions to every signed-in user.

PR #76 exposed `api.compare_and_swap` as `SECURITY DEFINER`. This branch makes the exposed RPC `SECURITY INVOKER` and moves privileged mutation to `grapes_private.compare_and_swap_internal`. Both functions use an empty search path; private references are schema-qualified. Function execution is revoked from `PUBLIC` and `anon`, then granted only to `authenticated`; the private schema is not exposed through the Data API. The private function still checks `auth.uid()`, rejects anonymous Auth users and checks the owner/profile pair before mutation. A separate owner-scoped `api.read_attempt` makes rejected candidates retrievable. The SQL security script now checks cross-user recovery denial, anonymous role denial and rollback, in addition to stale writes, idempotency and immutable history.

**Residual review risk:** the private function remains privileged and must be audited as a capability available to all signed-in users. Its function owner, schema exposure, default privileges, JWT authenticity/session handling, payload limits and quotas must be checked in the actual dedicated TEST configuration. SQL-level `auth.uid()` tests with fabricated local claims do not prove that real Supabase Auth issued or revoked a token. The current proposal has no complete head/history read API or Storage policies. These are release blockers.

## Results

| Check | Result | Evidence / limit |
| --- | --- | --- |
| PR #76 SQL privilege review | **PASS** (review) | Exposed definer and missing recovery read path identified; corrected in this branch. This is a design review, not database execution. |
| Current Supabase docs review | **PASS** | Database Functions, RLS and advisor pages read through Supabase docs search. Changelog URL could not be fetched through the workspace proxy. |
| Local PostgreSQL/Supabase startup | **BLOCKED** | No `psql`, `postgres` or `initdb` binary found. Docker local socket returns `connect: operation not permitted` in the sandbox. No remote project used. |
| Apply schema and run `security-tests.sql` | **NOT TESTED** | Requires isolated local PostgreSQL or separately authorized dedicated TEST. SQL has not been executed. |
| Two simultaneous independent PostgreSQL connections | **NOT TESTED** | The JS reference model tests a race, but does not substitute for two DB sessions. |
| Real Auth A/B, anon, RLS and direct-table grants | **NOT TESTED** | Proposed SQL assertions exist; no database execution or real JWT verification. |
| Atomic stale rejection, immutable snapshots, operation retry, rollback | **PASS** (synthetic model); **NOT TESTED** (PostgreSQL) | `tests/supabase-sync-poc.test.js` passes. The PostgreSQL implementation and rollback script remain unverified. |
| Clean checkout `npm ci --no-audit --no-fund` | **BLOCKED** | Registry fetch failed with `EPERM` connecting to configured proxy for `zlibjs-0.3.1.tgz`. Offline `npm ci` failed `ENOTCACHED` for that tarball. |
| `jszip` dependency investigation | **PASS** | `package.json` declares `jszip ^3.10.2`; lockfile resolves `3.10.2`. The module is absent because installation could not finish. No package changes needed. |
| Full `npm test` in clean checkout | **FAIL** (environment) | 22 test files passed, 4 failed to load: EPUB tests lack installed `jszip`, Finance import lacks `xlsx`, and PDF metadata lacks `pdf-lib`. These are declared dependencies absent after blocked `npm ci`; this is not evidence of an application regression. |
| Prototype and E-book targeted tests | **PASS** | `node --test tests/supabase-sync-poc.test.js tests/ebook-drive-boundary.test.js tests/ebook-library.test.js tests/ebook-reader-sync.test.js` exited 0. |
| E-book Google Drive source | **PASS** (unchanged scope) | PR changes are limited to `poc/supabase-sync/` and its tests. No E-book or shared Drive implementation changed. Browser/device Drive flows are **NOT TESTED**. |

## Recommendation

**Not ready to deploy to a dedicated Grapes Supabase TEST project yet.** The SQL design is safer to review, but no PostgreSQL execution, independent-session race, real Auth/RLS test or complete dependency-installed suite has passed. Next use an isolated local PostgreSQL/Supabase instance with two test identities, run the proposed schema/security checks and independent-session CAS race, repair any SQL errors, then repeat `npm ci` and the full suite when the configured proxy is available. Only after those pass should a separately authorized dedicated TEST project be considered. Existing PROD/TEST projects remain untouched; Health release remains **NO-GO**.
