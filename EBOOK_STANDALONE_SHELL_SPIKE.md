# Standalone E-book shell spike

**Date:** 2026-11-21  
**Implementation branch:** `feature/ebook-standalone-shell-20261121`  
**Base:** `audit/ebook-extraction-20261121`  
**Status:** configuration boundary implemented; standalone shell and broker isolation remain pending.

## Objective

Determine whether the existing E-book screen can be mounted directly in a separate HTML entry point without pulling in the Grapes application shell, and identify the minimum safe seam for the first executable extraction slice.

## Findings

### 1. The existing library is not an isolated feature module

`src/ebook-library.js` has 2,189 lines and currently:

- imports the Grapes Drive singleton from `src/storage/grapes-drive.js`;
- imports `showGrapesConfirm` from `src/ui/modal.js`;
- imports Grapes E-book CSS;
- contains a hard-coded Grapes Pages return URL and reader URL;
- uses Grapes-specific local-storage keys and a Drive folder named `Grapes E-book Library`;
- dynamically imports `src/screens.js` when confirming exit from the editor;
- listens for the Grapes-specific `grapes:before-screen-change` event.

It also has a large DOM contract: the module queries many fixed `#ebook-*` IDs and initializes handlers against them. A new entry point must provide the complete E-book markup contract, not just a root element.

### 2. The reader sync module is separately coupled

`src/ebook-reader-sync.js` imports the same Grapes Drive singleton. It synchronizes the Drive library with a user-selected local e-reader directory using the File System Access API and IndexedDB. It is not an independent local library provider.

### 3. The reader receiver is not yet standalone

`public/ebook-reader.html` is a separate HTML document, but its pairing form and script embed the production Apps Script broker URL. It also uses Grapes-specific local-storage/cookie keys and a `/Grapes/` cookie path.

The Apps Script broker hard-codes these origins:

- `https://fabianpetermark-commits.github.io/Grapes/`
- `https://fabianpetermark-commits.github.io`
- `https://fabianpetermark-commits.github.io/Grapes/ebook-reader.html`

A standalone deployment must not reuse these as implicit defaults. The broker needs an explicit deployment configuration and an exact allowlist for the new app and reader origins.

### 4. The current screen registration is not required by the core library

`src/screens.js` lazy-loads `initEbookLibrary()` as the `ebook` screen and handles navigation. The E-book module itself imports `src/screens.js` only in the dirty-editor exit-confirmation path. That dependency should be replaced with an injected navigation callback or a standalone-safe navigation adapter before mounting it in a separate shell.

## First implementation slice completed

The first host-boundary slice is now implemented on this branch:

- Added `src/ebook/platform.js`, a small runtime contract for Drive, account state, confirmation dialogs, and navigation.
- Added `src/ebook/grapes-platform.js`, which installs the existing Grapes Drive singleton and Grapes confirmation dialog as the host adapter.
- Updated `src/ebook-library.js` to use the platform contract instead of importing the Drive singleton and modal directly.
- Updated `src/ebook-reader-sync.js` to use the same platform contract.
- Updated the Grapes screen loader to install the Grapes adapter before initializing the library.
- Added `tests/ebook-platform.test.js` for adapter validation and delegation.

The adapter contract test was run independently in the local Node.js runtime: **2 tests passed**. The repository-wide E-book tests, browser tests, and production build have not been run; the local environment could not resolve GitHub to clone the repository. GitHub Actions currently reports no workflow run for this feature branch.

## Safe first implementation boundary

Do not copy the 2,189-line library module or fork it into a second implementation. Keep one feature implementation and progressively replace singleton dependencies with small contracts:

1. **DriveProvider** — account state, access token, request, connect/disconnect and change subscription.
2. **DialogProvider** — asynchronous confirmation; Grapes adapter preserves current modal behavior, standalone adapter uses its own accessible dialog.
3. **NavigationProvider** — leave-editor / return-to-library behavior without importing the Grapes screen manager.
4. **EbookConfig** — OAuth client, Picker keys, broker URL, return URL, reader URL, Drive folder and storage-key namespace.
5. **ReaderSyncProvider** — optional e-reader directory sync; must not assume a Grapes Drive singleton.

The first runnable standalone slice should use the same E-book feature code and complete DOM contract, but boot from a separate HTML/JS entry point. Keep the existing Grapes entry point wired to the existing adapters. Do not change the production Apps Script allowlist until the standalone deployment origin is known.


## Standalone shell slice

An independent `ebook.html` entry page and `src/ebook-standalone.js` boot sequence are now present. The page reuses the complete E-book DOM contract but does not load `src/main.js`, `src/screens.js`, or the Grapes login/navigation shell. It installs `createStandaloneEbookPlatform()` before initializing the shared E-book feature. Its Google Drive token/session namespace, view state, library cache, reader-sync database, and Drive folder are separate from the Grapes defaults.

`vite.config.js` now builds both `index.html` and `ebook.html`. The standalone configuration reads these build-time variables (no secret values are committed):

- `VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID`
- `VITE_EBOOK_STANDALONE_PICKER_API_KEY`
- `VITE_EBOOK_STANDALONE_GOOGLE_APP_ID`
- `VITE_EBOOK_STANDALONE_BOOKS_API_KEY`
- `VITE_EBOOK_STANDALONE_TRANSFER_BROKER_URL`
- `VITE_EBOOK_STANDALONE_RETURN_URL` and `VITE_EBOOK_STANDALONE_READER_URL`
- `VITE_EBOOK_STANDALONE_DRIVE_FOLDER`
- `VITE_EBOOK_STANDALONE_EPUB_WRITE_ENABLED`

The standalone build intentionally leaves the transfer broker empty and EPUB file writing disabled unless explicitly configured. The standalone reader link is shown as unavailable until its own reader/broker deployment is configured. The production Grapes reader page and Apps Script broker have not been changed.

`tests/ebook-standalone.test.js` checks the DOM contract, entrypoint separation, adapter initialization order, and that the standalone config does not embed the production broker URL. These checks are included in `npm run test:ebook` and the extraction workflow now includes pull-request triggers.

## Acceptance gates before considering the extraction usable

- Existing Grapes E-book screen still boots and all current E-book regression tests pass.
- Standalone entry point builds without importing `src/screens.js`, Grapes root navigation, or Grapes login state.
- Google Drive connect/disconnect and Picker flows work with the standalone app's own configuration.
- Local e-reader directory sync remains optional and its permission/reconnect behavior is tested.
- Reader pairing, QR, transfer, and broker callbacks use only the configured standalone URLs.
- Dirty metadata/content edits are protected by confirmation in both shells.
- No existing Grapes cache, pairing token, Drive folder or user data is overwritten or silently migrated.
- Browser tests cover both entry points; live OAuth and Apps Script acceptance are recorded separately from mocked tests.

## Current outcome

The standalone E-book shell is implemented on the isolated feature branch and has passed the current CI validation run:

- Full repository unit suite: **passed**.
- Targeted E-book suite: **passed**.
- EPUBCheck integration (EPUB 2/3 fixtures and repaired files): **passed**.
- Standalone E-book browser smoke: **passed**; the page boots with its own storage namespace and does not load the Grapes main app.
- EPUB validation browser check: **passed** with 0 errors and 0 warnings.
- Existing E-book editor/layout browser checks: **passed** at 360, 390, 768, 1024 and 1440 px.
- Production Vite build with both HTML entry points: **passed**.

The first build attempt exposed incorrect relative import paths in `src/ebook-reader-sync.js`; these are corrected to reference `src/ebook/platform.js` and `src/ebook/config.js`. The final successful CI run is [44956864427](https://github.com/fabianpetermark-commits/Grapes/actions/runs/44956864427).

The configuration boundary is implemented in `src/ebook/config.js`. The existing Grapes entry keeps its original OAuth environment variables, canonical Pages URLs, Drive folder and storage keys. The standalone entry sets a separate configuration before importing the feature, with its own token/session namespace, view key, library cache, reader-sync database and Drive folder. No secrets or live OAuth tokens were committed.

The standalone shell is still hosted as an additional entry point inside the Grapes repository. It is not yet a separate repository or separate production deployment. The production Grapes reader HTML and Apps Script broker remain untouched. Standalone reader pairing, QR transfer and broker callbacks remain unavailable until the final standalone origins and a separate broker deployment are configured. Live Google OAuth/Picker acceptance has not yet been performed.

The draft PR is [#245](https://github.com/fabianpetermark-commits/Grapes/pull/245). It remains open and unmerged. `main` remains at `bdddf33a4a585ca4c82343157cc3238e063c94b2`; the feature branch is 51 commits ahead and 0 behind. No production deployment, data migration or Apps Script deployment was performed.

**Next phase:** isolate `public/ebook-reader.html` and the Apps Script transfer broker for standalone origins; then run mocked and live acceptance for pairing, QR transfer, ReaderSync, and cross-account behavior. After that, perform the full-history migration into the separately named standalone repository, preserving only the approved E-book paths and verifying representative file history before any repository is published.
