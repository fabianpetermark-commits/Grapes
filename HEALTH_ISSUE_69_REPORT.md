# Health #69 — Food Drive conflict policy

Status: draft; Health release **NO-GO**. Tests use only synthetic Food records.

## Threat model and reproduction

The conflict is two clients editing the **same Google account's same Food Drive file**, or an explicitly shared editable file. Independent Google accounts and independent files do not compete. Before this change, a client with only its own `changeRevision` could PATCH an outdated JSON snapshot over a newer remote snapshot. In the two-client harness, A edits offline, B saves online, then A uploads: the old code would accept A's last write and remove B's newer meal from the head file. The same risk covers targets, recipes, Health IDs and YAZIO batches.

## Drive v3 contract checked

- [files.update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update) documents media `PATCH` and its request parameters; it does **not document an atomic If-Match/revision precondition** for this endpoint.
- [File resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) exposes read-only `version`, `headRevisionId` for blob files and `md5Checksum`. These identify observed state; they do not make a later PATCH conditional.
- [Changes and revisions overview](https://developers.google.com/workspace/drive/api/guides/change-overview) describes revision history and purgeable blob revisions. Ordinary revision history is not treated as a guaranteed long-term backup.

Therefore metadata read-before-write is **best effort**, with a TOCTOU window. We do not claim atomic compare-and-swap. Before any PATCH, the client creates a separate, unshared-root recovery copy of its full local snapshot. A changed version or writer ID blocks the PATCH. After PATCH, the client reads the head and checks its unique writer ID before clearing `localDirty`. A simultaneous writer may still overwrite the head after this check; each new client has its own immutable copy, and later version divergence blocks silent replacement. An old client that does not create such a copy remains a residual risk.

## Behavior and evidence

| Reproduction / risk | Policy | Automated evidence | Android 16 / two-device UAT | Residual limit |
| --- | --- | --- | --- | --- |
| A offline, B online, A reconnects | Version mismatch: no PATCH; A local and private Drive recovery remain; B head remains | `food-drive-guard.test.js` two independent clients | NOT TESTED | Legacy client may still PATCH |
| Simultaneous writers, delayed response | Both create full copies before PATCH; head writer ID is checked | Same test: reverse order and delayed reply | NOT TESTED | No atomic server CAS; a later PATCH may win after an earlier verification |
| 403/429/503, offline | Failed recovery copy or request aborts PATCH; local stays dirty | Same test, three statuses | NOT TESTED | Local journal/IndexedDB quota from #68 applies |
| Edit/delete/new meal/recipe/targets/import IDs | Full snapshot copy, no uncertain automatic merge | Unit fixtures plus existing Food/YAZIO/Health regressions | NOT TESTED | User must compare divergent data |
| New file race / restart | Multiple primary files are reported as conflict, never pick first | Same test: concurrent creation | NOT TESTED | Duplicate files remain until manual cleanup |
| Account A versus B / recipe shares | Exact Food filename, module and profile validation; recovery stored outside possibly shared module folder | Unit isolation plus existing sharing tests | NOT TESTED | Drive ACLs and shared-file permissions need live verification |
| UI recovery | Export local and remote JSON; accepting remote first saves old local as a distinct IndexedDB record | `android-food-drive-conflict.browser.mjs` | NOT TESTED | More than one remote primary requires manual file selection outside app |

## Compatibility and rollout

Existing Food schema, YAZIO/Health IDs, recipes, Water store and JSON backup format remain unchanged. Local Food records gain optional `driveVersion` and `driveWriteId`; old records with no baseline are compared to a clean remote copy on load and cannot blindly overwrite it. Recovery copies use the same JSON project wrapper under unique names in the account's My Drive root, avoiding inherited permissions of a shared Grapes folder. They are never automatically selected as Food primaries. `listGrapesProjects()` can filter exact primary filenames and page through those results. No global backend or cross-account sync was introduced.

## Remaining release work

Run true two-device same-account and separate-account Android 16 / Galaxy S22 Ultra UAT; verify Drive permissions and recovery files through the live API; test a legacy client racing a new client; review storage quotas and recovery-copy retention. The application must not claim guaranteed multi-device sync. Keep Health **NO-GO** and do not merge, publish an APK, or release until independent verification and user authorization. The isolated QA compile/package is an automated test, not publication.
