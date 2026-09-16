# Task — UI újraépítés

- [x] **0. P0 hotfixek** — `#fabric-app.hidden` (A), toolbar `flex-wrap` (B),
      PDF print load-race mindkét motoron (F), főmenü `max-height` (H). `9b6db03`
- [x] **1. Stílusváz + tokenek** — `src/styles/{index,tokens,reset,base}.css`;
      a 866 soros inline `<style>` átemelve `screens/legacy.css`-be. `3a07b39`
- [x] **2. Interakciós réteg** — `src/ui/{dom,overlay,modal,toast}.js`;
      `brochure-fabric/modal.js` törölve; a Fabric ág összes `window.alert()`-je
      toastra cserélve; QR-előnézet megjavítva (G); PDF tainted-canvas kezelés;
      Kódnézet CodeMirror-felszabadítás. A `main.js` alertjei a 9. lépésben
      megszűnő legacy ágon maradnak.
- [ ] **3. Gomb + ikon** — `button.css`, `icon.css`, `public/ui-icons.svg`;
      `.tb-btn` → `.btn`, emoji → SVG
- [ ] **4. Héj Gridre** — `toolbar/panel/accordion/field` CSS; `--toolbar-h`
      hack törölve; vászon overflow (C) + `ResizeObserver` (D)
- [ ] **5. Objektum-sáv** — igazítás/z-sorrend/csoport a vászon fölé,
      mobilon is elérhetően
- [ ] **6. Drawer-réteg** — `drawer.js` + `drawer.css`, `setupMobilePanels()` ki
- [ ] **7. Panelek** — üres állapot, nincs teljes újraépítés, mezők témázása,
      J/K/L/M javítások
- [ ] **8. Modulválasztó** — `.module-card` `<div>` → `<button>`, glow nélkül
- [ ] **9. Fabric = alapértelmezett** — `main.js` szétbontása, GrapesJS lazy
- [ ] **10. Tailwind ki + 3D stúdió** — `studio.css`, markup átírás, E és N
- [ ] **11. Takarítás** — dead code, `legacy.css` felszámolása

## Kézi verifikáció (minden lépés után)

`npm run build` zöld, majd `npm run dev`:

1. Nyitó → Brossúra → a Fabric szerkesztő nyílik
2. Nyitó → 3D Stúdió → **a stúdió nyílik** (nem az üres Fabric szerkesztő)
3. Alakzatok, szöveg, kép, QR, Unsplash, HTML/SVG import
4. Kijelölés → objektum-sáv; igazítás, z-sorrend, csoport
5. Tulajdonságpanel minden mezője
6. Undo/redo, mentés→betöltés, PDF (**a print tényleg elindul**), HTML export,
   Kódnézet (zárás után nincs CodeMirror-példány)
7. Zoom −/+/100%/lapra illesztés; ablakátméretezésre a vászon középen marad
8. Billentyűzet: Tab a nyitókártyákig, fókuszgyűrű mindenhol, modal Escape +
   fókusz-visszaállítás
9. 375 / 768 / 1024 / 1440px: nincs vízszintes görgetés, a fiókok oldalról
   csúsznak, az igazítás mobilon is elérhető
