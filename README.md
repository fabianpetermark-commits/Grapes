# Brossúra és PDF szerkesztő

Magyar nyelvű, böngészőben futó brossúraszerkesztő GrapesJS és Vite
alapokon. A projekt A4-es brossúra-oldalak vizuális szerkesztését, HTML- és
JSON-projektek kezelését, valamint nyomtatáson keresztüli PDF-mentést biztosít.

## Funkciók

- GrapesJS vizuális szerkesztő
- A4 fekvő, hárompaneles brossúra-sablon
- Többoldalas projektstruktúra külső és belső oldallal
- Alap blokkok, rétegek és stíluskezelés
- HTML-fájl megnyitása
- GrapesJS projekt mentése és betöltése JSON formátumban
- Visszavonás és ismétlés
- PDF-nyomtatás és mentés a böngésző nyomtatási ablakán keresztül
- Lokális automatikus mentés

## Telepítés

```bash
npm install
```

## Fejlesztői szerver

```bash
npm run dev
```

Windows rendszeren az [indit-szerver.cmd](./indit-szerver.cmd) dupla
kattintással is elindítja a szervert, majd megnyitja az alapértelmezett
böngészőt.

## Éles build

```bash
npm run build
```

## Licenc

A projekt MIT licenc alatt érhető el. Részletek a [LICENSE](./LICENSE) fájlban.
