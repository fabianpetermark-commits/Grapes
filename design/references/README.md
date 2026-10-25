# Grapes – design reference pack (Brand Guide v1.2)

## Health belső oldalak – Food / Víz / Receptek (2026-10-25)

Az E-book külön modulnál elfogadott **Quick Action** elnevezést a Health modulnál is használjuk. A három belső oldal **tényleges, közvetlenül megnyitható HTML/CSS/JS-tervként** készült el, és mindegyik ugyanazt a Brand Guide v1.2 szerinti feliratmentes, 6 ikonos felső kapszulát, valamint a **Fotó / Étel / Víz + külön Vonalkód** fix alsó Quick Action sávot használja.

| Belső modul | Önálló élő HTML | Kipróbálható minta | Mi marad az éles adatmotor feladata? |
| --- | --- | --- | --- |
| Food / Ételnapló | [candidates/food.html](candidates/food.html) | Napválasztó, kalória, makrók, étkezések, in-memory új tétel, törlés, szkenner-indító előnézet | Valódi OFF/USDA keresés, makró/gramm számítás, Food napló adatkezelés, célok, YAZIO-import, mentés/Drive, Statisztika |
| Víznapló | [candidates/water.html](candidates/water.html) | +150 / +250 / +500 ml, vízcél, napi napló és heti grafikon | Helyi Water profilhoz kötött mentés, eseményazonosítók, Health Connect, Drive/backup, tényleges dátumszűrés |
| Receptek | [candidates/recipes.html](candidates/recipes.html) | Receptkereső, Édes/Sós szűrő, megnyitás, ötfüles szerkesztő Alapadatok/Összetevők/Elkészítés/Kép/Import; in-memory mintamentés | Valódi élelmiszerhez kapcsolás, mennyiség/kalória/tápérték, képfeldolgozás, biztonságos link-/fájlimport és YAZIO-eseménykezelés |

**Állapot:** `PROPOSED` belső képernyőtervek, felhasználói vizuális ellenőrzésre. A jelenlegi családi **Étrendtervező** önálló új funkció, nem része ennek az átvezetésnek; a meglévő Food napló bejegyzései továbbra is tényleges fogyasztások, a megtervezett étkezés nem könyvelhető automatikusan. A HTML-nek **nincs hálózati hívása, nem kér kamera/Drive jogosultságot, nem ment valódi adatot és nem változtatja az Android appot**. A kijelzett makrók és mintareceptek illusztrációk; demo szerkesztésük sem hoz létre éles adatot. Érintetlen: Supabase/RLS/owner claim, Google OAuth/PIN, Food/Water adatstruktúrák és e-book Drive elérés.

A közös stílus: [shared/health-inner.css](shared/health-inner.css), a csak memóriabeli bemutató interakciók: [shared/health-inner.js](shared/health-inner.js). Az élő galériában mindhárom külön oldalként megnyitható. A `tests/design-references.browser.mjs` és `tests/design-review.browser.mjs` böngészős regresszióval ellenőrzi a navigációt, Quick Action-t és alap demófolyamatokat. **A későbbi valódi modulmigrációhoz külön TEST-PR, adatvesztési védelem és vizuális paritás kell.**

---

## Teljes, interaktív képernyőellenőrzés

**[11-képernyős élő HTML review: review.html](review.html)** — Kezdő, Home, Health, Food, Víz, Receptek, Növények, Tools, E-book, QR és Finance, a **tényleges verziózott HTML-fájlok beágyazásával**, nem újragenerált illusztrációval. A képernyőméret egy kattintással váltható **320 / 360 / 390 / 412 px** között. A Finance öt lapja, az E-book három és a QR három belső nézete is kipróbálható. [Klasszikus galéria](index.html).

**Státusz:** az egységes navigáció, ikonok, kártyastílus és minimál címsor a v1.2 célállapot. A Home/Tools/Finance/E-book/QR modulok további részletei **még vizuális jóváhagyásra váró jelöltek**. A HTML-ek szimulációk; a demo gombok és tranzakciók nem kerülnek a valódi Grapes-adatbázisba.

### Külön folyó fejlesztések védelme

- **Supabase:** a #120–#124 Health-adatfelderítési, helyi mentési és tulajdonoshoz kötési TEST-lépésektől a vizuális referencia **teljesen független**. Nem változik adatbázis-séma, RLS, owner claim, Auth, OAuth, PIN, Drive API, mig­ráció vagy kiadási csatorna. Valós Supabase-írást semmilyen demo nem indít.
- **Étrendtervező:** az új családi menütervező később a közös widgeteket használhatja, de a minta nem definiál új Food-adatmodellt, automatikus tényleges naplózást vagy felhős tárolást.
- **Készletfigyelő:** a #122 Home M2 készlet- és megerősítéses készletmozgás-logikája változatlan; egy meglévő UI-widget megjelenítése önmagában nem vonhat le készletet, nem írhat tranzakciót vagy OCR-felismerés alapján tételt.
- **Bevezetési kapu:** a HTML review következő lépése a vizuális jóváhagyás. Csak azután következhet külön **TEST-kód-PR**, amelynek valós adatforrásra, funkciókra és Android navigációra vonatkozó regressziós bizonyítéka van. **Sem merge, sem APK release nincs ebben a dokumentációs ágban.**

A CI a [`tests/design-references.browser.mjs`](../../tests/design-references.browser.mjs) mellett a [`tests/design-review.browser.mjs`](../../tests/design-review.browser.mjs) tesztet is futtatja. Ezzel **egyszerre ellenőrizzük a 11 ellenőrzendő HTML-forrás felnyitását, a címek/ikonsáv sorrendjét és a többnézetes Finance/E-book/QR navigációt**, majd mobilos képeket készítünk. Ezek HTML-referencia-tesztek, nem teljes Android TEST → PROD pixeldiff.

---



**Purpose:** keep the exact reviewable HTML behind every Grapes redesign screen, so the finished TEST/PROD UI can be reviewed against a clear visual contract. These files **do not replace** actual application code, authorization, stored data, or existing modules.

Start with [the interactive reference gallery](./index.html). **Never pick a design from `history/` as a current implementation target.**

> **2026-10-24 pontos méret- és tisztasági követelmény:** [Brand Guide v1.2, 0.A.1–0.A.4](../../docs/GRAPES_BRAND_GUIDE.md) – 6 oszlop, 22/20px glyph, 23px külső radius, 22–24px egyszeri cím az ikonsor alatt, ikonfelirat és dekoratív alcím nélkül, egységes in-rail beállítások. **Külön látható Back/Home gomb tilos** minden modulban. A Home *főmodul* és a Kezdő *főfül* marad; az Android natív Back gesztus működése marad. Az E-book és QR történetileg külön Back-fülét valódi modulművelet váltotta fel. A részletes címsor- és funkcióparitást TEST-app ellenőrzéskor is igazolni kell.

## Visual navigation update – v1.2 (2026-10-24)

All **current** menu and module HTML files (three `approved/` examples, six `candidates/` examples) now contain the user-requested navigation geometry, **not just prose in this document**: a single six-slot rounded dark capsule; 22px / 20px line icons, no visible icon captions, always accessible `aria-label` and `title`, integrated sixth-slot cog and clearly framed active state. The full Finance internal module removes the second module heading, duplicate eyebrow labels and status dot. The global main shell still retains its user-visible `Grapes` branding as appropriate. Contextual lower quick-action docks continue to exist.

**Important:** this is the latest visual rule for the current HTML references. `history/` files deliberately retain their old appearance, solely as archival records. Actual `codex/android-app` runtime is not automatically changed by #41; Finance is still a proposal pending visual review of its full content. Browser test `tests/design-references.browser.mjs` verifies the six-icon contract at 320/390/412px for each current prototype.

---

## What is approved?

| Module/screen | Exact source of truth | Status | Notes |
| --- | --- | --- | --- |
| Health main widget dashboard | [approved/health-minimal.html](approved/health-minimal.html) | **APPROVED VISUAL** | Previously approved Health widgets, now explicitly updated with the user-approved six-icon navigation shell and in-rail settings |
| Plants / Növények widget page | [approved/plants-widget.html](approved/plants-widget.html) | **APPROVED STYLE**, functional layout still evolving | Earlier plant design updated with the new shared six-icon rail; demo plants/weather/tasks are not finished data integration |
| Previous integrated top rail + contextual dock | [approved/main-shell-widgets.html](approved/main-shell-widgets.html) | **REFERENCE ARCHIVE / STRUCTURE**, not final screen sign-off | Original widget dashboard content retained, rail restyled to six icon-only slots and Utility label normalized to Tools |
| Integrated top rail with new Tools name | [candidates/main-shell-tools.html](candidates/main-shell-tools.html) | **PROPOSED** | Updated six-icon captionless shell and Tools label; internal utility key unchanged |
| Home | [candidates/home.html](candidates/home.html) | **PROPOSED** | Shopping, inventory, plants, contextual dock |
| Tools | [candidates/tools.html](candidates/tools.html) | **PROPOSED** | E-book & QR widgets, contextual dock |
| Finance – **teljes Pénzügyi napló** | [candidates/finance.html](candidates/finance.html) | **PROPOSED**, user review pending | Full standalone HTML with overview, transaction ledger/editor, savings goals and movements, projection, import preview, settings and Finance bottom dock; preserves real-module feature scope at implementation |
| E-book details | [candidates/ebook.html](candidates/ebook.html) | **PROPOSED** | Library, reader, transfer; preserve reading font/theming |
| QR Studio details | [candidates/qr.html](candidates/qr.html) | **PROPOSED** | Link, color, advanced settings; QR-looking graphic is **not scannable** |
| Prior superseded variants | [history/](history/) | **HISTORY ONLY** | Never reuse just because filename contains “Health” or “main” |

**Shared, explicit style tokens for the new candidates**: [shared/grapes-v11.css](shared/grapes-v11.css). The three approved reference pages keep self-contained inline CSS and JS, **now explicitly revised to the newly requested universal six-icon rail**. Earlier versions remain recoverable through Git history; these are not claims that the original unchanged HTML is still the active visual standard.

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
