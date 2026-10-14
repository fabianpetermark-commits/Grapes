# Grapes – egyesített fejlesztési backlog

Utolsó frissítés: 2026-10-14

Ez az elsődleges lista a még el nem kezdett, parkolt vagy külső feltétel miatt blokkolt munkákhoz. A kész funkciók a `PROJECT_STATUS.md` fájlban, a részletes műszaki jegyzetek a modulonkénti dokumentumokban maradnak.

## P0 – kiadás és hozzáférés

- [ ] Központi, szerveroldali felhasználói jogosultságkezelés. A fejlesztői menü jelenlegi felhasználólistája az admin Google Drive-jában vezetett nyilvántartás; önmagában még nem tiltja le a bejelentkezést.
- [ ] Globális modulkapcsolók hitelesített backenddel. A jelenlegi kapcsolók böngészőnkénti előnézeti beállítások.
- [x] E-book broker repository-verziójának production telepítése és élő health ellenőrzése (API v19).
- [ ] Az izolált EPUB write pilot valódi Google-fiókos elfogadási próbája.
- [ ] Az ismert EPUB-megnyitási böngészőteszt javítása.

## P1 – következő fejlesztési blokkok

### Android alkalmazás – telefonos UI

Az első terv az APK-ban futó HTML/CSS előnézetként szerkeszthető tovább; a Figma használata opcionális, nem feltétele a megvalósításnak. Meglévő Figma-terv: https://www.figma.com/design/02WS3MuvHQ9OMyfUu7KABN

- [ ] A mobil UI felhasználói átnézése és vizuális véglegesítése közvetlenül az Android-előnézetben, Figma nélkül is.
- [x] Android-specifikus mobil UI előnézet csomagolása és app-only indítókártya úgy, hogy a webes nézet változatlan maradjon.
- [x] Android rendszerértesítés az új, aláírt GitHub Release-ekről háttér-ellenőrzéssel.
- [x] Friss kiadás ellenőrzése minden alkalmazásindításkor; a hatórás korlát csak a háttérellenőrzésre vonatkozik.
- [ ] Android Google-bejelentkezés regisztrációs hibájának (`UNREGISTERED_ON_API_CONSOLE`) javítása és valódi készüléktesztje.
- [ ] Google Drive bejelentkezés, projektmentés és visszatöltés teljes Android készüléktesztje.
- [x] A jóváhagyott mobil UI alapértelmezett Android alkalmazáskeretté alakítása.
- [x] Telefonos belépési képernyő megvalósítása, helyi mód és Google-belépés állapotaival.
- [ ] A bejelentkezési képernyő visszaállítása az Android appban, valamint mindig elérhető Kijelentkezés / fiókváltás útvonal hozzáadása a kezdőlapról és a beállításokból.
- [x] Telefonos kezdőlap, alsó navigáció, legutóbbi projektek és modulindító kártyák megvalósítása.
- [x] Projektek képernyő: keresés, helyi gyorsindítók és Drive-projektlista.
- [x] Szinkron képernyő: valós helyi projektszám és tárhely, függő mentések, utolsó ellenőrzés, Drive-állapot és kézi frissítés.
- [x] Ételnapló csiszolt telefonos áttekintője és a teljes Food modul Android-only mobilrétege nagy érintési célokkal, mobil űrlapokkal és alsó ellenőrző panelekkel.
- [x] E-book teljes Android-only mobilfelülete a könyvtártól a metaadat-, szöveg- és szerkezeti szerkesztésig.
- [x] Pénzügyi Napló teljes Android-only mobilfelülete kártyás áttekintéssel, mobil űrlapokkal és gyors tételrögzítéssel.
- [x] Víznapló valódi, dátum szerint helyben mentett Android-modullá alakítása szerkeszthető céllal és törölhető bejegyzésekkel.
- [ ] A többi modul egységes mobilmintáinak megtervezése és fokozatos átültetése.
- [ ] Végső telefonos akadálymentességi, érintési célméret-, görgetési és valódi készülékteszt.
- [x] Végleges Grapes vektorlogó és natív Android adaptive alkalmazásikon elkészítése.

### 3D Nyomtatási Stúdió

- [ ] Pattern / Array: X/Y/Z irány, darabszám, távolság, több kijelölés és csoportok, egyetlen Undo-lépés.
- [ ] Bevel / Chamfer és robusztusabb primitív-geometria frissítés.
- [ ] Sketch alapok, majd Sketch → Extrude.
- [ ] Nagy STL-ek history-geometriájának memóriaoptimalizálása.

### E-book

- [x] USB-szinkron fájltípus-szűrése.
- [ ] Korábban kiosztott Drive-megosztások áttekintése és visszavonása.
- [x] Aláírt EPUB biztonságos elutasítása.
- [x] Több olvasói könyvtármappa és lapozott fájllista.
- [x] Megnyitáskor automatikus váltás a szöveges nézetre.

### Pénzügy

- [ ] Automatikus kategória-tanulás az importált tételekből.
- [ ] AI-alapú jelentésfelismerés és PDF-nyugta OCR.
- [ ] XLSM makrók biztonságos értelmezési terve; makró futtatása továbbra sem megengedett.
- [ ] Excel-visszaírás külön, jóváhagyásos exportként.
- [ ] Termékdöntés: megtakarítási célok automatikus létrehozása vagy közös „Importált megtakarítás” cél.

### Food ételnapló

- [x] Aláírt Health Connect Android build GitHub Actionsben JDK 17 + Android SDK környezetben.
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
