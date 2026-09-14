# Brossúra és PDF szerkesztő

Magyar nyelvű, böngészőben futó brossúraszerkesztő GrapesJS és Vite
alapokon. A projekt A4-es brossúra-oldalak vizuális szerkesztését, HTML- és
JSON-projektek kezelését, valamint böngészős PDF-nyomtatást biztosít.

## Funkciók

- GrapesJS vizuális szerkesztő
- A4 fekvő, hárompaneles brossúra-sablon
- Többoldalas projektstruktúra
- Alap blokkok, rétegek és stíluskezelés
- Szabadon pozicionálható, átméretezhető alakzatok (téglalap, kör, vonal,
  nyíl, csillag) saját szín/körvonal beállítással
- QR-kód generátor és beillesztés
- Ingyenes képtár (Unsplash) tallózása és beillesztése (API-kulcs szükséges)
- Igazítás, rács (snap-to-grid) és réteg-sorrend (előre/hátra hozás)
- HTML-fájl megnyitása és szerkesztése
- Projekt mentése és betöltése JSON formátumban
- Visszavonás és ismétlés
- Böngészős PDF-nyomtatás és mentés
- Helyi automatikus mentés

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
