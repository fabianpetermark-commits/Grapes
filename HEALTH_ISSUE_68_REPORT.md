# Health #68 — interrupted Food local saves

Status: draft fix; release remains **NO-GO**. Only synthetic Food records were used.

## Reproduction and cause

At PR #67 head, `scheduleSave()` waits 180 ms before starting `persistLocal()`. A Back, WebView reload, process kill, or profile switch in that interval can leave an edit only in memory. `load()` suppressed a failed pre-switch write and then replaced the active project. A delayed prior write could finish after a newer write. Existing toasts claimed a recipe, meal, or target was saved before IndexedDB transaction completion.

## Change

`food-save-queue.js` snapshots and starts each profile write immediately, serializes writes for that profile, and writes a profile-scoped synchronous recovery journal when localStorage has capacity. A write is marked **Helyben mentve** only after `saveLocalProject()` resolves on IndexedDB `tx.oncomplete`. Abort/quota errors keep the previous committed record and the journal, and display **Helyi mentés sikertelen**. A restart loads a valid pending snapshot; mismatched/corrupt journal data blocks silent overwrite. Profile switching awaits the previous write and hides the old profile's view during the switch. Drive upload waits for the local queue. `visibilitychange` and `pagehide` start best-effort local flushes.

## Evidence matrix

| Scenario | Automated evidence | Device UAT |
| --- | --- | --- |
| Fast double edit / reverse completion | `food-save-queue.test.js`: serialized writes, newest snapshot retained | NOT TESTED |
| Quota / aborted transaction | `food-save-queue.test.js`, `local-project-store-transaction.test.js`: failed status; old durable record intact | NOT TESTED |
| Back and WebView reload | `android-module-hubs.browser.mjs`: synthetic target edit, immediate Back, IndexedDB read, reload | NOT TESTED |
| Restart and offline recovery | `food-save-queue.test.js`: profile-scoped journal restoration | NOT TESTED |
| Profile change | queue test checks separate IDs; controller refuses switch after failed prior write and masks previous view | NOT TESTED |
| Remote failure / dirty state | existing Drive profile regression plus local queue gate; #69 adds two-client conflict tests | NOT TESTED |
| Food JSON backup / restore | existing backup tests and unchanged schema; restored snapshot enters the same queue | NOT TESTED |
| Force-close during write | a committed prior IndexedDB snapshot remains; recovery journal is read if successfully written | NOT TESTED |

## Android 16 / Galaxy S22 Ultra manual steps

Use a synthetic profile. Add a meal, edit a recipe and target, then immediately press Back, background the Activity, swipe-kill, and relaunch. Repeat with two rapid edits, offline mode, account switch, storage-full simulation, JSON backup/restore, and a force-close during a visible pending state. Verify the last durable or journaled revision, exact entry counts, profile isolation, and status wording after each restart. Capture timing from edit to `Helyben mentve`; do not call a run PASS without a real device.

## Remaining risk

Sudden kill before both the synchronous journal and IndexedDB transaction complete cannot be guaranteed recoverable. A large project may exceed localStorage quota; the UI reports that the recovery copy failed while the IndexedDB write proceeds. The journal stores Food data in same-origin app storage and must be included in privacy review. Two independently running tabs do not share the JavaScript queue; true cross-context atomicity and Drive conflicts are addressed only partly by #69. Android native compile/package and physical-device UAT remain pending. Do not merge or release on this evidence alone.
