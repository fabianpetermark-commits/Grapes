# Grapes Stúdió

Magyar nyelvű, böngészőben futó szerkesztőcsomag két modullal: egy Fabric.js
és Vite alapú brossúraszerkesztővel, valamint egy Three.js alapú
parametrikus 3D-szerkesztővel. Nyitáskor egy modulválasztó képernyő jelenik
meg, ahonnan bármelyik modul elérhető, és onnan is vissza lehet lépni.

Mindkét modul ugyanazt a sötét design systemet használja
(`src/styles/tokens.css`), és a szerkesztőmotorok dinamikus importtal
töltődnek be, így a nyitóképernyő nem fizeti meg egyikük indítását sem.

## Modulok

### Brossúra Szerkesztő

- Fabric.js alapú, szabad pozicionálású vászon (A4 fekvő)
- Alakzatok (téglalap, kör, vonal, nyíl, csillag) és szöveg
- Kitöltés: egyszínű, színátmenet vagy mintakép; körvonal, átlátszóság,
  elforgatás, vetett árnyék
- Méret px/cm/inch mértékegységben
- Betűtípus (rendszer- és Google-fontok) és betűméret
- Kijelöléskor megjelenő objektum-sáv: igazítás, rétegsorrend,
  csoportosítás, törlés
- Rétegek panel átrendezéssel és törléssel
- QR-kód generátor élő előnézettel
- Ingyenes képtár (Unsplash) tallózása és beillesztése (API-kulcs szükséges)
- Rács (snap-to-grid) és okos segédvonalak
- HTML- és SVG-fájl importálása
- Projekt mentése és betöltése JSON formátumban
- Visszavonás és ismétlés
- Kódnézet (CodeMirror), HTML-export és böngészős PDF-nyomtatás
- Nagyítás, lapra illesztés; billentyűzettel teljesen bejárható

A korábbi GrapesJS-motor a `?engine=grapes` URL-paraméterrel továbbra is
elérhető a régi projektekhez, de már nem az alapértelmezett, és nem kap
további fejlesztést.

### 3D Nyomtatási Stúdió

- Parametrikus alakzatok (kocka, henger, gömb) hozzáadása és törlése
- Szabad pozicionálás 3D mozgató-nyilakkal (drag), méret és szín elemenként
- Nézetváltás (elöl/hátul/izometrikus), drótváz mód
- STL-export (bináris) nyomtatásra kész exportáláshoz

## Telepítés

```bash
npm install
```

Az Unsplash-képtár tallózásához hozz létre egy ingyenes API-kulcsot a
[unsplash.com/developers](https://unsplash.com/developers) oldalon, majd
másold a `.env.example` fájlt `.env` néven, és írd be a kulcsot:

```bash
cp .env.example .env
# szerkeszd a .env fájlt, és add meg a VITE_UNSPLASH_ACCESS_KEY értékét
```

Kulcs nélkül a szerkesztő minden más funkciója változatlanul működik, csak
a képtár-tallózás jelez hibaüzenetet.

## Fejlesztői szerver

```bash
npm run dev
```

Windows rendszeren az [indit-szerver.cmd](./indit-szerver.cmd) dupla
kattintással elindítja a Vite szervert, majd megnyitja az alapértelmezett
böngészőt.

## Éles build

```bash
npm run build
```

## Licenc

A projekt MIT licenc alatt érhető el. Részletek a [LICENSE](./LICENSE) fájlban.
