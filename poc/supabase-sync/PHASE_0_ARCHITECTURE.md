# Phase 0: Health sync design and isolated proof of concept

Status: proposal and synthetic reference model only. Health release and internal TEST APK remain **NO-GO**. No live Supabase project, application sync path, PROD, TEST integration, Home M2, or E-book module was changed. This branch is intended as a draft review artifact.

## Reviewed baseline and data map

The local `main` checkout is older than the Health draft stack. Current Health behavior was reviewed at draft PR [#73](https://github.com/fabianpetermark-commits/Grapes/pull/73), head `f05245c`, and its stacked #60–#72 predecessors using their source and reports. The prototype does not import Health code, so it can be reviewed independently without rebasing or merging that stack.

| Area | Current source of truth and identifiers | Dependency / migration rule |
| --- | --- | --- |
| Food | `grapes-projects` IndexedDB `projects`, primary ID `food-tracker-${profileId}`. Food project v2 embeds `profile.id`, targets, `customFoods`, recipes, `diaryEntries`, favorites, batches, library references and `syncState`. Food backup v1 wraps the normalized project. | Preserve every embedded ID and `origin`/`externalKey` exactly. Stage the full legacy JSON first; later decomposition requires reference validation. Existing backup v1 remains readable and exportable. |
| Local Food safety | #70 queue and `grapes-food-pending-v1:${profileId}` journal; #72 adds token ancestry; #73 compares `saveToken` in one IndexedDB readwrite transaction and saves stale candidates as `food-conflict-*`. | Supabase outbox is a **new**, profile and user scoped store. Do not clear Food journal, recovery or dirty state on a network request alone. New sync may only consume a locally committed snapshot after this transaction completes. |
| Food Drive | #71 guard uses observed Drive `version`/writer ID and a separate recovery copy before PATCH. It remains vulnerable to a time-of-check/time-of-use race and old APK writers. | Migration is preview and copy only. Keep Drive files and recovery copies untouched. No automatic Drive-to-Supabase or reverse mirroring while legacy clients can write. |
| Water | `grapes-water-v2:${encodeURIComponent(profileId)}` localStorage, date keyed days and entry arrays; `grapes-water-v1` remains for explicit one-profile claim. Water backup v1 has `profileId` and days; restore stores old raw bytes separately. | Preserve legacy raw bytes, claims, date keys and entry IDs. Corrupt current data is a blocking error, never an empty snapshot. Water currently has no guaranteed cross-tab CAS. |
| YAZIO | Food `diaryEntries` with `externalKey`, `origin.source='yazio'`, `sourceRecordId`, source payload, batch ID and schema version; import batches support undo. #63 recognizes old ID-less fingerprint keys. | Keep both historical and new keys; scope uniqueness to owner/profile/source. Never synthesize new IDs during migration or collapse equal-looking rows. |
| Health | Imported Food entries use `externalKey` such as `healthconnect:...` / `samsunghealth:...`; Health bridge export schema v1 and source package remain in `origin`. | Preserve external IDs, timestamps and nullable nutrients. An imported hydration entry does not become a Water record without explicit mapping and preview. |
| Shared recipes | Food project library references and Drive permissions are separate from a user's private diary. | Phase 0 does not migrate sharing ACLs or grant cross-user access. Treat shared references as unresolved until an explicit sharing design exists. |
| E-book | `ebook-library.js`, `ebook-reader-sync.js` and shared `grapes-drive.js` use Google Drive file discovery, `drive.file`, optional `drive.readonly`, imports, metadata and reader transfer. | **Permanent Drive ownership.** No E-book files, libraries, reader state, transfer, or mandatory data migration to Supabase. Do not remove shared Drive infrastructure. |

## Proposed server model

`schema-proposal.sql` is review-only SQL. A private `profiles` table binds a Supabase Auth user UUID to one verified legacy profile ID. `documents` has the composite key `(user_id, profile_id, kind, record_id)`, `schema_version`, monotone `revision` and JSONB payload. `revisions` retains every committed payload. `attempts` retains every candidate, including rejected conflicts, keyed by `(user_id, operation_id)`. Text legacy IDs are stored unchanged; source namespace is part of `kind` and payload. No E-book kind is permitted.

The exposed `api.compare_and_swap` RPC derives the owner from `auth.uid()`, checks profile ownership, serializes first inserts and existing updates with a transaction advisory lock, compares the supplied revision, and commits head + immutable revision + attempt in one transaction. A stale request commits a conflict attempt and returns `conflict` with an owner-scoped snapshot ID. An identical retry of the same operation returns its original result; reuse with different content errors. The function's result is returned only after PostgreSQL transaction commit. A rollback is another CAS write using an old revision's payload and the **current** revision, preserving intervening history.

The function is `SECURITY DEFINER` because clients cannot write private tables directly. It has a fixed search path, no client-supplied user ID, explicit anonymous rejection, profile check and `EXECUTE` grant only to `authenticated`. Private tables have RLS as defense in depth and no direct Data API grants. Independent review must check the function owner, grants, policies, schema exposure and `search_path` in a dedicated test database before use. Read RPCs, retention policy, quotas and Storage authorization are deliberately deferred; this SQL is not ready to deploy.

## Auth, Storage and privacy boundary

Use Supabase Auth Google OAuth with PKCE for Health; compare the provider's stable Google subject from the verified Auth identity to the existing profile's Google identity. Email, display name, Drive permission ID and user-editable metadata are **not** authorization keys. Where old records lack a verifiable subject, require explicit user preview and account linking before upload. Do not grant a profile based on email alone. Sign-out and account switching close the Health outbox context, wait for or retain pending local writes under the old owner, clear in-memory server cache and require a fresh Auth identity before access. Short JWT lifetime and session checks are required for sensitive operations; never place a service key in the client.

Health may later use a private Supabase Storage bucket for large assets or preserved source archives. Keys must start with the authenticated user UUID and verified profile ID, with nonpublic bucket policies covering reads, inserts, updates and deletes and immutable object naming for archives. Store object references in a CAS document; orphan uploads from failed CAS are quarantined and later reconciled. No object is deleted merely because a head changes. Storage is **not** used by this POC. E-book remains on Drive with its current scopes, Picker, discovery and reader workflow. Supabase Auth and Google Drive OAuth have separate clients, token storage and sign-out controls. Revoking one never silently revokes the other; the same signed-in Google email does not imply linked authorization.

## Offline and failure protocol

1. Complete the existing Food IndexedDB transaction and journal handling before enqueueing sync. A separate IndexedDB outbox stores operation UUID, owner UUID, profile, record key, expected server revision, schema version and exact candidate bytes in one transaction with the local sync checkpoint. If that transaction aborts, show a local save failure; do not claim sync queued.
2. On reconnect, replay the same operation ID and bytes. Mark `synced` only after an explicit `committed` response or an identical replay result. Network timeout, 5xx, app kill, browser eviction and lost replies remain `pending/unknown`; they are never treated as success.
3. On `conflict`, keep the local candidate and server conflict snapshot, stop automatic replay of that record, fetch authorized head/history, and show a two-sided preview. Resolution creates a new CAS operation against the current revision. No last-write-wins, timestamp ordering or silent field merge.
4. Changes to local account, profile or schema version pause that outbox. A newer unsupported schema blocks older writers. Storage quota failure and journal ambiguity surface errors and export options; a failed local write never proceeds to remote upload.

The reference model and tests demonstrate this protocol with synthetic users and an explicit memory outbox. They do **not** validate PostgreSQL execution, Supabase RLS, Android lifecycle behavior or actual IndexedDB durability. Those are required gates.

## Preview-only Drive migration

1. Authenticate to both services independently; verify stable Google subject against the Auth identity and selected profile. Inventory the exact Food primary, Water local store, imports and recovery copies. E-book files are excluded by module and never inventoried for transfer.
2. Export original Food/Water backups and manifest Drive file IDs, versions, hashes and local raw keys. Do not delete, rename, move or rewrite the originals. Surface corrupt, duplicate, shared or ambiguous source files for manual handling.
3. Normalize a **copy**, validate schema and all IDs/references, compare existing Supabase heads, and present per-profile counts, checksums, unsupported versions and conflicts. User approves the specific preview before an authorized future import.
4. Initial import uses `expected_revision=0` CAS per record with deterministic operation IDs from source identity + immutable file version + record ID. Repeated runs are idempotent. A changed source version invalidates the preview and requires a new review. Keep an archive manifest and full source snapshot for recovery.
5. Run read-only parity checks and export both formats. Only after device testing and a legacy-client plan should Health switch its active provider. Preserve Drive backup export and a rollback path; never automatically replace a newer Supabase head with an old Drive snapshot.

Legacy APKs still write Drive and cannot be made to respect server CAS. During coexistence, the two providers can diverge. Detect this with a versioned Drive inventory and warn users; avoid automatic bidirectional sync or claiming convergence. A migration cannot be called complete while unguarded legacy clients remain active. E-book Drive continues indefinitely.

## Rollout gates

| Gate | Required evidence |
| --- | --- |
| 0 — this draft | Review schema, identity mapping, E-book boundary and synthetic reference tests. No service integration. |
| 1 — isolated TEST, separately authorized | Apply revised SQL to a dedicated synthetic Supabase TEST project. Run concurrent PostgreSQL CAS tests, SQL RLS tests as two real Auth principals, JWT/anonymous tests, grants/advisors and storage policy tests. Verify transaction interruption and restart. |
| 2 — shadow migration preview | Preview synthetic Drive/IndexedDB fixtures and account switches; prove source untouched, byte/ID parity, damaged-store blocking and repeatability. E-book Drive browser tests must remain green. |
| 3 — guarded Health pilot | Explicit opt-in, Health-only provider flag, offline/device and legacy-APK coexistence tests, recovery drills, operational alerts and rollback rehearsal. No E-book transfer. |
| 4 — release decision | Independent security/data audit and user authorization. Health remains **NO-GO** until all gates pass. |

Supabase guidance checked via current documentation search for [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). The required changelog fetch was unavailable in this environment, so feature compatibility needs rechecking before TEST execution. No Supabase CLI migration was generated because no local/test database was available; this is a proposal, not a recorded migration.
