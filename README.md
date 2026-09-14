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

## Backend API

A külön futtatható Node.js backend SQLite-ban tárolja a GrapesJS projekteket,
képeket optimalizál, és Playwright segítségével PDF-et generál.

```bash
npm run server
# fejlesztéshez:
npm run server:dev
# ellenőrzés:
npm run test:server
```

Az API alapértelmezés szerint a `http://localhost:3001` címen érhető el.
`PORT` és `DATA_DIR` környezeti változóval módosítható. Ha az `API_KEY`
be van állítva, az `/api` végpontokhoz `x-api-key` vagy `Authorization:
Bearer <kulcs>` fejléc szükséges (a `/api/health` végpont nyilvános).

Végpontok: `GET/POST/PUT/DELETE /api/projects`, `POST /api/uploads`
(JPEG/PNG/WebP/GIF, alapértelmezetten legfeljebb 5 MB), valamint
`POST /api/projects/:id/pdf`. A PDF végpont használatához a Playwright
Chromium böngészőjét is telepíteni kell: `npx playwright install chromium`.

## Licenc

A projekt MIT licenc alatt érhető el. Részletek a [LICENSE](./LICENSE) fájlban.
