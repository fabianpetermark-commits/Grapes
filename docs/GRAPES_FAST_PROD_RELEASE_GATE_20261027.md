# Grapes – gyors, biztonságos PROD átvezetés (2026-10-27)

## Cél
A már jóváhagyott és **a tényleges alkalmazáskódban is tesztelt** felületek és funkciók minél hamarabb kerüljenek a PROD-ba, adatvesztés, fiókkeveredés vagy megszakadt kapcsolatok nélkül. **Nem követelmény**, hogy az összes jövőbeli modul és Supabase felhőfunkció egyszerre készüljön el. A félkész részeket funkciókapu mögött tartjuk.

## Bizonyított kiindulópont
PR #179, CI #40463707007: v29 571/571 unit, Chromium modul- és A/B/A regresszió, Android web build, natív QA unit PASS. A teszt a v29 kódra vonatkozik, nem a későbbi külön ágakra. Nincs PROD-merge.

## Kiadási kapuk és sorrend
1. **Release candidate inventory**: különbség a jelenlegi PROD main, aláírt PROD APK és v29 baseline között; korábban működő QR/Drive/E-book, Food/YAZIO, Finance, Water, Health Connect, Home, PIN, auth és offline funkciók tételesen.
2. **UI adaptáció**: a jóváhagyott Brand Guide és HTML minták meglévő működő vezérlőkhöz kötése, nem statikus mock behelyezése. Egységes hatikonos felső navigáció, kontextuális quick action, diszkrét cyan. Home csak **Egységes Otthon** (nem a régi Saját/Közös v42). Outdoor feladat és hely bővíthető legördülő; Beállítások teljesen görgethető, ismeretlen kapcsolatnál figyelmeztető háromszög. E-book csak provisional, külön jóváhagyás nélkül ne jelöljük véglegesnek.
3. **Integráció**: a Samsung SDK v32 aláírt APK külön ellenőrzendő; ne legyen a v29 vagy a Home v42 ág automatikus merge-e. A meglévő Drive és Auth/PIN viselkedés megtartása kötelező.
4. **Funkciómegőrzési kapu minden változtatott headen**: npm test; Android web build; böngészős A/B/A, import, export, CAS/undo; natív QA; célzott UI/DOM tesztek. A korábbi zöld v29 CI **nem elég** az új headhez.
5. **Felhő**: Supabase TEST: Food/Water/Finance/Health privát mentés és readback, B nem láthatja, új eszközön A olvassa, offline/retry/ütközés, Home családi megosztás. Ha valamelyik nincs kész, a PROD-ban nem lehet úgy feltüntetni, hogy felhőszinkron kész; feature flag és megőrzött helyi működés szükséges.
6. **Valódi Android frissítés**: meglévő PROD fölé telepítés adat- és app-törlés nélkül; azonos package name és signing cert, régi app megnyitás, login/PIN, modul smoke, Drive-kapcsolat, régi adatok megtartása. Eltérő csomag vagy aláírás: NO-GO.
7. **PROD**: csak az igazoltan szükséges és TEST-en tesztelt Supabase sémák/RLS biztonsági ellenőrzése után, visszaállítási tervvel, explicit felhasználói GO-val. Nincs automatikus PROD DB migration, PR merge vagy aláírt kiadás.

## Állapotjelző
- Zöld: konkrét headen CI + szükséges telefonos smoke + megőrzött adatok.
- Sárga: prototípus jóváhagyott, de funkciók nincsenek bekötve; vagy távoli E2E hiányzik.
- Piros: ismert regresszió, jogosultsági rés, megszakadt Drive/Health/PIN, aláíráseltérés, adatvesztés.
- Csak zöld funkciók kerülhetnek élesbe. Nem kell minden modul egyidejű teljes felhős átállására várni, de az adott funkcióról nem állíthatunk többet, mint amit igazoltunk.

## Azonnali végrehajtási feladat
Az új integrációs ág v29 regresszióbiztos alapból indul; a PR szándékosan Draft. Következő kódmódosítás előtt a PROD main vs integrációs branch és az aktuális PROD package/signature állapotát kell ellenőrizni, majd a legkisebb, működő UI egységgel kezdeni. Nincs átvétel csak látvány alapján.
