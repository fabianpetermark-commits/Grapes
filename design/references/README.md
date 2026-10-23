# Grapes – design reference pack (Brand Guide v1.1)

**Purpose:** keep the exact reviewable HTML behind every Grapes redesign screen, so the finished TEST/PROD UI can be reviewed against a clear visual contract. These files **do not replace** actual application code, authorization, stored data, or existing modules.

Start with [the interactive reference gallery](./index.html). **Never pick a design from `history/` as a current implementation target.**

## What is approved?

| Module/screen | Exact source of truth | Status | Notes |
| --- | --- | --- | --- |
| Health main widget dashboard | [approved/health-minimal.html](approved/health-minimal.html) | **APPROVED VISUAL** | Exact unchanged approved HTML; Food, Water, recipe, bottom contextual actions |
| Plants / Növények widget page | [approved/plants-widget.html](approved/plants-widget.html) | **APPROVED STYLE**, functional layout still evolving | Exact original HTML; demo plants/weather/tasks do not equal finished data integration |
| Previous integrated top rail + contextual dock | [approved/main-shell-widgets.html](approved/main-shell-widgets.html) | **REFERENCE ARCHIVE / STRUCTURE**, not final screen sign-off | Exact original latest demo; displays old “Utility” label |
| Integrated top rail with new Tools name | [candidates/main-shell-tools.html](candidates/main-shell-tools.html) | **PROPOSED** | Same base shell, displayed label changed to Tools; internal utility code key unchanged |
| Home | [candidates/home.html](candidates/home.html) | **PROPOSED** | Shopping, inventory, plants, contextual dock |
| Tools | [candidates/tools.html](candidates/tools.html) | **PROPOSED** | E-book & QR widgets, contextual dock |
| Finance – **teljes Pénzügyi napló** | [candidates/finance.html](candidates/finance.html) | **PROPOSED**, user review pending | Full standalone HTML with overview, transaction ledger/editor, savings goals and movements, projection, import preview, settings and Finance bottom dock; preserves real-module feature scope at implementation |
| E-book details | [candidates/ebook.html](candidates/ebook.html) | **PROPOSED** | Library, reader, transfer; preserve reading font/theming |
| QR Studio details | [candidates/qr.html](candidates/qr.html) | **PROPOSED** | Link, color, advanced settings; QR-looking graphic is **not scannable** |
| Prior superseded variants | [history/](history/) | **HISTORY ONLY** | Never reuse just because filename contains “Health” or “main” |

**Shared, explicit style tokens for the new candidates**: [shared/grapes-v11.css](shared/grapes-v11.css). The first three approved/legacy sources retain their **exact inline CSS and JS** as originally delivered, so later edits to shared CSS cannot silently change them.

## Fidelity / parity acceptance contract

**The goal is the approved design matching the actual delivered UI.** That includes visual appearance **and real module actions**, not just a screenshot.

1. **One authoritative HTML for each route.** During approval the relevant candidate becomes the route's approved reference; move/copy with traceable commit, deprecate older candidate, update table and screenshots. Codex must not invent a new layout if an approved one exists.
2. **Palette & geometry:** app `#090E14`, widget `#101821`, raised `#17222E`, muted border `#243343`, accent `#3BDCF2`; 1px quiet outlines, ~19px widget radius, 12px inter-widget spacing, 15–16px page margins. Cyan glow may appear only on **short sections of the box perimeter**, never as a full-card halo.
3. **Navigation:** horizontally scrollable top rail with **Kezdő, Home, Health, Tools, Finance**. The Kezdő hosts **real widgets** from other modules; added future top-level modules append to the same rail. NO obsolete bottom **global** menu, NO 2×2/list toggle, NO mandatory intermediary submenu cards.
4. **Contextual dock:** bottom dock changes with selected top-level module; **Health Fotó / Étel / Víz + separate Vonalkód** is accepted. Other dock actions in candidates are still pending user approval. Safe-area and final scroll padding prevent overlap; full-screen reader/editor may hide dock contextually.
5. **Mobile review:** 320, 360, 390, 412 px; no horizontal overflow; readable Hungarian text, accessible focus, 44–48px hit areas, Android safe-area, keyboard/Back and reduced-motion behavior. Test offline/loading/empty/error cases, not just populated demo widgets.
6. **Screenshot parity:** CI captures the reference at 320/390/412px as artifacts using [`tests/design-references.browser.mjs`](../../tests/design-references.browser.mjs) and [`design-reference-screenshots.yml`](../../.github/workflows/design-reference-screenshots.yml). For a production candidate, capture the **same viewport and state from Grapes TEST**, compare side by side (or through an image diff with explicit threshold); inspect borders, alignment, typography, density, fixed dock, navigation and empty states. **Screenshots are generated, not yet pixel-diffed against an approved binary baseline.** Do not claim perfect parity without TEST comparison and user review.
7. **Behavior parity:** demo shortcuts, fake numbers and non-scannable sample QR are only examples. The final UI must call the actual existing functions, render real persisted data or explicit empty state, keep data/Drive/Finance/Health Connect/YAZIO integrity, and protect Auth/PIN. Never ship prototype fake transactions, recipes, temperatures or generated QR patterns as real.
8. **Review gate:** changes that affect any approved visual need a fresh screenshot/UX approval before merging. CI browser checks are a minimum, not permission to merge. No TEST APK or PROD release solely from this PR.

## Mapping to existing functional code (implement, do not overwrite)

| Reference | Existing code / subsystem |
| --- | --- |
| Health | `design/android-mobile-preview.html` Health dashboard + `src/android-mobile-shell.js`; Food/Water existing modules |
| Kezdő / top rail / docks | Android shell/navigation + module registry to be designed |
| Home | `src/home/home-mobile.js`, `src/home/home-data.js`, `home-store.js` |
| Növények | TEST PR #75 UI; WeatherAPI TEST PR #112; data synchronization not finished |
| Tools | currently `hub-utility` in `design/android-mobile-preview.html` and `src/android-mobile-shell.js` |
| E-book | `src/ebook-mobile-library.js`, `ebook-mobile-reader.js`, transfer + existing editor |
| QR Studio | `src/qr-studio.js` / `index.html#qr-app` |
| Finance | `src/finance-tracker.js`, `finance-import*.js`, `src/styles/screens/finance-tracker.css` |

**Do not blindly rename** internal `utility` IDs/Drive storage keys, move Food/Finance data, or replace the real QR renderer with the demo SVG. A displayed UI label rename is different from storage migration.

## Working with this gallery

In a checked-out Grapes repo:

```sh
python3 -m http.server 4177
# Open http://localhost:4177/design/references/
```

Screenshots/review (in appropriate CI with Chromium installed for the same `playwright-core` version):

```sh
node tests/design-references.browser.mjs
```

Prototypes are intentionally isolated from the live environment; **no production credentials, API keys, user data or synchronized profile states** are included.

**Maintained on draft PR #41.** Approval of the design reference alone never authorizes automatically merging implementation changes.


## Finance full-module candidate — 2026-10-23

The latest `candidates/finance.html` **replaces the previous summary-only proposal** with a complete interactive, single-file (inline CSS/JS) module prototype. It does **not** redesign the Grapes global main menu. It is visually derived from the **APPROVED Health minimal reference**, but remains **PROPOSED** until the user reviews it.

- Five internal Finance destinations: Áttekintés, Napló, Megtakarítás, Előrejelzés, Import.
- Header: simple `Finance` + module settings, no duplicate branding. Separate contextual dock: Kiadás / Bevétel / Félretétel / Import.
- Visual demo: active-period summary, six-month income/expense/planned chart, category breakdown, recent transactions, goals, editable/addable in-memory entries, filter/delete/undo, savings deposit/withdrawal, forecast selectors, CSV column-preview, currency/backup/export demo.
- **Real implementation must keep existing functionality** in `src/finance-tracker.js`, `src/finance-data.js`, `src/finance-import-ui.js`: actual finance model, XLS/XLSM/XLSX file mapping and duplicate checks, receipt upload/local OCR, persons/categories, scheduled/real transactions, Drive synchronization, CSV export, JSON backup/import, currency lock, savings ledger and forecast logic. Demo CSV parsing is illustrative, **not a replacement**.
- Preview toggle `Mintadatok` is **not a production Finance control**. All numbers are generated demo values; the HTML never calls Grapes data sources.
- Run prototype tests on 320 / 360 / 390 / 412px; compare matching screenshots of all five Finance internal screens from real Grapes TEST **before PROD approval**.
