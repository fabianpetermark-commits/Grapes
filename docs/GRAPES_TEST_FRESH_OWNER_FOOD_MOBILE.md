# Grapes TEST — normál mobil Food-felület fiókhoz kötött helyi tárolója

**Állapot:** QA-flag OFF a korábban aláírt és telepített TEST v28-ban; külön Draft PR a #146 Food repository-ra építve. Ez a PR NEM készít APK-t, és nem kapcsolja be a funkciót a valós telefonos használathoz.

## Cél és ténylegesen elkészült változás

- A felhasználó megerősítette, hogy **nincs megőrzendő korábbi valódi adat**; a régi shared IndexedDB projektekhez nem nyúlunk, nem törlünk és nem próbálunk tulajdonost megállapítani. Minden TEST-fiók új, üres helyi projekttel indul.
- A `createMobileFoodController({ freshOwnerMode: true })` csak a külön Android TEST channel + natív Grapes Auth + `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED=true` esetben kerül meghívásra; a funkció a régi webes Food-módot nem változtatja.
- A **normál Android Food főnézetben** a `load` már a #146 `openGrapesTestFreshFood({enabled:true})` natív Auth subjecthez kötött `food-current` IndexedDB dokumentumot nyitja meg. Minden belépés/re-entry előtt a korábbi DOM láthatatlan és inert, a régi memóriabeli Food profile/projekt és receptekkel kapcsolatos sheet-állapot kiürül, az aktuális fiók ellenőrzése után a kezdő Food-nézet újrarenderelődik.
- A `persistLocal`, `scheduleSave`, `flush` a #146 CAS-revíziós, sorba állított fióktárhelyre ír. A saját étkezések, saját ételek, receptek, tápérték-pillanatképek, célértékek és beállítások mentése ugyanazt a teljes Food projektet használja. Fiókváltás, CAS-ütközés vagy logout esetén a régi kontrollert az owner-store elutasítja. Mentési hiba esetén a Food-nézet zárolódik, nem kap hamis mentés-sikert.
- A projektlista/tárhelystatisztika kizárólag saját `food-current` és `finance-current` dokumentumot számítja; a régi közös projektek és más felhasználó objektumai kimaradnak.
- A normál Android Health → Food és Receptek menüpontok használják az új vezérlőt. A saját Food-statisztikák csak a saját mentett projektből számolhatók.
- Ha a WebView újra előtérbe kerül, az alkalmazás újra ellenőrzi a natív Grapes TEST Auth subjectet és addig elrejti a Food tartalmat.

## Ideiglenes hozzáférési korlátok (szándékosan tiltva)

Az új saját Food felületen **nincs** Drive-írás/olvasás; nincs YAZIO import, automatikus YAZIO Health frissítés, Health Connect/Samsung import; nincs megosztás, inbox, családi Drive receptkönyvtár, régi unowned Food-JSON import. Ezek a funkciók továbbra is külön fiókhoz kötött és végpont-szintű jogosultsági ellenőrzést igényelnek. Képernyőgomb-tiltás ÉS műveleti függvények belső tiltása is van; közvetlen API-hívás nem indíthatja őket. Az aktuális saját Food-JSON export előtt is a natív fiókazonosságot újra kell igazolni.

Az E-book, Home, a Drive és a többi legacy module a fresh-owner TEST-módban még mindig NO-GO. A külön Food-változás önmagában **nem** jelenti a teljes Grapes többfiókos adatvédelmének készültségét. Az Android WebView / IndexedDB fiókelkülönítés az alkalmazás-szintű felhasználóváltási hibákat védi; nem szolgál titkosításként egy ugyanazon originen futó rosszindulatú JS ellen.

## Automatizált böngészős teszt és kiadás

- `tests/grapes-test-fresh-owner-food-mobile.browser.mjs`: a tényleges mobil UI-ban az A felhasználó a Health → Food képernyőn új **saját ételt és étkezést** rögzít; ellenőrzi a saját natív Auth partícióban mentett tápértéket/összeget és a Food-projektlista indexét; B belépése után a Food üres, és A régi adatai nem láthatók; B saját étkezést ment, majd A visszalépve változatlan saját naplót talál. A közös örökölt `food-tracker-local-food-profile` bájtjai érintetlenek. YAZIO/Health/megosztási kapcsolók tiltva.
- A workflow a #146 Food repository A/B/A és a #145 **valódi Finance UI** A/B/A, valamint #144 **Water** A/B/A regressziókat, teljes npm-testet, Android WebView buildet is futtat.
- A böngészős teszt **helyettesített** natív Auth-válaszokkal fut. Valódi készülékes teljes Food A/B/A és fiókváltás közbeni képernyő-regresszió későbbi aláírt TEST APK-jelölttel kötelező.
- **Nincs PROD/TEST Supabase vagy Drive távoli módosítás, nincs valós felhasználói adatot érintő mentés/migráció, nincs adat-clear, nincs APK, release vagy PR merge.**

## Következő lépés

E-book saját olvasási állapot/könyvtár és valódi Drive-határok külön felülvizsgálata, majd a többi module funkció kapuzása; ezután közös TEST-jelölt a normál Food+Finance+Water fiókváltásos készüléktesztjeihez. YAZIO/Health/sync csak a teljes saját fiókazonossági jogosultsági modell elkészülte után kap új engedélyt.
