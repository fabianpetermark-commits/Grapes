# Grapes Health v16 — one combined integration review (NOT a release)

**Purpose:** The owner requested a single follow-on TEST update containing the remaining Health audit fixes, after validating signed [TEST v15](https://github.com/fabianpetermark-commits/Grapes/releases/tag/android-test-v15). This integration branch starts from the **exact published v15 source** `e968dc16dfb14fc4e1c7d9efba24b63795412746`, and retains v15's four-card menu, Food search, OFF/USDA, separate QA identity, TEST Drive, new native integrations, and production E-book fixes.

**Do not publish an APK, merge to a shipping branch, or change PROD.** The user approved automatic TEST publication **after all mandatory safety and CI gates pass**, *not* release of unfinished or non-durable changes. The complete Health data-integrity audit remains NO-GO.

## Source trace / single package

The original Health audit is #58. This combined branch consolidates these prior *unmerged draft* PRs as one TEST review rather than publishing them individually:

| Audit PR | Expected final behavior | Integration status |
| --- | --- | --- |
| #59 | Fix Android startup collection selector | Already shipped in v15 |
| #60 | Profile-scoped Water, preserve old `grapes-water-v1` and manual claiming | **Water store implementation + synthetic tests staged; existing v15 UI still uses legacy key; requires explicit UI adapter** |
| #61 | Water JSON export/import, safe profile-bound restore, corrupt data recovery | **Not yet wired; v15 already has a legacy backup UI with a different schema. Require backward-compatible v1/v2 support** |
| #62 | Missing Food nutrients are unknown in diary, statistics and 4/4/9 calculations | Food model/stats utilities and unit tests staged; **Food UI still needs review** |
| #63 | Overlapping ID-less YAZIO exports deduplicate without losing old keys | Import implementation and unit tests staged; verify with real CSV/JSON and repeat imports |
| #64 | Adapt Water regression fixture to profile-scoped stores | Tests staged with Water store; old shell fixture must be reviewed |
| #65 | Single-pass all-time statistics for large Food history | Stats library staged; **mobile chart/controller code still needs forward-port** |
| #66 | In-flight Drive save keeps original Food profile | **Pending v15 Food controller 3-way integration; no silent account switch** |
| #67 | OFF 403/429 do not fallback around access restrictions | Code + new regression staged |
| #70 | Immediate durable Food saves with recovery journal and truthful pending state | Queue utility + tests staged; **not hooked to v15 Food UI/IndexedDB yet** |
| #71 | Keep both sides of Drive conflict, track versions/write IDs and private recovery copy | Guard utility + tests staged; **v15 existing `grapes-drive.js` API and TEST folder must not be replaced** |
| #72 | Journal ancestry prevents stale/timestamp-collision restore | Queue utility staged; **needs controller and real IndexedDB verification** |
| #73 | Two independent web contexts cannot overwrite each other's newer Food data | **Requires v15 `local-project-store.js` CAS and real multi-tab Playwright verification; not active yet** |
| #76–#78 | Supabase schema/CAS/RLS proof of concept | Research only, **NOT part of v16 APK**; no hosted integration or database migration |
| #85 | Browser/YAZIO follow-up regression corrections | Reassess tests against v15; no feature needs copying |

### Important upstream divergence

v15 was based on production Android v28, whereas the Health audit PR stack descends from a pre-v28 TEST branch. The source trees diverge significantly; wholesale replacing `src/android-mobile-shell.js`, `src/food/food-mobile.js`, `src/storage/grapes-drive.js`, `src/storage/local-project-store.js` or `design/android-mobile-preview.html` would regress previously shipped Home, E-book, authenticated Drive, Food/UI and Android package behaviors. **Do not blindly use the old #73 branch as the APK base.**

These files must be manually forward-ported and verified via a final line-by-line diff and dedicated regression tests. New water/profile backup data formats must preserve and explicitly recover historical `grapes-water-v1` records; no automatic ownership guess.

## Mandatory release gates

1. v15 on-device smoke test by the owner: verify signed v15, search/region, barcode, statistics, Food/recipes, YAZIO, Water, Home, E-book and **existing data present**.
2. Complete combined source (no dormant-only protections): profile-scoped Water + backup, YAZIO safety, incomplete nutrient math, high-volume stats, strict local IndexedDB write ordering/CAS, and Drive sync conflict handling integrated in the real v15 controller.
3. Tests demonstrating actual fail-before/pass-after for same-account cross-tab IndexedDB conflicts, two-device Drive late upload/profile switch and offline/force-kill; both local and remote versions remain exportable if a conflict is detected.
4. Validate large YAZIO import/repeated import/undo; separate local and remote backups and corrupted Water restore. Check both separate Google Drive accounts and two devices on the **same** account; distinct accounts normally have independent data.
5. All existing Node, browser, E-book, Finance, Home, Android bridge/web/native QA, 320/360/390/412 px tests green on the **exact** shipping commit; no new ignored failures.
6. Android signer SHA-256 **cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33**, package `hu.grapes.healthconnect.test`, strictly higher versionCode than 15, only `VITE_GRAPES_TEST_CHANNEL=1` data roots, and device in-place update after verified backup.
7. If any unresolved issue presents credible undetected data loss/corruption, **NO-GO regardless of green synthetic CI**. A separate guarded TEST rollout may be considered only once the risk is resolved. This is the user-approved auto-publication policy, not a requirement to release unsafe code.

This document and branch are a **work-in-progress integration candidate**, NOT evidence that all remaining changes are already in the signed TEST application. No release workflow, Android signing or publish trigger belongs on this review branch.
