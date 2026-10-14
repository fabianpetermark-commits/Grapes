# Grapes – központi projektállapot

Utolsó frissítés: 2026-10-14

Ez a Grapes modulokon átívelő elsődleges fejlesztési naplója. A részletes moduljegyzetek megmaradnak, de minden új, lezárt, parkolt vagy blokkolt munkát itt is át kell vezetni.

## Jelmagyarázat

- **Kész:** használható és ellenőrzött alapfunkció.
- **Folyamatban:** már van implementáció, de további ellenőrzés szükséges.
- **Parkol:** tudatosan félretett feladat.
- **Blokkolt:** külső feltétel vagy döntés nélkül nem zárható le.
- **Következő:** a modul javasolt következő fejlesztési blokkja.

## Közös platform

**Kész:** Google-bejelentkezés, `drive.file` projektmentés, modulválasztó, legutóbbi projektek, magyar/angol alkalmazáskeret.

**Kész:** fejlesztői menü a `projectsoundmodel@gmail.com` Google-fiókhoz, külön négyjegyű PIN-kapuval és sárga–fekete aktív mód jelzéssel; böngészőnkénti modulkapcsolók; a kikapcsolt modul látható, szürke és nem nyitható meg.

**Kész:** a fejlesztői menüben olvasható és letölthető `PROJECT_BACKLOG.md`, valamint hozzáadható/eltávolítható, az admin Google Drive-jába mentett felhasználói nyilvántartás.

**Korlát:** a GitHub Pages statikus alkalmazás. A kliensoldali e-mail- és PIN-kapu, a felhasználói nyilvántartás és a helyi kapcsolók nem szerveroldali biztonsági, belépést tiltó vagy globális feature-flag rendszer. Ezekhez hitelesített backend szükséges.

**Folyamatban:** elkészült az Android-only telefonos UI első terve és az APK-ba csomagolt, Androidon külön kártyáról indítható interaktív előnézete. A próbanézet Food, Víz, Samsung Health kapcsolati állapot és E-book folyamatokat tartalmaz; a webes nézet változatlan marad. A felület még nem az alapértelmezett production shell. Terv: https://www.figma.com/design/02WS3MuvHQ9OMyfUu7KABN

**Kész:** az Android app a háttérben hatóránként ellenőrzi az új aláírt GitHub Release-t, és engedély esetén rendszerértesítést küld; az értesítés a meglévő, SHA-256-tal ellenőrzött frissítési folyamatba vezet.

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

**Kész:** bevételek, tényleges/tervezett kiadások, megtakarítások, kimutatások, kép-alapú nyugta-OCR alapok, valamint jóváhagyásos XLS/XLSX/XLSM/CSV munkafüzet-import több munkalap és adatblokk felismerésével.

**Parkol:** kategória-tanulás; AI-alapú jelentésfelismerés; makróértelmezés; Excel-visszaírás; PDF-nyugta OCR.

**Nyitott döntés:** az import megtakarítási célokat is hozzon létre, vagy csak egy gyűjtőcél alá importáljon. Részletek: `GRAPES_BACKLOG.md`.

### Számla és árajánlat

**Kész:** ügyfél- és terméktár, dokumentumszerkesztési és mentési alapok.

**Következő:** külön, friss modul-audit szükséges.

## Food ételnapló

**Kész:** saját ételek, Open Food Facts, vonalkód, napló, célértékek, receptek, receptvariánsok, pillanatképek, statisztika, helyi és Drive-mentés; verziózott Health Connect/Samsung JSON-import előnézettel és `externalKey` deduplikációval; jóváhagyásos tápértékcímke-OCR; külön Drive-fájlos családi receptkönyvtár olvasó/szerkesztő jogosultsággal és visszavonással.

**Blokkolt:** az Android Health Connect POC forrása elkészült, de a gépen csak Java 8 található; JDK 17, Android SDK 35/Gradle és valódi Android-készülék nélkül a natív build, jogosultság-, történeti olvasás-, írás- és visszavonásteszt nem igazolható.

**Blokkolt:** közvetlen Samsung Health Data SDK vízadapter. A forrás elkészült, de a Samsung AAR, JDK 17/SDK 35 build, készülékteszt és nyilvános terjesztéshez a későbbi Samsung partnerjóváhagyás hiányzik.

**Ellenőrzés:** 211/211 teljes repository egységteszt, fejlesztői menü böngészőteszt, Food mobil böngészőteszt és production build sikeres.

**Következő:** Android Studio/JDK 17/SDK 35 környezetben valódi készülékteszt; sikeres eredmény nélkül a Grapes → Health Connect/Samsung Health képesség nem tekinthető késznek.

## Javasolt sorrend

1. Hitelesített backend a globális felhasználó- és moduljogosultságokhoz.
2. E-book ismert hibák és production kiadás lezárása.
3. 3D Pattern / Array.
4. Food Android készülékteszt, amikor újra napirendre kerül.
