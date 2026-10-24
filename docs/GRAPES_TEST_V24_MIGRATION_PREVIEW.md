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

## v24 source inventory

`grapes-health-v24-inventory.js` accepts caller-supplied copies of the actual
v24 IndexedDB Food project envelope, Drive Food project envelope or raw
`grapes-water-v1` JSON. It performs no reads or writes. In particular it
does not call `listGrapesProjects()`, which creates Drive folders while
locating the module folder and is unsuitable for a read-only migration scan.
The v24 Food envelope's actual module value is `Ételnapló`; other modules,
including E-book, are rejected.

Food diary, custom food, recipe, ingredient, nutrient goal and YAZIO batch
identifiers remain distinct; imported YAZIO provenance stays in the raw
payload. The Water adapter retains Health Connect external keys and timestamps.
Both adapters return `ownerId: null`, because existing Drive/local profile
IDs do not establish ownership by the newly signed-in Supabase user.
The caller must supply a stable snapshot version and must recheck source bytes
before any eventual write.

The adapter reports data without a reviewed target mapping as `unmapped`
and `complete: false`. This includes Water daily goals, nonempty Food profile
metadata, recipe libraries and other Food settings. The migration UI must
display these items and block transfer until each has an approved mapping or
an explicit retain-local decision. Current provider sync metadata is retained
in the untouched source and is not part of the proposed Health records.

## Explicit local capture

`captureV24LocalHealthSources()` is an isolated app-origin function, currently
called by no application route. A future TEST preview button may invoke it
after an explicit user action. It opens the existing `grapes-projects`
IndexedDB database in read-only mode, aborts the open if the database is absent
so that a scan cannot create it, and reads `grapes-water-v1` once without
writing. It filters to the actual `Ételnapló` module, ignoring Finance and
E-book project rows. SHA-256 source versions are calculated from the captured
JSON content (the raw bytes for Water). It returns full local payloads inside
the app origin; a future UI must
display counts only and must not log or transmit those payloads.

Every captured source remains `ownerId: null`. The hashes are snapshot
markers, not proof of Supabase ownership; a later write must re-read and
compare the original bytes. This function makes no Drive request and cannot
discover Drive files. Drive enumeration needs a separately reviewed read-only
API path because the existing folder helper creates folders.

## Verification and next gate

Thirteen focused Node tests cover separate record IDs, legacy claim, two-user
isolation, foreign target rejection, provenance conflict, E-book exclusion,
Health Connect identity, v24 Food/Water extraction and damaged-source denial.
Run `node tests/grapes-health-migration-preview.test.js` and
`node tests/grapes-health-v24-inventory.test.js`.
Local result on Node 24.19.0: 13 PASS, 0 FAIL.
The Chromium regression `tests/grapes-health-v24-local-reader.browser.mjs`
checks an absent IndexedDB remains absent, synthetic Food and Water capture,
unchanged stored bytes, no external requests, and the E-book/Finance boundary.

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
