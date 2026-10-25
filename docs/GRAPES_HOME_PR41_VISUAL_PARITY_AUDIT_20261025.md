# Home → #41 Brand v1.2 visual-parity audit (2026-10-25)

**Status: FUNCTIONAL TEST ≠ VISUAL APPROVAL.** This is a read-only audit of [Home functional #160](https://github.com/fabianpetermark-commits/Grapes/pull/160) against [design/reference #41](https://github.com/fabianpetermark-commits/Grapes/pull/41); **not** a redesign implementation, visual approval, merge, or APK release.

## Authoritative references
- #41: `design/references/candidates/home.html` (**PROPOSED**; not user-approved final Home composition).
- `design/references/shared/grapes-v11.css`; `docs/GRAPES_BRAND_GUIDE.md` Brand v1.2 mandatory **six-slot captionless module rail**, palette, accessibility and contextual dock principles.
- `docs/GRAPES_TOOLS_FINANCE_HOME_WIDGET_REDESIGN_20261023.md`: Home overview widgets + proposed module quick actions; Plant functionality separate.
- Runtime: `design/android-mobile-preview.html`, `src/android-mobile-shell.js`, `src/home/home-mobile.{js,css}`, `src/home/grapes-test-fresh-home.js`.

## Outcome
**NOT visually aligned yet.** Logic can be preserved and attached to the new Home widgets, but the existing shell and Home page structure are not interchangeable with the approved global rail and the proposed Home overview.

| Feature or visual requirement | Runtime #160 | #41 target and non-destructive integration |
| --- | --- | --- |
| Main navigation | Old landing grid, separate `hub-home` with `‹ Főmenü` and choices | App-shell-level six-icon, captionless top rail: Kezdő/Home/Health/Tools/Finance/Settings; no redundant Home/Back controls. **Implement once in outer shell**, not per Home child. |
| Heading | App-shell page header plus Home eyebrow `Home / Háztartás`, `Mi van otthon?`, descriptive subtitle; hub also has `Otthon` | One view title **Home** under the icon rail, ~22–24px; remove duplicate headings/decorative eyebrow only in a separately approved redesign TEST PR. |
| First view | `household` contains four tab controls: Készlet / Bevásárlólista / Mit főzzünk? / Blokkok; `hub-home` is an intermediary selection page | **Widget overview immediately on Home tab**: shopping list + inventory + Plants state (no invented data); current four functions remain accessible by meaningful widget actions/detail views, not four crowding global navigation. |
| Shopping list | Genuine checked/deferred/edited/deleted items, saves to owner-CAS | Show real open list items with direct check action in widget; keep details/list editor. Check does **not** add inventory. |
| Inventory | Real fridge/freezer/pantry lots, split, date label, prepared lots, undo | Real store counts and date warnings inside inventory widget; open existing inventory detail. Never use #41 demo counts (12/18) or mock expiration dates. |
| `Mit főzzünk?` | Read-only recipe hints, why-reason, user-confirmed cooking, prepared portions | **#41 candidate Home has NO recipe/advice widget.** Proposed extra widget or clearly identified button/section in inventory detail; add to reference only after explicit visual approval. Keep recipe validation, atomic CAS, user confirmation. |
| Prepared Food diary linking | Explicit linkage to existing own Food entry, durable source dedupe | Can live in prepared-lot detail/action; NEVER silently auto-consume or write diary; keep owner checks. |
| Finance receipt OCR | New `Blokkok` tab, own Finance image, OCR manual correction, source dedupe | Proposed **Blokkok** entry in inventory widget/detail (or a separately approved 4th Quick Action), not a competing global module. Preview and confirmation required; totals do not imply stock. PDF unsupported. |
| Plants | No built real plant inventory/tasks in #160 | #41 has illustrative Plants widget. In live UI show meaningful `not yet available`/empty state only; **never render demo plants, weather-driven tasks, or clickable `Új növény` that does nothing**. |
| Quick Action | Per-feature buttons embedded in content; no #41 Home contextual dock | Design proposal: `Listaelem / Készlet / Növény`. Final action set requires approval; until Plant works, omit/disable with explanation, do not advertise a fake action. Dock must be controlled by shell, safe-area-aware. |
| Palette and borders | `home-mobile.css`: `var(--surface)`, `var(--line)`, `var(--accent)` (mostly consistent generic accent), 16px cards, 26px Home title | Brand v1.2: `#090E14` background, `#101821` panel, `#17222E` raised, `#243343` line, `#3BDCF2` accent, ~19px widget corners, 12px spacing; short partial perimeter glow **only**, not a full neon halo. New semantic `--grapes-*` CSS tokens are NOT yet global runtime variables: use existing mobile token mapping until properly introduced. |
| Accessibility | Real buttons and many `role=tab`; existing focus visible | New rail 6 equal slots, 22/20px icon glyphs, aria-label/title, accessible full touch target; forms accessible, 320/360/390/412px no horizontal overflow, 44px minimum touch targets, keyboard/Android Back, TalkBack. |
| Data-security | Fiókos, native Auth owner-CAS, no legacy/Drive Finance reads | **Must not change** while adapting UI. No mixing owner/project state, no mutations from widget rendering, no auto-import and no cross-account DOM leakage. |

## Separate next steps – no implicit permission to implement the unapproved Home layout
1. Ask for explicit final **Home candidate** visual sign-off (the global six-icon rail is already approved, but the Home widget ordering/content/dock are PROPOSED). Review adding a **Mit főzzünk?** widget or inventory sub-section and receipt entry point. Plant quick action must reflect real availability.
2. Build a **TEST-only runtime visual-parity PR** based on the complete own-account Home chain ending at #160. Introduce the global navigation **in app shell** once, not by copying the reference `nav` into Home. Keep native Back; preserve actual Food/Finance/Water/E-book gating.
3. Wire widget buttons to the existing `createHomeMobile`/owner-CAS commands, not directly to stores, legacy data, Finance transactions, or new parallel APIs. Preserve explicit confirmations for CookingConfirmed, PreparedConsumptionLinked, StockReceived and undo semantics.
4. Check 320/360/390/412px reference-versus-TEST screenshot and responsive layout; no duplicate titles/back buttons, no dead/demo buttons, no scroll clipping under dock, no excessive halo, readable focus and contrast.
5. Run `npm test`, `npm run build:android-web`, `tests/grapes-test-fresh-owner-home.browser.mjs`, `tests/grapes-test-fresh-owner-home-mobile.browser.mjs`, reference browser tests and real Android TEST A→B→A / OCR. Only after user visual acceptance consider merge/APK.

**No visual-pixel parity claim is made here.** No screenshot of the actual #160 TEST runtime has yet been compared against #41 with identical viewport sizes. Functional CI green does not prove design parity. No M3/B family sync, proactive consumption pattern analysis or complete intelligent pantry reasoning exists yet.
