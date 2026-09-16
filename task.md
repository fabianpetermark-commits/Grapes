# Task — UI újraépítés

Minden lépés kész, mindegyik után zöld `npm run build` és böngészős ellenőrzés.

- [x] **0. P0 hotfixek** — `#fabric-app.hidden` (A), toolbar `flex-wrap` (B),
      PDF print load-race mindkét motoron (F), főmenü `max-height` (H). `9b6db03`
- [x] **1. Stílusváz + tokenek** — `src/styles/{index,tokens,reset,base}.css`;
      a 866 soros inline `<style>` kiemelve. `3a07b39`
- [x] **2. Interakciós réteg** — `src/ui/{dom,overlay,modal,toast}.js`; a Fabric
      ág alertjei toastra; QR-előnézet (G); PDF tainted-canvas; CodeMirror
      felszabadítás. `15292b7`
- [x] **3–6. Héj, ikonok, objektum-sáv, fiókok** — SVG sprite, `.btn`, CSS Grid
      héj, `--toolbar-h` hack törölve, vászon-túlcsordulás (C), `ResizeObserver`
      (D), kontextuális objektum-sáv, `inert` fiókok. `071c4a2`
- [x] **7. Panelek** — J/K/L/M javítások, rétegpanel nem épül újra, üres
      állapot, semleges alapértelmezett kitöltés. `fa22209`
- [x] **8. Modulválasztó** — `<div>` → `<button>`, glow nélkül. `18d4b66`
- [x] **9. Fabric = alapértelmezett** — `main.js` 1028 → 21 sor, GrapesJS lusta
      betöltéssel, `screens.js` képernyőváltó. Belépő bundle 1228 kB → 3,6 kB.
      `1cf4088`
- [x] **10. Tailwind ki + 3D stúdió** — közös komponensekre átírva; E és N
      javítások, render-loop leállítás, deselect, STL-letöltés hibakezelés.
      `426c0c5`
- [x] **11. Takarítás** — halott fájlok törölve, legacy CSS a legacy modulhoz
      kötve, README és `system_architecture.md` frissítve.

## Kézi verifikáció (Chromium, 1440px és 390px)

| Ellenőrzés | Eredmény |
|---|---|
| Nyitó → Brossúra → a Fabric szerkesztő nyílik | ✔ |
| Nyitó → 3D Stúdió → **a stúdió nyílik** (korábban az üres Fabric szerkesztő) | ✔ |
| Objektum-sáv csak kijelöléskor; igazítás/z-sorrend/csoport működik | ✔ |
| Zoom −/+/100%/lapra illesztés; átméretezésre újraillesztés | ✔ |
| QR élő előnézet; modal Escape-re zár, fókusz visszatér a nyitó gombra | ✔ |
| Overflow-menü Escape-re zár | ✔ |
| Tab a nyitókártyákig, Enterrel belép | ✔ |
| Mobil: fiókok oldalról, zárt fiók `inert`, igazítás elérhető | ✔ |
| Nincs vízszintes görgetés 390 / 768 / 1024 / 1440px-en | ✔ |
| Stúdió: elem hozzáadás, drótváz `aria-pressed`, főmenübe vissza | ✔ |
| Nincs konzolhiba (a sandbox proxy Google Fonts-hibáin kívül) | ✔ |
| `npm run build` | ✔ |

## Nem ellenőrizhető ebben a környezetben

- Tényleges PDF-nyomtatás (a print-dialógus fejlécnélküli böngészőben nem nyílik)
- Unsplash-keresés (nincs API-kulcs, és a sandbox blokkolja a kimenő kérést)
- Google Fonts betűtípusok betöltése (a proxy blokkolja)
