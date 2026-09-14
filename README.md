# Brossúra és PDF szerkesztő

Magyar nyelvű, böngészőben futó brossúraszerkesztő GrapesJS és Vite
alapokon. A projekt A4-es brossúra-oldalak vizuális szerkesztését, HTML- és
JSON-projektek kezelését, valamint böngészős PDF-nyomtatást biztosít.

## Funkciók

- GrapesJS vizuális szerkesztő
- A4 fekvő, hárompaneles brossúra-sablon
- Többoldalas projektstruktúra
- Alap blokkok, rétegek és stíluskezelés
- HTML-fájl megnyitása és szerkesztése
- Projekt mentése és betöltése JSON formátumban
- Visszavonás és ismétlés
- Böngészős PDF-nyomtatás és mentés
- Helyi automatikus mentés

## Telepítés

```bash
npm install
```

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
