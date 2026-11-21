# E-book extraction — phase 2 repository archaeology

**Date:** 2026-11-21  
**Source branch checked:** `main` at `bdddf33a4a585ca4c82343157cc3238e063c94b2`  
**Working branch:** `audit/ebook-extraction-20261121`  
**Scope:** inspect current package/test wiring and compare the two historical E-book feature branches. No production source changes.

## 1. Current main baseline confirmed

The current `package.json` has these E-book checks:

- `npm run test:ebook` — `ebook-library.test.js`, `epub-metadata.test.js`, `pdf-metadata.test.js`
- `npm run test:epubcheck`
- `npm run test:epubcheck:browser`
- `npm run test:ebook:layout`
- General `npm test` and `npm run build`

The E-book screen is lazy-loaded from `src/screens.js` as a Grapes SPA screen. The E-book markup is part of root `index.html`; E-book styling enters through `src/styles/index.css`. `src/ebook-library.js` directly uses the shared `src/storage/grapes-drive.js` and `src/ui/modal.js`. The reader sync module also calls the shared Drive service. This confirms that the current app is not yet standalone even though the reader receiver has its own HTML file.

The existing `EBOOK_DEBUG_REPORT.md` records a prior verification at an older commit: 12 E-book tests, Vite build and npm install were reported as successful there. That historical report is not evidence that the current `main` commit has just passed those commands. This phase did not execute a clean checkout, install dependencies, run tests or build.

## 2. Historical feature branch comparison

Compared each branch against current `main`:

| Branch | Ahead | Behind | Compare status |
|---|---:|---:|---|
| `feature/grapes-test-fresh-owner-ebook-core-20261025` | 489 | 16 | diverged |
| `feature/grapes-test-fresh-owner-ebook-mobile-20261025` | 506 | 16 | diverged |

These are not safe merge candidates for the extraction. They contain substantial unrelated Grapes development history and cannot be merged wholesale to obtain the E-book changes.

### What is useful in the core branch

- `src/ebook/grapes-test-fresh-ebook.js` is a TEST-only, Android-auth-bound, per-account IndexedDB store for newly selected local book files and reading progress.
- `tests/grapes-test-fresh-owner-ebook.browser.mjs` exercises owner A → B → A isolation, stale-session denial, foreign file denial and CAS conflict handling in Chromium.
- `docs/GRAPES_TEST_FRESH_OWNER_EBOOK_CORE.md` explicitly says this is only a local storage foundation, not the normal E-book/Reader/Transfer UI.
- The feature is intentionally isolated from Drive, legacy imports, cloud sync and pairing. It must not be mistaken for a drop-in replacement for the current Drive-backed library.

### What is useful in the mobile branch

- `src/ebook-mobile-library.js` is a separate Drive-backed mobile library/progress helper.
- `src/ebook-mobile-reader.js` adds EPUB reading helpers over the existing EPUB content module.
- `src/ebook-mobile-transfer.js` contains Drive public-sharing, QR and pairing helpers.
- These helpers still import the Grapes Drive service and hard-code Grapes Pages return/reader URLs. They are not standalone adapters yet.
- The branch adds Android E-book browser test scripts and CI workflow coverage. That work may be selectively mined after file-by-file review, but not imported by merging the branch.

## 3. Extraction decisions

1. Do not merge either historical feature branch into `main` or the extraction branch.
2. Treat the current Drive-backed E-book as the parity baseline; do not replace it with the TEST-only local owner store.
3. Preserve the mobile helpers and their tests as candidate material for a later, separately reviewed mobile scope. Do not silently add mobile-only behavior to the first standalone extraction.
4. Extract the working screen and reader receiver intact first. Introduce provider interfaces around Drive/auth, dialogs, transfer broker and reader directory access in later tested changes.
5. Keep Google Drive optional at the product level, but preserve its current capabilities as an adapter. Local-only mode must not claim parity with Drive import/discovery, sharing, or reader transfer.
6. Keep the Apps Script broker deployment separate and configurable. Do not reuse Grapes production deployment identifiers or secrets as defaults in a new app.

## 4. Immediate verification plan

Before changing application source, obtain a clean checkout at the recorded `main` SHA and run:

```sh
npm ci
npm run test:ebook
npm run test:epubcheck
npm run test:epubcheck:browser
npm run test:ebook:layout
npm run build
```

Then record each command's exit status and logs. Browser tests requiring Chromium must run with the repository's documented browser setup. Live OAuth, Picker, Apps Script and physical e-reader acceptance remain separate checks; mocked tests cannot prove those integrations.

Next implementation slice should be a small, isolated app-shell spike on a new extraction branch: create a minimal E-book entry point that mounts the existing library module without `src/screens.js`, root Grapes navigation, or the global Grapes modal. Do not yet remove the old screen, change OAuth scopes, alter the broker deployment, or migrate user data.

## 5. Status

This phase adds documentation only. No source code, dependencies, user data, credentials, deployment, PR or main-branch commit was changed. No tests or build were executed in this environment.
