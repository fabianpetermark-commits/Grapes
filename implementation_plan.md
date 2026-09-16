# Implementation Plan — Grapes Stúdió UI újraépítés

## Cél

Egységes, nyugodt profi sötét design system (tokenek + komponens-CSS), ráhúzva
a Fabric brossúra-szerkesztőre mint az app fő felületére; a törött interakciók
(modal, drawer, hibajelzés, resize) megjavítva; akadálymentességi alapok.

## Elfogadott döntések

| Kérdés | Döntés |
|---|---|
| Mérték | Teljes UI-újraépítés |
| Prioritás | Fabric brossúra-szerkesztő |
| Eszközök | Desktop-first, mobil használható |
| Stílus | Sötét téma alapértelmezetten, nem neon |
| Motor | Fabric az alapértelmezett; GrapesJS `?engine=grapes` legacy, lazy-loadolva |
| CSS | Sima CSS design tokenekkel, Tailwind kikerül |

## Kiinduló hibák (felderítve, bizonyítékkal)

| # | Hiba | Hely |
|---|---|---|
| A | 3D Stúdió elérhetetlen — nincs `#fabric-app.hidden` szabály | `index.html:117` |
| B | Fabric toolbar levágódik ~1500px alatt | `index.html:307` |
| C | Nagyított vászon bal/felső része nem görgethető | `index.html:557` |
| D | Nincs resize-kezelés a vásznon | `editor.js:51` |
| E | 3D nézet torz marad; render-loop sosem áll le | `studio.js:146,170` |
| F | PDF-nyomtatás nem indul (load-race) | `pdf-export.js:34` |
| G | QR-előnézet sosem látszik | `qr.js:48` |
| H | Főmenü kifuthat a képernyőről | `index.html:242` |
| I | `fa fa-*` ikonok, Font Awesome nincs betöltve | `main.js:352` |
| J | Tulajdonságpanel minden leütésre alkalmaz | `properties.js:244` |
| K | Többes kijelölés az `ActiveSelection` burkolóra hat | `properties.js:171` |
| L | Színmezők feketét mutatnak nem-hex értékre | `properties.js:34` |
| M | Betűtípus-vezérlő csak `textbox`-ra | `properties.js:159` |
| N | 3D elem átméretezéskor besüllyed | `studio.js:225` |

Hatókörön kívül (külön feladat): HTML-import XSS (`html-import.js:200`),
undo/redo memóriahasználat (`history.js:16`), A4-méret öt fájlban beégetve,
letöltés-idióma, GrapesJS-specifikus hibák.

## Fájlok

### [NEW]

```
src/styles/index.css                 belépőpont, csak @import
src/styles/tokens.css                design tokenek — az egyetlen nyers érték
src/styles/reset.css
src/styles/base.css                  tipográfia, :focus-visible, scrollbar
src/styles/components/*.css          button, icon, toolbar, panel, accordion,
                                     field, swatch, layer, modal, drawer,
                                     toast, menu, empty-state, card, objectbar
src/styles/screens/{splash,brochure,studio}.css
src/styles/screens/legacy.css        átmeneti: a régi inline <style>, ürül
src/ui/dom.js                        el() — hiányzó elemnél dob
src/ui/overlay.js                    Escape, fókuszcsapda, scroll-lock
src/ui/modal.js
src/ui/drawer.js
src/ui/toast.js
src/ui/icon.js
public/ui-icons.svg                  SVG sprite (~30 ikon)
src/brochure-grapes/editor.js        a mai main.js GrapesJS-része
```

### [MODIFY]

```
index.html                           <style> blokk kivéve; markup újraépítve
src/main.js                          bootstrap + showScreen(); GrapesJS lazy
src/brochure-fabric/editor.js        héj, objectbar, resize, drawer
src/brochure-fabric/panels/*.js      J/K/L/M javítások, üres állapot
src/brochure-fabric/{qr,unsplash,code-view,pdf-export}.js   új modal/toast
src/studio.js                        Tailwind helyett komponensosztályok; E, N
package.json, vite.config.js         tailwind kivétele
```

### [DELETE]

```
src/tailwind.css      src/style.css (→ styles/legacy-grapes.css)
src/counter.js        src/assets/{hero.png,javascript.svg,vite.svg}
public/icons.svg      src/styles/screens/legacy.css (a végén)
```

## Verifikáció

`npm run build` minden lépés után (a CI egyetlen kapuja).
Kézi checklist: lásd `task.md` végét.
