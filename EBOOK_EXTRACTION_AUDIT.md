# E-book extraction audit

**Date:** 2026-11-21  
**Source repository:** `fabianpetermark-commits/Grapes`  
**Source branch:** `main`  
**Source commit:** `bdddf33a4a585ca4c82343157cc3238e063c94b2`  
**Audit branch:** `audit/ebook-extraction-20261121`  
**Status:** Read-only architectural audit; no application source was changed.

## Executive summary

The E-book capability is a substantial product candidate, but it is not currently an independently deployable application. Its core library/editor logic is concentrated in `src/ebook-library.js` (about 133 KB), with supporting EPUB and PDF modules, reader sync, styles, tests, an HTML shell, and an Apps Script transfer broker.

The safest extraction is a staged **standalone-first, Grapes-compatible** split:

1. Preserve the original repository and its `main` branch.
2. Extract the E-book-specific source, assets, tests, broker and deployment material with path history.
3. Replace direct dependencies on Grapes-wide services with small adapter contracts.
4. Keep Grapes integration as an optional adapter/package, not a runtime prerequisite.
5. Establish an independent build/test/deploy pipeline before changing or removing the old module.

Do not delete the existing E-book implementation from Grapes until the extracted application passes the same functional and regression checks and its live Google/reader workflows have been accepted.

## Inventory found on `main`

### Product code and assets

- `src/ebook-library.js` — main library, organizer/editor, Drive operations, metadata and transfer UI orchestration.
- `src/ebook-reader-sync.js` — USB/local-directory reader synchronization.
- `src/ebook/epub-content.js` — EPUB content editing.
- `src/ebook/epub-metadata.js` — EPUB metadata rewriting.
- `src/ebook/epub-validation.js` — EPUB validation and message summaries.
- `src/ebook/epubcheck.worker.js` — EPUBCheck worker integration.
- `src/ebook/pdf-metadata.js` — PDF metadata rewriting.
- `src/styles/screens/ebook-library.css`
- `src/styles/screens/ebook-reader-sync.css`
- `public/ebook-reader.html` — dedicated reader/receiver page.
- `apps-script/ebook-transfer/Code.gs`, `README.md`, `appsscript.json` — transfer/pairing broker.
- `.github/workflows/deploy-ebook-apps-script.yml` — separate Apps Script deployment workflow.
- `EBOOK_DEBUG_REPORT.md` and `conception/GRAPES_EBOOK.md` — operational findings and future product concept.

### Tests

- `tests/ebook-library.test.js`
- `tests/ebook-reader-sync.test.js`
- `tests/ebook-content.browser.mjs`
- `tests/ebook-editor-layout.browser.mjs`
- `tests/epub-content.test.js`
- `tests/epub-metadata.test.js`
- `tests/epub-validation.test.js`
- `tests/epub-validation.browser.mjs`
- `tests/epubcheck.integration.mjs`
- `tests/pdf-metadata.test.js`

The root package currently exposes `npm run test:ebook`, `npm run test:epubcheck`, `npm run test:epubcheck:browser`, `npm run test:ebook:layout`, and the general test/build scripts. These commands are currently rooted in the Grapes package and need to be re-homed in the extracted app.

## Dependency and coupling map

### Direct code dependencies

- `src/ebook-library.js` imports `qrcode`, E-book CSS, `src/storage/grapes-drive.js`, E-book validation, and the shared `src/ui/modal.js`.
- `src/ebook-reader-sync.js` imports `grapesDriveRequest` and `isGrapesDriveConnected` from the shared Drive service.
- `src/ebook/epub-content.js` and `src/ebook/epub-metadata.js` import `jszip` and `@xmldom/xmldom`.
- `src/ebook/pdf-metadata.js` imports `pdf-lib`.
- `src/ebook/epubcheck.worker.js` imports `epubcheck-standalone` and its worker assets.
- `src/ui/modal.js` itself depends on shared DOM and overlay utilities. Reusing it as-is would pull Grapes UI infrastructure into the new app.

### Application-shell dependencies

- `src/screens.js` registers E-book as a lazy-loaded Grapes screen and calls `initEbookLibrary()`.
- `index.html` contains the E-book UI markup and its element IDs.
- `src/i18n.js` contains E-book module labels and descriptions.
- `src/styles/index.css` and global styles include the E-book styles.
- The current module uses the Grapes application navigation, global DOM, and shared modal conventions.

These are not merely library dependencies: the present implementation is a screen inside the Grapes SPA. Extraction needs a dedicated E-book app shell and an explicit integration boundary.

### External service and deployment coupling

- The browser module uses Google Drive OAuth/Picker configuration and the shared Grapes Drive session/service.
- `apps-script/ebook-transfer/Code.gs` has canonical Grapes return/reader URLs and allowed-origin checks. These must become configurable, allowlisted deployment settings before the broker can safely serve both standalone and embedded use.
- `public/ebook-reader.html` and the frontend currently assume the Grapes Pages deployment path.
- Apps Script deployment is separate from Pages deployment. A successful frontend build does not publish the broker.
- `apps-script/ebook-transfer/README.md` documents the `CLASPRC_JSON` Actions secret. Never copy credentials or secret values into the new repository.
- Google Cloud OAuth client, Picker key, API enablement, authorized origins, and broker deployment ownership require explicit environment configuration. Do not copy production secrets into source control.

## Proposed target architecture

```
grapes-ebook/
  apps/
    web/                 # standalone E-book web app and shell
    reader/              # optional dedicated reader experience (if kept separate)
  packages/
    ebook-core/          # EPUB/PDF metadata, content, validation, domain logic
    storage-contracts/   # provider-neutral file/library contracts
    adapters/
      google-drive/      # optional Google Drive provider
      local-files/       # browser/local file provider
      grapes-bridge/     # optional Grapes integration adapter
  services/
    transfer-broker/     # Apps Script broker or later replaceable service
  tests/
  docs/
```

This is a target proposal, not a claim that the existing code already has these package boundaries. Keep the first extraction conservative: move the working app intact, then introduce adapters in small tested steps. Avoid a simultaneous rewrite.

### Required adapter contracts

At minimum, define interfaces for:

- `LibraryProvider`: list, import/copy, read, write/update metadata, delete, and account/state notifications.
- `AuthProvider`: connect, disconnect, current account, token-backed request; do not expose raw tokens to UI code.
- `DialogProvider`: confirm/alert/prompt without importing Grapes modal internals.
- `TransferProvider`: create transfer/pairing request, resolve status, and expose configured reader URL.
- `ReaderSyncProvider`: connect directory, inspect inventory, synchronize with explicit conflict/deletion policy.

The standalone default should work without a Grapes account or Grapes origin. Google Drive and Grapes integration should be selectable adapters.

## Product-scope distinction

The current implementation includes a Drive-backed book library, metadata/EPUB editing and validation, transfer/pairing, a reader receiver page, and USB reader synchronization.

The document `conception/GRAPES_EBOOK.md` separately describes a **future PDF-to-reflowable-EPUB conversion workflow**, including OCR for scanned and mixed PDFs. It explicitly labels that as a concept/future direction, not a current implementation promise. Do not describe PDF-to-EPUB/OCR conversion as an existing capability during extraction.

## History-preserving extraction strategy

The preferred history-preserving method is a filtered Git history export, not copying files through the GitHub contents API:

1. Clone the original repository with full history.
2. Create a dedicated extraction worktree/branch from the chosen source commit.
3. Use `git filter-repo` (or an equivalently verified history filter) with an explicit path allowlist for the E-book code, tests, assets, broker, workflows and docs.
4. Rename/re-root paths only after filtering, retaining commit metadata and original commit ancestry for commits touching those paths.
5. Verify the filtered repository's commit graph and compare representative historical file versions against the source.
6. Push to a newly created empty repository only after the owner/name and visibility are confirmed.
7. Keep the original Grapes repo unchanged during the pilot.

GitHub's ordinary file/contents API cannot perform a faithful path-filtered history migration. The audit branch itself is not a substitute for the eventual filtered clone/push operation.

Potential history nuance: a path-filtered history preserves commits that affect selected paths, but unrelated commits disappear and merge topology can be simplified by the filtering tool. Record the source repository URL, source commit SHA, filter command and resulting commit count in the new repository's migration notes.

## Risks and controls

| Risk | Control |
|---|---|
| Regressions in the existing Grapes E-book | Keep old module intact until extracted app passes parity and acceptance tests. |
| Drive service assumes Grapes-wide account/session state | Introduce provider interfaces and a standalone Google adapter; do not duplicate token handling ad hoc. |
| Hard-coded Pages and broker URLs | Move origins/return URLs to validated deployment configuration with strict allowlists. |
| Accidental credential leakage | Use new repository secrets; never copy secret values or `.clasprc` files. |
| USB sync destructive behavior | Test rename, conflict, deletion, stale timestamp and permission-loss scenarios before release. |
| EPUB worker/asset path breaks after re-rooting | Add production-build and browser-worker smoke tests from the new app root. |
| Missing files or test coverage in extraction | Use the inventory above as an explicit allowlist and compare the extracted tree before first release. |
| Future OCR scope mistaken for shipped functionality | Keep conversion concept in roadmap until separately implemented and validated. |

## Verification gates

### Gate 0 — source baseline

- Record exact source commit and current branch status.
- Run `npm ci`, `npm run test:ebook`, the relevant EPUB/reader browser tests, and `npm run build` in a reproducible environment.
- Record failures separately from extraction regressions. This audit did not execute these commands.

### Gate 1 — extraction completeness

- All inventory files are present in the filtered repository.
- Historical versions of representative files are accessible.
- No secrets, unrelated modules, or Grapes-wide deployment assumptions are accidentally included.

### Gate 2 — standalone operation

- App starts and builds without the Grapes SPA.
- Local-file/library mode works without Google Drive.
- Google Drive adapter can be connected independently and can be disconnected without corrupting local state.
- EPUB metadata/content editing, validation, PDF metadata, QR/transfer and USB sync are covered.

### Gate 3 — integration and live acceptance

- Optional Grapes bridge can be enabled/disabled without changing the core library.
- Existing Grapes module remains functional.
- Live Google OAuth/Picker and Apps Script deployment are verified with test accounts.
- At least one physical e-reader transfer/sync is validated.
- Only after sign-off should a separate PR remove or redirect the legacy Grapes screen.

## Immediate next actions

1. Confirm the audit inventory against the complete tree and dependency references.
2. Establish and record the baseline test results from a clean checkout.
3. Prepare the filtered-history migration in a local temporary clone; do not create/push the new repository yet.
4. Draft the provider contracts and a small integration spike on the audit branch.
5. Review the migration diff and test evidence before any production-facing change.

**Current state:** only this audit document is added on the audit branch. No source code, secrets, production configuration, deployment, or original `main` branch was changed.
