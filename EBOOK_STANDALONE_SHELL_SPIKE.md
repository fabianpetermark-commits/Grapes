# Standalone E-book shell spike

**Date:** 2026-11-21  
**Implementation branch:** `feature/ebook-standalone-shell-20261121`  
**Base:** `audit/ebook-extraction-20261121`  
**Status:** discovery spike only; no production module behavior changed.

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

## Safe first implementation boundary

Do not copy the 2,189-line library module or fork it into a second implementation. Keep one feature implementation and progressively replace singleton dependencies with small contracts:

1. **DriveProvider** — account state, access token, request, connect/disconnect and change subscription.
2. **DialogProvider** — asynchronous confirmation; Grapes adapter preserves current modal behavior, standalone adapter uses its own accessible dialog.
3. **NavigationProvider** — leave-editor / return-to-library behavior without importing the Grapes screen manager.
4. **EbookConfig** — OAuth client, Picker keys, broker URL, return URL, reader URL, Drive folder and storage-key namespace.
5. **ReaderSyncProvider** — optional e-reader directory sync; must not assume a Grapes Drive singleton.

The first runnable standalone slice should use the same E-book feature code and complete DOM contract, but boot from a separate HTML/JS entry point. Keep the existing Grapes entry point wired to the existing adapters. Do not change the production Apps Script allowlist until the standalone deployment origin is known.

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

The branch exists and this discovery note is the only change in this spike. No source code, package dependencies, production configuration, Apps Script deployment, user data, or `main` branch content was changed. No tests or build were executed in this environment.

The next source change should be the smallest adapter extraction (Drive + dialog + navigation/config), with the Grapes screen continuing to use behavior-equivalent adapters. Only after that should a standalone entry point be added.
