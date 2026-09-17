# Architektúra

Rövid, karbantartandó leírás arról, hogyan áll össze a UI. Új munka
megkezdése előtt érdemes elolvasni.

## Rétegek

```
index.html            négy képernyő markupja + beágyazott SVG ikon-sprite
src/main.js           belépőpont: stílus betöltése + képernyőváltás bekötése
src/screens.js        showScreen(name) — adatvezérelt képernyőváltó
src/ui/               keretrendszer-független interakciós primitívek
src/styles/           design system (tokenek + komponens-CSS)
src/brochure-fabric/  az alapértelmezett brossúra-motor (Fabric.js)
src/brochure-grapes/  legacy GrapesJS-motor (?engine=grapes), befagyasztva
src/studio.js         3D Nyomtatási Stúdió (Three.js)
```

## Szabályok

**Nyers érték csak `src/styles/tokens.css`-ben lehet.** Minden más
stílusfájl `var(--…)`-ot használ. Ellenőrzés:

```bash
grep -rnE '#[0-9a-fA-F]{3,6}|rgba?\(' src/styles --include='*.css' | grep -v tokens.css
```

A `legacy-grapes.css` és a `screens/legacy.css` kivétel: ezek a
befagyasztott GrapesJS-motor stílusai, szándékosan érintetlenek.

**Rétegsorrend.** A `--z-*` tokenek az egyetlen forrás (`z-base` …
`z-toast`). Ne írj nyers `z-index` értéket.

**Képernyőváltás.** Mindig `showScreen(name)`-en keresztül. A `SCREENS`
map tartalmazza a képernyő azonosítóját és a lusta betöltőjét; minden más
képernyő automatikusan rejtve lesz. Ne kapcsolgass `.hidden` osztályt
kézzel — pontosan az ilyen, kézzel karbantartott listából maradt ki
korábban a `#fabric-app`, amitől a 3D stúdió elérhetetlenné vált.

**Lusta betöltés.** A szerkesztőmotorok és a stúdió `import()`-tal
érkeznek, és a saját CSS-üket maguk importálják. A belépő bundle emiatt
néhány kB. Ne tegyél statikus importot `main.js`-be vagy `screens.js`-be
egy nagy függőségre.

**DOM-elérés.** `el('#id')` a `src/ui/dom.js`-ből: hiányzó elemnél dob,
nem `null`-t ad. A markup és a JS ~100 azonosítón keresztül kapcsolódik,
ezért a néma `null` korábban rejtve maradó hibákat okozott.

**Átfedő rétegek.** Modal: `src/ui/modal.js`. Mobil fiók: az `is-open`
osztály plusz `inert` a zárt panelen. Mindkettő a `src/ui/overlay.js`
fókuszcsapdáját használja (Escape, fókusz-visszaállítás, scroll-lock).
Ne írj új, saját overlayt.

**Visszajelzés.** `notify` / `notifySuccess` / `notifyError` a
`src/ui/toast.js`-ből. `window.alert()` nem használható — blokkol, és
mobilon különösen zavaró.

**Ikonok.** Az `index.html` `#icon-sprite` blokkjában lévő
`<symbol id="i-…">` elemek. Funkcionális gombon nincs emoji; minden
ikonos gomb `aria-label`-t kap.

**Akadálymentesség.** Fókuszgyűrű globálisan a `base.css`
`:focus-visible` szabályából — ne tüntesd el. Új dialógusnak `role` és
`aria-modal` kell, ikongombnak `aria-label`.

## Ismert, szándékosan nyitva hagyott pontok

- `brochure-fabric/html-import.js`: az importált HTML `innerHTML`-lel a
  valódi `document.body`-ba kerül, egyetlen `<script>` regex a teljes
  szanitizálás. Sandboxolt iframe vagy rendes sanitizer kellene.
- `brochure-fabric/history.js`: minden mozgatás teljes
  `JSON.stringify(canvas.toJSON())`-t készít, base64 képekkel, 50 mélységig.
- Az A4-méret (1123×794) több fájlban be van égetve.
- A GrapesJS-motor saját hibái (igazítás nagyításnál, előnézet-állapot,
  hiányzó Font Awesome) szándékosan javítatlanok.
