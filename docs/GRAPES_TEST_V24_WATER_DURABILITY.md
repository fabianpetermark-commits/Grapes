# Grapes TEST v24: Water fail-closed storage and recovery

Base: draft #126 (`8df795e230bc9f249875fc92a2f902646f25b1fd`). Trace: #95 and draft #94. This is an isolated TEST branch, with no Supabase project, PROD, E-book, release, or APK publication change. Health remains **NO-GO**.

## Fixed in the actual Water UI

Previously `loadWaterStore()` caught malformed JSON and returned an empty object. Adding water then replaced the historical `grapes-water-v1` bytes. The UI now uses the strict Water reader: a damaged or empty stored value disables Water additions and goal edits, shows an error, and leaves the original bytes untouched. Routine writes compare the bytes observed before the edit, validate the proposed value, and read back the stored bytes before reporting success. Health Connect hydration import uses the same write check.

Water restore first verifies a fresh `grapes-water-recovery-v1:<uuid>` checkpoint containing the exact previous bytes, including malformed bytes. A checkpoint identifier is never reused. If the checkpoint or restore write fails, the UI reports failure. The old Water JSON backup format remains readable. E-book Google Drive code and permissions are unchanged.

The existing localStorage key is deliberately retained for compatibility. This patch **does not** make Water profile scoped, provide an atomic two-tab Water compare-and-swap, or prove all account-switch paths. A sequential stale edit is rejected; simultaneous writes across tabs require an IndexedDB transaction or server CAS. Those are still #95 release blockers. Legacy data must not be silently assigned to a newly signed-in Supabase account.

## Verification

Local Node 24.19 and Chromium, synthetic data only:

| Check | Result |
| --- | --- |
| `npm test` | PASS, 66 test files |
| `npm run build` | PASS |
| `npm run build:android-web` | PASS |
| Damaged Water UI, blocked add/export, verified restore, quota failure without success toast | PASS |
| Profile isolation and simultaneous two-tab Water writes | NOT TESTED; not implemented |
| Native QA compile and complete browser suite on this branch | CI pending |

The six known full-browser baseline failures on #126 remain visible in CI. Existing Food, Finance, Home and E-book regressions are included in unit and focused browser checks. No real user data was used.

## Next release gate

Implement profile scoped Water storage with an explicit, previewed claim of `grapes-water-v1`; retain the exact original bytes and support v1 backup restore. Move concurrent writes to a transactional store, then test two tabs, two accounts, recovery, Android storage failure and account switching. The Food Drive in-flight profile guard and other #95 items also remain open. No TEST APK should be published from this branch.
