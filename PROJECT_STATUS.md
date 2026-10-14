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

**Kész:** az Android app alapértelmezett felülete a telefonos Grapes shell: belépés/helyi mód, kezdőlap, alsó navigáció, kereshető projektlista, Drive-projektek és modulindítás. A Szinkron képernyő valódi helyi projektszámot, tárhelyhasználatot, Drive-projektszámot, függő mentést és utolsó ellenőrzést mutat. A Food, az E-book teljes könyvtár- és szerkesztőfolyamata, valamint a Pénzügyi Napló teljes modulja külön Android-stílusréteget kapott; a Víz dátum szerint helyben mentett bejegyzésekkel és állítható céllal működik. A webes nézet változatlan maradt. A felület közvetlenül HTML/CSS-ben, Figma nélkül is továbbfejleszthető. Terv: https://www.figma.com/design/02WS3MuvHQ9OMyfUu7KABN

**Kész:** a meglévő Grapes vektorlogóból natív Android adaptive ikon készült, sötét rendszer-sávokkal illesztve a mobil shellhez.

**Kész:** az Android app minden indításkor frissen ellenőrzi az új aláírt GitHub Release-t, a háttérben pedig hatóránként ellenőriz; engedély esetén rendszerértesítést küld, amely a meglévő, SHA-256-tal ellenőrzött frissítési folyamatba vezet.

**Ismert Android-hiba:** a Google-bejelentkezés `UNREGISTERED_ON_API_CONSOLE` hibával megszakad, ezért a Drive-kapcsolatot is újra kell konfigurálni és valódi készüléken végigtesztelni.

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

**Kész:** az E-book tartalmi és reszponzív tesztjei sikeresek; az USB-szinkron támogatott fájltípusokra szűr, több Drive-könyvtármappát és lapozást kezel, az aláírt EPUB-ot elutasítja, megnyitás után pedig a szöveges nézetre vált. A repository broker production deploymentje sikeres, az élő health végpont API v19-et jelez.

**Kész:** az Android appban a könyvtár, feltöltés és e-olvasó párosítás, a könyvadatlap, valamint a szöveg- és szerkezeti EPUB-szerkesztő egységes, nagy érintési célú telefonos felületet használ. A módosítás nem érinti a webes nézetet.

**Parkol:** korábban kiosztott Drive-megosztások áttekintése és visszavonása.

**Ellenőrzés:** az EPUB-megnyitás, automatikus szövegnézet, jóváhagyott tartalommódosítás és Drive-visszaírás böngészőtesztje sikeres. Részletek: `EBOOK_DEBUG_REPORT.md`, `CODEX_HANDOFF.md`.

## Pénzügy

### Pénzügyi Napló

**Kész:** bevételek, tényleges/tervezett kiadások, megtakarítások, kimutatások, kép-alapú nyugta-OCR alapok, valamint jóváhagyásos XLS/XLSX/XLSM/CSV munkafüzet-import több munkalap és adatblokk felismerésével.

**Kész:** a teljes Pénzügyi Napló Android-only telefonos felületet kapott: kártyás összesítés, görgethető nézetfülek, egyoszlopos űrlapok, mobil tranzakciókártyák és mindig elérhető „Új tétel” gyorsgomb.

**Parkol:** kategória-tanulás; AI-alapú jelentésfelismerés; makróértelmezés; Excel-visszaírás; PDF-nyugta OCR.

**Nyitott döntés:** az import megtakarítási célokat is hozzon létre, vagy csak egy gyűjtőcél alá importáljon. Részletek: `GRAPES_BACKLOG.md`.

### Számla és árajánlat

**Kész:** ügyfél- és terméktár, dokumentumszerkesztési és mentési alapok.

**Következő:** külön, friss modul-audit szükséges.

## Food ételnapló

**Kész:** saját ételek, Open Food Facts, vonalkód, napló, célértékek, receptek, receptvariánsok, pillanatképek, statisztika, helyi és Drive-mentés; verziózott Health Connect/Samsung JSON-import előnézettel és `externalKey` deduplikációval; jóváhagyásos tápértékcímke-OCR; külön Drive-fájlos családi receptkönyvtár olvasó/szerkesztő jogosultsággal és visszavonással.

**Folyamatban:** az Android Health Connect POC aláírt APK-ja GitHub Actionsben elkészül. A jogosultság-, történeti olvasás-, írás- és visszavonástesztet még valódi Android-készüléken kell igazolni.

**Blokkolt:** közvetlen Samsung Health Data SDK vízadapter. A forrás elkészült, de a Samsung AAR, JDK 17/SDK 35 build, készülékteszt és nyilvános terjesztéshez a későbbi Samsung partnerjóváhagyás hiányzik.

**Ellenőrzés:** 231/231 teljes repository egységteszt, Android shell és Food mobil böngészőteszt, valamint production build sikeres.

**Következő:** valódi készülékteszt; sikeres eredmény nélkül a Grapes → Health Connect/Samsung Health képesség nem tekinthető késznek.

## Javasolt sorrend

1. Android Google-bejelentkezés és Drive-kapcsolat javítása.
2. A telefonos UI véglegesítése és alapértelmezett Android alkalmazáskeretté alakítása.
3. Hitelesített backend a globális felhasználó- és moduljogosultságokhoz.
4. E-book ismert hibák és production kiadás lezárása.
5. Food/Víz Android készülékteszt és Health Connect ellenőrzés.
6. 3D Pattern / Array.
