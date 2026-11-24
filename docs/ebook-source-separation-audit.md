# E-book source separation audit

**Audit baseline:** `feature/ebook-android-app-20261122` at `64eaab7889e937082504d2135c1c74045cfb71ad`  
**Working branch:** `feature/ebook-core-separation-20261122`  
**Status:** source-level dependency inventory in progress; not yet an extraction or proof of standalone operation.

## Objective

Make E-book a separately buildable and deployable product whose core does not require the Grapes application. Grapes may continue to host the feature through an optional host adapter. The standalone web and Android applications must use the same E-book core without importing Grapes UI, account, storage, routing, or application bootstrap modules.

The shared Grapes UI shell is not a prerequisite for source separation. UI work is explicitly deferred until the product boundary and functional behavior are stable.

## Current architecture observed

- `src/ebook-library.js` owns most library/editor behavior and imports its platform boundary from `src/ebook/platform.js`.
- `src/ebook/platform.js` now exposes host-neutral functions (`connectDrive`, `driveRequest`, `isDriveConnected`, `confirm`, `navigate`, etc.). The former Grapes-named exports remain as deprecated compatibility aliases. `src/ebook-library.js`, `src/ebook-reader-sync.js`, and `src/ebook/standalone-shell.js` have been migrated to the neutral names.
- `src/ebook/grapes-platform.js` is the actual Grapes adapter. It imports `../storage/grapes-drive.js`, `../ui/modal.js`, and `../screens.js`. These imports must remain on the Grapes host side and must never enter a standalone bundle.
- `src/ebook/standalone-platform.js` implements a separate browser GIS / Android-native Drive authorization adapter and uses a configurable storage namespace. It is not a complete independent application boundary by itself.
- `src/ebook/config.js` now contains only a host-neutral schema/validator and fails closed if `globalThis.__EBOOK_CONFIG__` was not installed. Grapes defaults live in `src/ebook/grapes-config.js`, loaded as a side effect by `src/ebook/grapes-platform.js`; standalone web and reader entries load `src/ebook/standalone-config.js` before dynamically/static importing the core.
- `src/ebook-standalone.js` imports the Grapes global stylesheet and the Grapes app shell adapter (`src/ebook/standalone-shell.js`). This is a direct Grapes UI dependency in the standalone entry point.
- `src/ebook/standalone-shell.js` imports `src/ui/grapes-app-shell.js` and adapts the existing E-book DOM. It is presentation/host integration, not core E-book logic. This remains a direct Grapes UI dependency in the standalone transitive graph.
- `src/ebook-reader-sync.js` uses the platform seam, but still imports the shared E-book config and uses the same library DOM. Its File System Access API capability is browser-dependent and unavailable in Android WebView.
- `src/ebook-reader-standalone.js` and `ebook-reader-standalone.html` form a separate lightweight reader handoff page. The reader page depends on the standalone config and separately deployed broker.
- `apps-script/ebook-transfer/Code.gs` supports both legacy Grapes and standalone operation through Script Properties. The standalone broker must be a separately deployed Apps Script project; the current source file alone does not prove that such a deployment exists.
- The root `package.json` is named `grapes` and includes the entire Grapes dependency set. The standalone Vite mode selects `ebook.html` and `ebook-reader-standalone.html`, but still installs and builds from the Grapes package and Vite configuration.
- `src/ebook-standalone.js` imports the global `src/styles/index.css`, which in turn imports the Grapes app-shell stylesheet and unrelated app-wide component/screen styles. It also dynamically imports `src/ebook/standalone-shell.js`, which statically imports `src/ui/grapes-app-shell.js`. Both edges must be removed or replaced before the standalone bundle can be considered host-independent.
- The directly visible runtime package imports in the E-book entry path include `qrcode` (`src/ebook-library.js`) and `epubcheck-standalone` plus its `plugins` and `epubcheck-engine.js?url` entry (`src/ebook/epubcheck.worker.js`). This is an initial import inventory, not yet a complete dependency closure; inspect all transitive EPUB/metadata modules before writing the independent manifest.

## Confirmed coupling and gaps

| Area | Current evidence | Required outcome |
|---|---|---|
| Feature API | Host-neutral exports are now used by the library, reader sync and standalone shell; legacy names remain aliases | Keep compatibility aliases until all consumers/tests are migrated, then remove only after a full search and regression pass |
| Grapes integration | Dedicated `grapes-platform.js` imports Grapes storage, modal, and screen modules | Keep all such imports in the Grapes host entry only |
| Standalone entry | Imports `./styles/index.css` and mounts the Grapes shell | Use a standalone stylesheet and make the Grapes shell optional |
| Configuration | Neutral schema/validation in `src/ebook/config.js`; Grapes defaults in `src/ebook/grapes-config.js`; standalone defaults in `src/ebook/standalone-config.js` | Preserve each host's existing IDs and namespaces; fail closed if a host bootstrap is missing |
| Build | Standalone mode shares root package manifest and Vite config | Establish a standalone package/build manifest with only E-book runtime dependencies |
| Drive data | Namespace and folder overrides exist | Verify all keys, filenames, Drive folder names, appProperties and broker settings are host-specific and non-overlapping |
| Reader transfer | Broker supports standalone mode by Script Properties | Verify separate deployment, allowed origins, URLs, storage, and API contract |
| Android | Separate `hu.grapes.ebook` package and native bridge exist | Keep native bridge as a platform adapter; test OAuth, file picker, lifecycle and actual device behavior |
| Tests | Current suite includes source-string contract tests | Add behavior-level tests for host isolation, build contents, config validation and standalone workflows |


## External integration inventory (source inspection)

This inventory describes source-code evidence only. It does not prove that external cloud projects, OAuth clients, API keys, or Apps Script deployments are correctly configured or currently reachable.

| Integration | E-book usage found in source | Configuration / ownership | Separation risk and required check |
|---|---|---|---|
| Google OAuth — Grapes web | Google Identity Services token flow in `src/storage/grapes-drive.js`; client ID comes from `VITE_GOOGLE_CLIENT_ID` | Grapes host Drive adapter; session/account state uses Grapes keys | Preserve the existing Grapes OAuth client, authorized origins, Drive API enablement and scopes. Do not replace its client ID during extraction |
| Google OAuth — standalone web | GIS token flow in `src/ebook/standalone-platform.js`; `VITE_EBOOK_STANDALONE_GOOGLE_CLIENT_ID` | Standalone-specific client ID and `ebook-standalone-v1` session namespace | Verify standalone OAuth client, allowed web origins, consent configuration and scopes independently |
| Google OAuth — Android | Native Google Authorization API through `EbookAndroid` in `android-ebook/app/src/main/java/hu/grapes/ebook/MainActivity.kt` | Android application ID `hu.grapes.ebook`; Drive `drive.file` and optional `drive.readonly` scopes | Android OAuth registration must match package name and signing SHA-1. Debug CI fingerprints are ephemeral; verify with the exact installed build |
| Google Drive API | Library listing, folder creation, upload/download, metadata, permissions and reader transfer in `src/ebook-library.js`; account/token adapter in platform implementations | Grapes and standalone use different adapters, storage namespaces and configured folder names | Preserve user files and existing Grapes folder/metadata protocol. Verify standalone folder and metadata do not collide with Grapes data |
| Google Picker | Loads `https://apis.google.com/js/api.js`; uses Picker API key and app/project ID | Grapes `VITE_GOOGLE_PICKER_API_KEY` / `VITE_GOOGLE_APP_ID`; standalone equivalents use `VITE_EBOOK_STANDALONE_*` | Separate API key restrictions and allowed origins; feature can remain partially usable without Picker, but file-level access flow must be tested |
| Google Books API | Metadata lookup in `src/ebook-library.js`; optional API key, otherwise uses Drive access token | `VITE_GOOGLE_BOOKS_API_KEY` and standalone counterpart | Verify key restrictions/quota and ensure unauthenticated metadata lookup still behaves as intended |
| Open Library | Metadata and cover lookup via `openlibrary.org` | Public external API; no project key found in inspected E-book source | Network/CORS/availability behavior should be tested; this is an optional metadata provider, not a storage backend |
| Apps Script transfer broker | Pairing, reader token, download and revoke actions in `apps-script/ebook-transfer/Code.gs` | Script Properties: `EBOOK_STANDALONE_MODE`, `EBOOK_FOLDER_NAME`, `EBOOK_ALLOWED_RETURN_URL`, `EBOOK_ALLOWED_PARENT_ORIGIN`, `EBOOK_READER_RETURN_URL`; standalone URL comes from `VITE_EBOOK_STANDALONE_TRANSFER_BROKER_URL` | Standalone requires a separate Apps Script project/deployment and exact allowlist. Source does not prove a live deployment exists |
| Apps Script / FatSecret (non-E-book) | The same `Code.gs` also contains FatSecret search and OAuth endpoints used by Food | FatSecret credentials are Script Properties; unrelated to E-book transfer | Do not accidentally package or expose Food/FatSecret code as part of the standalone E-book broker. The standalone action allowlist currently blocks unrelated actions, but source separation remains desirable |
| Supabase | No E-book Supabase SDK import, `createClient` call, Supabase URL/key environment variable, or direct Supabase request was found in the inspected repository source search. Supabase appears in `conception/ARCHITECTURE.md` as a platform/backend design consideration | No E-book-specific Supabase configuration was found | Current evidence does not support a direct E-book → Supabase dependency. Re-run repository-wide checks before extraction is finalized; do not invent a migration or replace a backend that E-book does not use |
| Browser persistence | Library cache, reader-sharing preference, current view and Drive session/account state use localStorage/sessionStorage; reader USB sync uses IndexedDB | Grapes and standalone config provide distinct key prefixes/namespaces; standalone reader token uses `ebook-standalone-reader-token-v1` | Audit every persistent key and migration/cleanup path. Never clear or rename existing Grapes keys during extraction |
| Android native bridge | `EbookAndroid.postMessage` handles Drive authorization/revocation and document picker | Isolated Android package and WebView origin `appassets.androidplatform.net` | Keep bridge calls behind standalone adapter; test activity lifecycle, request correlation, permissions and actual device behavior |

### Integration conclusions

1. The currently visible E-book cloud data path is Google Drive, not Supabase.
2. OAuth has three distinct host contexts: existing Grapes web, standalone web, and standalone Android. They must not be collapsed into one configuration.
3. The standalone adapter already isolates its browser session namespace, and standalone config uses a different Drive folder and local persistence identifiers. This is a good starting point, not yet proof of complete data isolation.
4. Pairing/reader transfer depends on a separately configured Apps Script broker. A code file and README are not evidence of a deployed, working broker.
5. The Apps Script source currently combines E-book transfer with unrelated Food/FatSecret endpoints. Keep the E-book broker deployment allowlist strict and extract the broker source cleanly before treating it as an independent product service.
6. No secrets or production credentials should be copied into source control. The checked-in `.env.example` contains empty Google E-book credential placeholders; the real OAuth client configuration and external project settings must be verified in their respective consoles.


## Extraction rules

1. E-book core modules must not import from Grapes application directories such as `src/storage/`, `src/screens.js`, `src/ui/`, or the Grapes bootstrap.
2. Host-specific integrations live in explicit adapters (Grapes, browser standalone, Android).
3. Feature-facing APIs use neutral names such as `connectDrive`, `driveRequest`, `isDriveConnected`, `confirm`, and `navigate`. Temporary aliases may preserve existing Grapes call sites until migration is complete.
4. Configuration must be injected by the host/build. The core must not silently default to a Grapes URL, folder, or storage namespace in standalone mode.
5. Standalone builds must not include Grapes home-screen assets, Grapes shell code, or unrelated Grapes dependencies.
6. No user data, Drive files, pairing tokens, or production Apps Script deployment may be migrated, renamed, overwritten, or deleted as part of code extraction.
7. Existing Grapes behavior must remain available through its adapter until the standalone app passes its own acceptance gates.
8. Do not remove compatibility paths until regression tests demonstrate that no supported entry point still uses them.

## Work plan and acceptance gates

### Phase 1 — dependency boundary
- [x] Inventory the primary E-book external services, runtime globals, DOM contracts, storage keys, Drive metadata, broker actions, and build inputs at source level.
- [x] Record that no direct E-book Supabase SDK/config/request dependency was found in the repository source search; Supabase appears only in the architecture planning document.
- [ ] Complete a static import-graph check and verify all standalone entry transitive imports before closing this phase.
- [x] Identify the remaining direct Grapes UI edges in the standalone graph: global `src/styles/index.css` and `src/ebook/standalone-shell.js` → `src/ui/grapes-app-shell.js`.
- [x] Separate neutral feature APIs from Grapes-named compatibility wrappers; migrate library, reader sync and standalone shell call sites. Keep deprecated aliases during the transition.
- [x] Add platform contract tests for neutral API delegation and legacy alias compatibility.
- [x] Migrate standalone shell listeners to neutral platform exports.
- [x] Correct library adapter name shadowing introduced during the API migration by aliasing imported platform methods (`platformConnectDrive`, `platformDisconnectDrive`, `platformDriveRequest`).
- [x] Record Google OAuth, Drive, Picker, Books, Open Library, Apps Script/FatSecret, persistence and Supabase source findings in this audit.
- Add tests proving the standalone entry does not import Grapes host modules.
- **Gate:** dependency graph and tests show no Grapes storage/UI/navigation import reachable from the standalone feature entry.

### Phase 2 — standalone configuration and persistence
- [x] Move Grapes deployment defaults out of the shared core into `src/ebook/grapes-config.js`, loaded by the Grapes host adapter.
- [x] Make the shared config module host-neutral and fail closed when no host configuration is installed.
- [x] Validate required host URLs, Drive folder name, and persistence namespace/key settings.
- [ ] Audit localStorage/sessionStorage/IndexedDB keys, Drive folder naming, hidden metadata files, appProperties and broker token namespaces.
- Audit localStorage/sessionStorage/IndexedDB keys, Drive folder naming, hidden metadata files, appProperties and broker token namespaces.
- **Gate:** standalone mode cannot silently use Grapes URLs, folder names, namespaces, or broker endpoints.

### Phase 3 — independent package and build
- [ ] Create a standalone package manifest and build configuration containing only the E-book runtime dependencies, after the transitive dependency closure is verified.
- Build the library and reader handoff pages from the independent package.
- Keep the Grapes host integration as a consumer of the extracted core.
- **Gate:** clean install and production build from the standalone package, with an artifact inspection proving no Grapes application modules/assets are bundled.

### Phase 4 — functional acceptance
- Test Drive connect/disconnect, listing, upload/download, metadata persistence, EPUB/PDF editing and validation, dirty-state protection, pairing, broker transfer, reader handoff, and supported desktop USB sync.
- Test Android-specific OAuth and document picker on a real device; explicitly verify unsupported capabilities are disabled or explained.
- **Gate:** standalone acceptance suite passes; all remaining broker/OAuth configuration requirements are documented and verified separately.

### Phase 5 — UI return
- Only after the previous gates pass, finalize the shared shell adoption and the agreed four-section navigation.
- Keep the Grapes shell optional and avoid coupling the E-book core to its DOM or lifecycle.

## Current non-goals

- Do not merge PR #246 or change `main`.
- Do not deploy or overwrite the existing Grapes Apps Script project.
- Do not redesign the E-book UI during the extraction phases.
- Do not claim production OAuth, broker pairing, Android USB sync, or real-device acceptance based only on a successful compile.


## Verification log

- Neutral platform API and compatibility alias tests were added/updated, but **were not executed in this environment**.
- GitHub Actions currently reports no workflow runs for `feature/ebook-core-separation-20261122`; therefore there is no CI pass/fail result to report yet.
- Configuration isolation was implemented in commits `3ab6148`, `7f24645`, `4968bfc`, `8a8cd4b`, and `df382b0`; the shared core no longer contains Grapes deployment defaults.
- Source inspection found and fixed a name-shadowing hazard in `src/ebook-library.js`: local UI handlers named `connectDrive` / `disconnectDrive` now delegate to explicitly aliased platform methods, and Drive requests use `platformDriveRequest`.
- No production OAuth client, Google Cloud console settings, Supabase project, or Apps Script deployment was modified.

- The config tests now install an explicit host config before importing the fail-closed core module. Tests have **not been executed**; runtime import ordering has been reviewed from the Grapes, standalone web, and standalone reader entry points only.

- Static standalone-entry review confirmed the existing Vite build is still rooted in the Grapes package. The shared stylesheet and shared Grapes shell remain explicit blockers; no independent package manifest was created prematurely.
