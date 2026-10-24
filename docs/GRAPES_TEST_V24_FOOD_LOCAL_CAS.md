# Grapes TEST v24: isolated Food local CAS verification

Base: #124 (`f1b70b26174ebdc53b7685e5130a290b02ead75d`). Related, unmerged SQL proposal: #125. This branch changes no Supabase SQL, remote project, PROD, E-book implementation, or release build. Health remains **NO-GO**.

## Scope and behavior

`VITE_GRAPES_TEST_FOOD_LOCAL_CAS_ENABLED=true` works only with `VITE_GRAPES_TEST_CHANNEL=1` and is **off by default**. It is a synthetic QA mode, not a production migration switch. In this mode Food loads from the existing IndexedDB `projects` store, journals each edit in profile keyed browser storage, and commits with a transaction that compares the previously read `saveToken` before replacing the current row. A stale writer leaves its full snapshot in a separate `food-conflict-*` row. An IndexedDB abort rejects the save. A failed journal write also rejects the save before IndexedDB work. Save confirmation appears after commit. Food Drive read/write is paused in this QA mode; ordinary Food Drive and all E-book Drive behavior remain unchanged with the flag off. This mode must not be enabled for real user data without reviewing the remaining #95 recovery risks and browser storage limits.

The local Health source inventory marks each conflict row as an unresolved `indexeddb-recovery` source. Preview shows a blocker, while verified backup includes its complete bytes and SHA-256. No automatic conflict merge, deletion, or Supabase upload occurs. The original current row stays intact. A backup does not itself resolve a conflict. Legacy Food-to-Water hydration conversion is paused in this QA mode until Water durability is verified.

## Verification on this branch

Local Node 24.19 and Chromium (synthetic data):

| Check | Result |
| --- | --- |
| Clean `npm ci` with workspace npm cache | PASS |
| `npm test` | PASS, 66 test files |
| `npm run build` | PASS |
| `npm run build:android-web` | PASS |
| Two-tab TEST Food UI CAS, separate recovery row, no stale success toast, backup blocker | PASS |
| Browser IndexedDB concurrency fixture | PASS |
| E-book Drive shelf and EPUB reader browser regressions | PASS |
| Hosted Supabase RLS/Auth/CAS | NOT TESTED on this branch; #125 covers isolated local Supabase CLI only |
| Real account, Drive, Health Connect, Water durability | NOT TESTED |
| Native Android QA build and full browser suite | CI pending |

`npm ci` required `npm_config_cache=/workspace/.npm-cache` in this sandbox because the default npm cache is outside the writable workspace. No dependency or lockfile change was made. Existing build chunk warnings do not fail the build. The full browser suite has six known baseline failures on #124; the CI job reports all failures without skipping or weakening them.

## Remaining release gates

1. Close #95 data preservation and Water durability gaps, including account switching and interrupted storage writes.
2. Review manual conflict recovery UX and verify backups can be restored; current preview deliberately blocks transfer.
3. Validate #125 SQL against the dedicated TEST project only after explicit authorization. Local Supabase CLI PASS does not prove a hosted project is configured correctly.
4. Test a genuine TEST sign-in and synthetic Food write/read across two accounts; then stage an opt-in migration preview with original local and Drive copies retained.
5. Resolve or explicitly disposition all six baseline browser failures, run native navigation checks, then decide whether a separate TEST release candidate is safe. No APK is published by this PR.

The permanent E-book boundary remains Google Drive. Supabase Auth must not request Drive scopes or remove shared Drive infrastructure.
