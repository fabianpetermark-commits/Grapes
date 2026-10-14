# Grapes – egyesített fejlesztési backlog

Utolsó frissítés: 2026-10-14

Ez az elsődleges lista a még el nem kezdett, parkolt vagy külső feltétel miatt blokkolt munkákhoz. A kész funkciók a `PROJECT_STATUS.md` fájlban, a részletes műszaki jegyzetek a modulonkénti dokumentumokban maradnak.

## P0 – kiadás és hozzáférés

- [ ] Központi, szerveroldali felhasználói jogosultságkezelés. A fejlesztői menü jelenlegi felhasználólistája az admin Google Drive-jában vezetett nyilvántartás; önmagában még nem tiltja le a bejelentkezést.
- [ ] Globális modulkapcsolók hitelesített backenddel. A jelenlegi kapcsolók böngészőnkénti előnézeti beállítások.
- [ ] E-book broker production telepítésének és az izolált EPUB write pilotnak a lezárása.
- [ ] Az ismert EPUB-megnyitási böngészőteszt javítása.

## P1 – következő fejlesztési blokkok

### Android alkalmazás – telefonos UI

Szerkeszthető Figma-terv: https://www.figma.com/design/02WS3MuvHQ9OMyfUu7KABN

- [ ] A Figma mobil UI terv felhasználói átnézése és véglegesítése.
- [ ] Android-specifikus alkalmazáskeret bevezetése úgy, hogy a webes nézet változatlan maradjon.
- [ ] Telefonos belépési képernyő megvalósítása, helyi mód és Google-belépés állapotaival.
- [ ] Telefonos kezdőlap, alsó navigáció, legutóbbi projektek és modulindító kártyák megvalósítása.
- [ ] Projektek képernyő: keresés, kétoszlopos kártyarács és új projekt művelet.
- [ ] Szinkron képernyő: helyi mentési állapot, eszközök és Google Drive kapcsolat.
- [ ] Ételnapló mintamodul telefonos nézetének megvalósítása.
- [ ] A többi modul egységes mobilmintáinak megtervezése és fokozatos átültetése.
- [ ] Végső telefonos akadálymentességi, érintési célméret-, görgetési és valódi készülékteszt.
- [ ] Végleges Grapes alkalmazásikon és logó elkészítése.

### 3D Nyomtatási Stúdió

- [ ] Pattern / Array: X/Y/Z irány, darabszám, távolság, több kijelölés és csoportok, egyetlen Undo-lépés.
- [ ] Bevel / Chamfer és robusztusabb primitív-geometria frissítés.
- [ ] Sketch alapok, majd Sketch → Extrude.
- [ ] Nagy STL-ek history-geometriájának memóriaoptimalizálása.

### E-book

- [ ] USB-szinkron fájltípus-szűrése.
- [ ] Korábban kiosztott Drive-megosztások áttekintése és visszavonása.
- [ ] Aláírt EPUB biztonságos elutasítása vagy külön kezelése.
- [ ] Több olvasói könyvtármappa és lapozott fájllista.
- [ ] Megnyitáskor automatikus váltás a szöveges nézetre.

### Pénzügy

- [ ] Automatikus kategória-tanulás az importált tételekből.
- [ ] AI-alapú jelentésfelismerés és PDF-nyugta OCR.
- [ ] XLSM makrók biztonságos értelmezési terve; makró futtatása továbbra sem megengedett.
- [ ] Excel-visszaírás külön, jóváhagyásos exportként.
- [ ] Termékdöntés: megtakarítási célok automatikus létrehozása vagy közös „Importált megtakarítás” cél.

### Food ételnapló

- [ ] Health Connect Android build JDK 17 + Android SDK 35 környezetben.
- [ ] Valódi Android-készülékteszt: engedélyek, történeti olvasás, írás és visszavonás.
- [ ] Samsung Health Data SDK AAR beszerzése, adapter build és készülékteszt.
- [ ] Nyilvános Samsung-integráció előtt partnerjóváhagyás.

## P2 – modul-auditok

- [ ] E-mail Stúdió friss funkcionális és mobil audit.
- [ ] Brossúra Szerkesztő friss funkcionális és export-audit.
- [ ] QR Stúdió friss funkcionális és akadálymentességi audit.
- [ ] Számla és árajánlat friss funkcionális és PDF-audit.

## P3 – későbbi 3D roadmap

- [ ] Haladó modellezés: loft, sweep és további mesh-műveletek.
- [ ] Vertex / edge / face szerkesztés és mesh-javítás.
- [ ] Részletes modellinformáció: térfogat, felület, tömeg és hibajelzések.
- [ ] Print Prep: orientáció, overhang, falvastagság, support, layer preview és szeletelő-integráció.
- [ ] Kameraállások, objektum lock/hide, grid és precision beállítások, projektmentés/betöltés.

## Karbantartási szabály

Új ötlet vagy elhalasztott feladat először ide kerüljön. Amikor munka indul rajta, kapjon `Folyamatban` bejegyzést a `PROJECT_STATUS.md` fájlban; lezáráskor innen törlendő és a kész állapotba átvezetendő.
