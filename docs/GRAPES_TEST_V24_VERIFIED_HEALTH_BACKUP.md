# Grapes TEST v24: verified local Health backup before account claim

Baseline: draft #120 at `347ed736e65f0d131f4cfcee1c70d9f72c424ec4`, stacked on #108 and released TEST v24 `f14127b72267db1c77c1751bded5027352837202`. This draft adds an explicit local backup to the already gated, read-only preview. The existing Food, Water, Drive, E-book and Supabase Auth paths are unchanged.

## Scope and safety

The TEST settings preview offers **Helyi mentés készítése és ellenőrzése** after it finds a local Food or Water source. It is available only with the TEST channel flag `VITE_GRAPES_TEST_MIGRATION_PREVIEW_ENABLED=true`, a QA Android build and the native TEST Auth gate. This flag remains OFF by default. The user chooses a document location with Android's Storage Access Framework (SAF). The file contains complete, potentially personal Food and Water payloads, so the UI asks for explicit confirmation. It does not automatically upload, claim, delete or change any source.

The envelope is versioned and marked `ownership: "unclaimed"`. It carries the original Food IndexedDB project envelopes and the raw Water localStorage JSON, including original YAZIO and Health Connect identifiers and timestamps. This is a recovery snapshot, not the final Supabase import format. It omits Drive enumeration, E-book and Finance. It does not assert that the signed-in Supabase user owns the legacy records.

## Verified-save sequence

1. Capture local Food and Water sources with the read-only v24 reader and verify each snapshot against its SHA-256 source version.
2. Build a bounded JSON envelope (80 MiB maximum), compute its UTF-8 byte count and SHA-256.
3. Send chunks to the existing native SAF export bridge. The new filename is accepted only by the gated QA Android host.
4. Android writes the selected document, reopens it through the content resolver, and compares byte count and SHA-256 with the staged file. Cancellation, write failure, unreadable document, truncated or altered content returns an error.
5. JavaScript compares the native receipt with its expected byte count and digest, then re-reads local sources. It shows verified success only if their versions still match the captured versions.

The SAF provider may refuse readback. In that case the app reports failure and leaves all original local data intact. A file may have been partially written; it must never be treated as a verified recovery copy. The user must protect the chosen document because it contains personal data. No persistent success marker is set yet, and this draft does not authorize a later import on its own.

## Verification

`tests/grapes-health-v24-verified-backup.test.js` covers full source retention, owner rejection, tampering, changed local versions, and missing or incorrect readback receipts. `VerifiedBackupDigestTest.kt` covers exact, truncated, altered and interrupted native reads. The settings browser regression uses synthetic local records and a fake Android bridge to test an interrupted write and a successful explicit backup, then checks that source data was unchanged and no external request was made. The stacked GitHub Actions workflow runs clean `npm ci`, full unit and browser suites, web build, E-book Drive boundary tests, and Android QA unit tests plus compile without uploading an APK. Actual CI results belong in the PR after the workflow finishes; a synthetic bridge does not prove a physical SAF provider.

## Next gate

A separate reviewed step must enumerate Drive without creating folders, confirm the account and profile claim, preserve a verified recovery copy, and resolve unmapped records. The #94/#95 Health durability issues and Supabase TEST RLS/CAS verification remain required before any real Health cloud write. No remote SQL, hosted Supabase project or real user data is touched here. Health sync remains OFF. E-book remains permanently on Google Drive.
