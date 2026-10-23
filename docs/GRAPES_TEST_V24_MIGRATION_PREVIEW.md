# Grapes TEST v24: owner-scoped Health migration preview

Baseline: released `android-test-v24`, commit
`f14127b72267db1c77c1751bded5027352837202`. This is a focused
forward-port of the read-only preview idea from draft #102, with an explicit
Supabase owner boundary. It does not import #102's SQL, outbox or application
integration. `AGENTS.md` and `docs/GRAPES_PROJECT_CONTEXT.md` are absent
from the v24 repository tree.

## Contract

- The caller must obtain `verifiedOwnerId` from a fresh Supabase `getUser()`
  result. A locally cached user ID is insufficient. This pure function cannot
  authenticate its caller.
- Every inventoried source and target head must belong to that exact user.
  Foreign sources are blocked and foreign target inventories fail closed.
- Legacy sources without an owner produce `claimsRequired` and no import
  entries. A future explicit claim flow must show a backup and preview before
  binding any old data. This proposal never claims them automatically.
- Identity is `profileId/kind/recordId`. Only exact repeats from the same
  source, version and provider are duplicates. Equal-looking records with
  different provenance are conflicts.
- Existing target heads, malformed records and E-book kinds stop import.
  YAZIO and Health Connect payload fields are carried through without
  synthesis. E-book remains on Google Drive.
- The function has no storage, network, Drive or Supabase write path. Its
  `canImport` result is an advisory preview, never permission to write.

## Verification and next gate

Seven focused Node tests cover separate record IDs, legacy claim, two-user
isolation, foreign target rejection, provenance conflict, E-book exclusion,
and Health Connect identity. Run `node tests/grapes-health-migration-preview.test.js`.
Local result on Node 24.19.0: 7 PASS, 0 FAIL.

This is **not** end-to-end migration or fiókonkénti isolation of existing
local data. The released v24 app does not call this module. The #94/#95 Health
durability and Drive conflict work remains open; the Phase 2 SQL remains
unapplied. The latest #108 full browser run has 18 PASS / 6 FAIL files, with
separately noted baseline failures. Do not enable Health sync, copy user data,
apply remote SQL, release an APK or claim migration complete from this PR.

Next: build a read-only inventory adapter against the actual v24 local/Drive
formats, show owner/profile/source counts and a verified backup, then add an
explicit legacy claim flow. Only after #95 data-safety integration and hosted
TEST RLS/CAS verification should an opt-in synthetic record be written.
