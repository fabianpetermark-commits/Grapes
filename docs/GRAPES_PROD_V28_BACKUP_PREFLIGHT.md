# Grapes PROD v28 → Auth rollout: data-preservation preflight

**Status: CONDITIONAL — no backup required for empty Grapes.** The owner confirmed on 2026-10-23 that the currently installed Grapes app is empty, with nothing to preserve. This is the owner's account, not a remote inventory of phone storage. No data exports should be required from this user. If meaningful data is later discovered, stop and preserve it before a risky upgrade. The Auth release still requires phone validation.

## Grounded backup coverage in currently released Android code

| Data | Stable v28 implementation | Required proof before PROD Auth rollout |
|---|---|---|
| Food / recipes / targets / profiles | The signed v28 contains the **Biztonsági mentés exportja** Food action and a native JSON saver, BUT the mobile `openFoodMenu()` function has no call site and no visible launcher. Thus **the Food backup cannot reliably be reached from the v28 mobile UI**; do not instruct a user to find the inaccessible menu. The PROD Auth staging branch introduces a direct **Ételnapló mentése** button in Food overview wired to the unchanged `backup-export` action. It only exports the currently selected Food profile/project. `grapes-etelnaplo-YYYY-MM-DD.json` is saved through Android's Storage Access Framework. | User saves file outside the app and confirms it exists, is nonempty, and is the correct Food backup. Review which profiles/projects are included. |
| Water / imported hydration | Water page → **Víznapló mentése**, `grapes-viznaplo-YYYY-MM-DD.json`. Separate localStorage dataset (`grapes-water-v1`), **not part of Food JSON**, native file picker. | User saves independent Water JSON and checks that it is nonempty. Do not restore on the only phone just to test: restore replaces the current Water dataset after confirmation. |
| Finance / receipts | Finance tracker offers **Teljes mentés** using `financeBackupToJson` and browser `blob:` download; native MainActivity currently has **no blob download handler** and the Android native JSON backup bridge only accepts Food/Water file names. Also supports Drive project saving. | **DO NOT ASSUME** tapping Finance “Teljes mentés” in v28 Android yielded a file. If Finance used: confirm a current independent JSON backup from a real desktop/web environment, or verify the corresponding complete Google Drive project. Never treat a toast or a CSV without receipts as a full backup. A separate reviewed native Finance exporter is needed if Android-only offline backup is required. |
| E-books / reading progress | Mobile library, files, metadata and progress use the connected Google Drive; a local progress cache also exists. | Confirm correct Drive account and actual book files/progress on Drive independently, plus any irreplaceable original EPUB/PDF files. Auth sign-in and Drive connectivity are **different accounts**. |
| Other modules / local projects | local IndexedDB project store and, where enabled, Drive. | Inventory actually used modules and confirm separate restorable copies. No catch-all app backup currently covers everything. |

## User-safe steps for the currently installed v28

1. For the owner's stated **empty app, skip all backups**. Keep Grapes installed; do not clear data/storage or switch Google Drive accounts. This is not an instruction to delete anything.
2. **Only if meaningful Food data exists:** v28 does not expose the old Food backup launcher; do not direct the owner to search for that missing button. The staged Auth PR adds a visible Food backup action, but an empty Food module requires no export.
3. **Only if meaningful Water data exists:** export Water separately via **Víznapló mentése**. An empty Water module requires no export.
4. If Finance has any records, verify **Drive → Grapes → Projects → Pénzügyi Napló** includes the current complete project, or obtain a verified **full Finance JSON** from a desktop/browser running the same data. A mobile blob-download confirmation is insufficient; a CSV export loses receipt attachments and is not equivalent.
5. If E-books are used, verify Drive library and reading progress under the intended Google account; preserve irreplaceable original book files. Back up other actively used local modules separately.
6. Keep these potentially sensitive files off GitHub, PR comments, chat attachments and public sharing. No OAuth client secrets/service-role keys belong in backups or build artifacts.
7. Mark each category as confirmed **only after checking actual files/data and a viable restore route**. Mark uncertain coverage as **OPEN**, not green. Recovery verification should occur on a safe independent environment and must never overwrite v28's only copy.

## Release gates after backup

- PROD Google provider and exact Android redirect smoke-tested in staging; this is not proof of completed phone sign-in.
- Test a separately staged signed candidate with the **existing production applicationId and signing certificate** as a non-destructive in-place upgrade only after owner-confirmed empty-app status **or**, if meaningful data exists, adequate preservation, plus explicit upgrade approval. Never uninstall v28.
- First login: verify actual Supabase UID, explicit empty-app/ownership acknowledgement, Android device credential, same-account relaunch and Google Drive independence. Reject different-account access and cancelled enrollment.
- Recheck Food diary/recipes/profiles, Water historical entries, Finance, E-books/reading progress, offline startup and signed rollback strategy after test.
- Keep `VITE_GRAPES_PROD_AUTH_ENABLED` and data isolation approval gates OFF in stable release. PR #111 remains Draft / NO-GO until the real-device evidence and explicit release approval.

## Verification record (fill only with real observations)

- Food JSON file exists and coverage inspected: **NOT APPLICABLE IF EMPTY (owner-confirmed; no backup required)
- Water JSON file exists and coverage inspected: **NOT APPLICABLE IF EMPTY (owner-confirmed; no backup required)
- Finance complete backup if in use: **NOT APPLICABLE IF EMPTY (owner-confirmed; no backup required)
- E-books and other modules if in use: **NOT APPLICABLE IF EMPTY (owner-confirmed; no backup required)
- Backup restore route and non-destructive rollback examined: **NOT APPLICABLE IF EMPTY (owner-confirmed; no backup required)
- Signed in-place candidate tested on phone: **NOT VERIFIED**
- Final release authorization: **NOT GIVEN**
