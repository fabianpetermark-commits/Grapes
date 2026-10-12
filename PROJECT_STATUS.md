# Grapes – központi projektállapot

Utolsó frissítés: 2026-10-12

Ez a Grapes modulokon átívelő elsődleges fejlesztési naplója. A részletes moduljegyzetek megmaradnak, de minden új, lezárt, parkolt vagy blokkolt munkát itt is át kell vezetni.

## Jelmagyarázat

- **Kész:** használható és ellenőrzött alapfunkció.
- **Folyamatban:** már van implementáció, de további ellenőrzés szükséges.
- **Parkol:** tudatosan félretett feladat.
- **Blokkolt:** külső feltétel vagy döntés nélkül nem zárható le.
- **Következő:** a modul javasolt következő fejlesztési blokkja.

## Közös platform

**Kész:** Google-bejelentkezés, `drive.file` projektmentés, modulválasztó, legutóbbi projektek, magyar/angol alkalmazáskeret.

**Kész:** fejlesztői menü és böngészőnkénti modulkapcsolók a `projectsoundmodel@gmail.com` Google-fiókhoz; a kikapcsolt modul látható, szürke és nem nyitható meg.

**Korlát:** a GitHub Pages statikus alkalmazás. A kliensoldali e-mail-kapu és a helyi kapcsolók nem szerveroldali biztonsági vagy globális feature-flag rendszer. Globális kapcsoláshoz hitelesített backend szükséges.

## Marketing

### E-mail Stúdió

**Kész:** vizuális/MJML szerkesztés, kódnézet, előnézet és export alapok.

**Következő:** külön, friss modul-audit szükséges.

### Brossúra Szerkesztő

**Kész:** Fabric-alapú szerkesztő és projektmentési alapok.

**Következő:** külön, friss modul-audit szükséges.

### QR Stúdió

**Kész:** QR-adatok, testreszabás és projektmentési alapok.

**Következő:** külön, friss modul-audit szükséges.

## 3D Nyomtatási Stúdió

**Kész:** mesh-alapú modellezési alapok és STL-munkafolyamat.

**Következő:** Pattern / Array.

**Parkol:** Bevel/Chamfer, Sketch, Sketch→Extrude, haladó modellezés, vertex/edge/face szerkesztés, modellvizsgálat, Print Prep és kényelmi bővítések.

**Technikai tartozás:** nagy STL-ek history-geometriájának memóriaoptimalizálása. Részletek: `3D_MODULE_STATUS.md`.

## E-book Könyvtár és Könyvszerkesztő

**Kész:** Drive-könyvtár, feltöltés, opcionális teljes Drive-olvasás, metaadatkezelés és e-olvasó átviteli alapok.

**Folyamatban:** repositoryban elkészült broker-módosítások külön telepítésre várnak; kiadás előtt ebook teszt és production build szükséges.

**Parkol:** USB-fájltípus-szűrés; Drive-megosztások visszavonása; aláírt EPUB kezelése; több olvasói mappa és lapozás; automatikus szöveges nézet.

**Ismert hiba:** az EPUB-megnyitás tartalmi böngészőtesztje hibás. Részletek: `GRAPES_BACKLOG.md`, `EBOOK_DEBUG_REPORT.md`, `CODEX_HANDOFF.md`.

## Pénzügy

### Pénzügyi Napló

**Kész:** bevételek, tényleges/tervezett kiadások, megtakarítások, kimutatások és kép-alapú nyugta-OCR alapok.

**Parkol:** összetett XLS/XLSX/XLSM/CSV import; kategória-tanulás; AI-alapú jelentésfelismerés; makróértelmezés; Excel-visszaírás; PDF-nyugta OCR.

**Nyitott döntés:** az import megtakarítási célokat is hozzon létre, vagy csak egy gyűjtőcél alá importáljon. Részletek: `GRAPES_BACKLOG.md`.

### Számla és árajánlat

**Kész:** ügyfél- és terméktár, dokumentumszerkesztési és mentési alapok.

**Következő:** külön, friss modul-audit szükséges.

## Food ételnapló

**Kész:** saját ételek, Open Food Facts, vonalkód, napló, célértékek, receptek, receptvariánsok, pillanatképek, statisztika, helyi és Drive-mentés; verziózott Health Connect/Samsung JSON-import előnézettel és `externalKey` deduplikációval; jóváhagyásos tápértékcímke-OCR; külön Drive-fájlos családi receptkönyvtár olvasó/szerkesztő jogosultsággal és visszavonással.

**Blokkolt:** az Android Health Connect POC forrása elkészült, de a gépen csak Java 8 található; JDK 17, Android SDK 35/Gradle és valódi Android-készülék nélkül a natív build, jogosultság-, történeti olvasás-, írás- és visszavonásteszt nem igazolható.

**Blokkolt:** közvetlen Samsung Health Data SDK vízadapter. A forrás elkészült, de a Samsung AAR, JDK 17/SDK 35 build, készülékteszt és nyilvános terjesztéshez a későbbi Samsung partnerjóváhagyás hiányzik.

**Ellenőrzés:** 209/209 teljes repository egységteszt, fejlesztői menü böngészőteszt, Food mobil böngészőteszt és production build sikeres.

**Következő:** Android Studio/JDK 17/SDK 35 környezetben valódi készülékteszt; sikeres eredmény nélkül a Grapes → Health Connect/Samsung Health képesség nem tekinthető késznek.

## Javasolt sorrend

1. Modulkapcsolók ellenőrzése a végleges fejlesztői e-maillel.
2. E-book ismert hibák és production kiadás lezárása.
3. Pénzügyi Excel-import első, jóváhagyásos változata.
4. 3D Pattern / Array.
5. Food Android készülékteszt, amikor újra napirendre kerül.
