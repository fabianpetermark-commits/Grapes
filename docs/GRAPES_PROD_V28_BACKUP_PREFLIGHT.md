# Grapes PROD v28 → Auth rollout: data-preservation preflight

**Status: MANUAL VERIFICATION REQUIRED / NO-GO.** Prepared against the signed stable Android `android-v28` and the separate, unreleased PROD Auth draft PR #111 (2026-10-22). This document is not evidence that any backup has been created. It does not permit merging or publishing a signed APK.

## Grounded backup coverage in currently released Android code

| Data | Stable v28 implementation | Required proof before PROD Auth rollout |
|---|---|---|
| Food / recipes / targets / profiles | The signed v28 contains the **Biztonsági mentés exportja** Food action and a native JSON saver, BUT the mobile `openFoodMenu()` function has no call site and no visible launcher. Thus **the Food backup cannot reliably be reached from the v28 mobile UI**; do not instruct a user to find the inaccessible menu. The PROD Auth staging branch introduces a direct **Ételnapló mentése** button in Food overview wired to the unchanged `backup-export` action. It only exports the currently selected Food profile/project. `grapes-etelnaplo-YYYY-MM-DD.json` is saved through Android's Storage Access Framework. | User saves file outside the app and confirms it exists, is nonempty, and is the correct Food backup. Review which profiles/projects are included. |
| Water / imported hydration | Water page → **Víznapló mentése**, `grapes-viznaplo-YYYY-MM-DD.json`. Separate localStorage dataset (`grapes-water-v1`), **not part of Food JSON**, native file picker. | User saves independent Water JSON and checks that it is nonempty. Do not restore on the only phone just to test: restore replaces the current Water dataset after confirmation. |
| Finance / receipts | Finance tracker offers **Teljes mentés** using `financeBackupToJson` and browser `blob:` download; native MainActivity currently has **no blob download handler** and the Android native JSON backup bridge only accepts Food/Water file names. Also supports Drive project saving. | **DO NOT ASSUME** tapping Finance “Teljes mentés” in v28 Android yielded a file. If Finance used: confirm a current independent JSON backup from a real desktop/web environment, or verify the corresponding complete Google Drive project. Never treat a toast or a CSV without receipts as a full backup. A separate reviewed native Finance exporter is needed if Android-only offline backup is required. |
| E-books / reading progress | Mobile library, files, metadata and progress use the connected Google Drive; a local progress cache also exists. | Confirm correct Drive account and actual book files/progress on Drive independently, plus any irreplaceable original EPUB/PDF files. Auth sign-in and Drive connectivity are **different accounts**. |
| Other modules / local projects | local IndexedDB project store and, where enabled, Drive. | Inventory actually used modules and confirm separate restorable copies. No catch-all app backup currently covers everything. |

## User-safe steps for the currently installed v28

1. Do not uninstall Grapes, use Android Settings → Clear data/storage, switch Google Drive accounts, restore backups, or force a migration. Keep v28 and its app data.
2. **Current v28 Food UI is missing the menu trigger; do not send the owner looking for it.** Export Food after the separately approved, safely signed backup-UI candidate (Auth still OFF) exposes **Ételnapló mentése** on Food overview. Save the JSON outside app-specific storage and verify a nonempty file. Export each used Food profile/project separately; do not assume current-profile export includes the full household. Until that candidate is safely available, this remains OPEN.
3. Export **Water** separately from the Water diary → **Víznapló mentése**. Confirm the second JSON exists and is nonempty. Food backup never contains this Water dataset.
4. If Finance has any records, verify **Drive → Grapes → Projects → Pénzügyi Napló** includes the current complete project, or obtain a verified **full Finance JSON** from a desktop/browser running the same data. A mobile blob-download confirmation is insufficient; a CSV export loses receipt attachments and is not equivalent.
5. If E-books are used, verify Drive library and reading progress under the intended Google account; preserve irreplaceable original book files. Back up other actively used local modules separately.
6. Keep these potentially sensitive files off GitHub, PR comments, chat attachments and public sharing. No OAuth client secrets/service-role keys belong in backups or build artifacts.
7. Mark each category as confirmed **only after checking actual files/data and a viable restore route**. Mark uncertain coverage as **OPEN**, not green. Recovery verification should occur on a safe independent environment and must never overwrite v28's only copy.

## Release gates after backup

- PROD Google provider and exact Android redirect smoke-tested in staging; this is not proof of completed phone sign-in.
- Test a separately staged signed candidate with the **existing production applicationId and existing signing certificate** as a non-destructive in-place upgrade only **after** verified backups and explicit user approval. Do not uninstall v28.
- First login: verify Supabase authenticated UID, explicit owner pairing, acknowledgement, device credential, same-account relaunch and Google Drive independence. Rejected/cancelled enrollment must not expose old local data; a different UID must fail closed. Do not claim per-profile multitenancy.
- Recheck Food diary/recipes/profiles, Water historical entries, Finance, E-books/reading progress, offline startup and signed rollback strategy after test.
- Keep `VITE_GRAPES_PROD_AUTH_ENABLED` and data isolation approval gates OFF in stable release. PR #111 remains Draft / NO-GO until the real-device evidence and explicit release approval.

## Verification record (fill only with real observations)

- Food JSON file exists and coverage inspected: **NOT VERIFIED**
- Water JSON file exists and coverage inspected: **NOT VERIFIED**
- Finance complete backup if in use: **NOT VERIFIED / applicability unknown**
- E-books and other modules if in use: **NOT VERIFIED / applicability unknown**
- Backup restore route and non-destructive rollback examined: **NOT VERIFIED**
- Signed in-place candidate tested on phone: **NOT VERIFIED**
- Final release authorization: **NOT GIVEN**
