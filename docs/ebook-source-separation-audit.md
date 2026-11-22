# E-book source separation audit

**Audit baseline:** `feature/ebook-android-app-20261122` at `64eaab7889e937082504d2135c1c74045cfb71ad`  
**Working branch:** `feature/ebook-core-separation-20261122`  
**Status:** initial source-level audit; not yet an extraction or proof of standalone operation.

## Objective

Make E-book a separately buildable and deployable product whose core does not require the Grapes application. Grapes may continue to host the feature through an optional host adapter. The standalone web and Android applications must use the same E-book core without importing Grapes UI, account, storage, routing, or application bootstrap modules.

The shared Grapes UI shell is not a prerequisite for source separation. UI work is explicitly deferred until the product boundary and functional behavior are stable.

## Current architecture observed

- `src/ebook-library.js` owns most library/editor behavior and imports its platform boundary from `src/ebook/platform.js`.
- `src/ebook/platform.js` is a useful host seam, but its exported functions are named `connectGrapesDrive`, `grapesDriveRequest`, `isGrapesDriveConnected`, `showGrapesConfirm`, and `navigateEbookScreen`. This leaks the original host into the feature-facing API.
- `src/ebook/grapes-platform.js` is the actual Grapes adapter. It imports `../storage/grapes-drive.js`, `../ui/modal.js`, and `../screens.js`. These imports must remain on the Grapes host side and must never enter a standalone bundle.
- `src/ebook/standalone-platform.js` implements a separate browser GIS / Android-native Drive authorization adapter and uses a configurable storage namespace. It is not a complete independent application boundary by itself.
- `src/ebook/config.js` currently defines Grapes deployment defaults, including the Grapes Pages URL, Grapes folder name, Grapes storage keys, and Grapes IndexedDB identifiers. Standalone overrides these through `src/ebook/standalone-config.js`.
- `src/ebook-standalone.js` imports the Grapes global stylesheet and the Grapes app shell adapter (`src/ebook/standalone-shell.js`). This is a direct Grapes UI dependency in the standalone entry point.
- `src/ebook/standalone-shell.js` imports `src/ui/grapes-app-shell.js` and adapts the existing E-book DOM. It is presentation/host integration, not core E-book logic.
- `src/ebook-reader-sync.js` uses the platform seam, but still imports the shared E-book config and uses the same library DOM. Its File System Access API capability is browser-dependent and unavailable in Android WebView.
- `src/ebook-reader-standalone.js` and `ebook-reader-standalone.html` form a separate lightweight reader handoff page. The reader page depends on the standalone config and separately deployed broker.
- `apps-script/ebook-transfer/Code.gs` supports both legacy Grapes and standalone operation through Script Properties. The standalone broker must be a separately deployed Apps Script project; the current source file alone does not prove that such a deployment exists.
- The root `package.json` is named `grapes` and includes the entire Grapes dependency set. The standalone Vite mode selects only E-book HTML entry points, but it still installs and builds from the Grapes package and Vite configuration.

## Confirmed coupling and gaps

| Area | Current evidence | Required outcome |
|---|---|---|
| Feature API | Grapes-named platform functions are imported by E-book feature code | Rename the feature-facing contract to host-neutral names; retain compatibility aliases during migration |
| Grapes integration | Dedicated `grapes-platform.js` imports Grapes storage, modal, and screen modules | Keep all such imports in the Grapes host entry only |
| Standalone entry | Imports `./styles/index.css` and mounts the Grapes shell | Use a standalone stylesheet and make the Grapes shell optional |
| Configuration | Grapes defaults live in the shared config module | Separate host defaults from neutral validation/schema; fail closed when standalone deployment settings are absent |
| Build | Standalone mode shares root package manifest and Vite config | Establish a standalone package/build manifest with only E-book runtime dependencies |
| Drive data | Namespace and folder overrides exist | Verify all keys, filenames, Drive folder names, appProperties and broker settings are host-specific and non-overlapping |
| Reader transfer | Broker supports standalone mode by Script Properties | Verify separate deployment, allowed origins, URLs, storage, and API contract |
| Android | Separate `hu.grapes.ebook` package and native bridge exist | Keep native bridge as a platform adapter; test OAuth, file picker, lifecycle and actual device behavior |
| Tests | Current suite includes source-string contract tests | Add behavior-level tests for host isolation, build contents, config validation and standalone workflows |

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
- Inventory E-book imports, runtime globals, DOM contracts, storage keys, Drive metadata, broker actions, and build inputs.
- Separate neutral feature APIs from Grapes-named compatibility wrappers.
- Add tests proving the standalone entry does not import Grapes host modules.
- **Gate:** dependency graph and tests show no Grapes storage/UI/navigation import reachable from the standalone feature entry.

### Phase 2 — standalone configuration and persistence
- Move Grapes deployment defaults into the Grapes adapter/configuration.
- Define required standalone settings and validate them at startup.
- Audit localStorage/sessionStorage/IndexedDB keys, Drive folder naming, hidden metadata files, appProperties and broker token namespaces.
- **Gate:** standalone mode cannot silently use Grapes URLs, folder names, namespaces, or broker endpoints.

### Phase 3 — independent package and build
- Create a standalone package manifest and build configuration containing only the E-book runtime dependencies.
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
