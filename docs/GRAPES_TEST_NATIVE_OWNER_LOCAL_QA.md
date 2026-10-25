# Grapes TEST – natív fiókazonosítóhoz kötött helyi QA és Finance-adatelérési réteg

## Kész ebben a PR-ben

1. `src/storage/grapes-test-native-owner-qa.js` a **natív Android TEST-gatere** épít: `isGrapesAndroidApp`, `getAndroidTestAuthEnabled`, `getAndroidTestAuthSubject`. A hitelesített subject minden `read`, `list`, `save` művelet indításakor és befejezésekor újból ellenőrződik a #138 fiókozott tárolójában.
2. `createGrapesTestOwnerFinanceRepository` a külön tulajdonosi IndexedDB-ben a `finance-current` rekordot kezeli, revíziós CAS mentéssel. **Nem használja** a korábbi, fiók nélküli `finance-tracker-current` rekordot. A Finance normál képernyője még **nem** importálja ezt a repót.
3. `createGrapesTestNativeOwnerTrial` kizárólag a belépett fiók számára hoz létre 2 determinisztikus, mesterséges Food/Finance QA jelölőt. Az A és B fiókhoz tartozó külön partícióban azonos rekordazonosítók mellett eltérő tulajdonosadatok tárolódnak. A második gomb csak a saját mesterséges rekordokat olvassa vissza.
4. `src/android-mobile-shell.js` új, **alapértelmezetten nem látható**, dinamikus Beállítások panelt hozhat létre a QA-hoz, kizárólag amikor **mindhárom** flag igaz: `VITE_GRAPES_TEST_CHANNEL=1`, `VITE_GRAPES_TEST_AUTH_ENABLED=true`, `VITE_GRAPES_TEST_LOCAL_OWNER_QA_ENABLED=true`, és a natív TEST Auth engedélyezett. PROD és normál web UI változatlan.
5. `tests/grapes-test-native-owner-qa.browser.mjs` valódi Chromium IndexedDB környezetben **szimulált natív bridge-dzsel** ellenőrzi az A→B→A belépésváltást, a saját Finance rekordok megtartását, idegen rekord hiányát, a kijelentkezéskori elutasítást, CAS revízió-ütközést és azt, hogy a régi globális Finance és Water bájtjai változatlanok. A külön #138 owner-store teszt, illetve a #137 eredeti problémát kimutató audit regressziója is lefut.

## Kritikus biztonsági megkötések

- A tesztadatok **csak mesterségesek**, nem használja az éles Food/Finance/Water modulok valódi adatait.
- A két új gomb **nem végzi el** a valódi profil- és adatköltöztetést; sem a globális `grapes-projects` adatbázishoz, sem a korábbi `grapes-water-v1` kulcshoz nem nyúl.
- A TEST/PROD Supabase adatbázisba és a Google Drive-ba nem küld semmit, nem állítja vissza az örökölt adatokat, nem módosítja a natív belépést.
- **Még nem teljes helyi fiókvédelem:** a normál Food/Water/Finance/E-book UI továbbra is az örökölt adatokat kezelheti; a TEST adatkapu UI-védelme és a tulajdonosonkénti IndexedDB név önmagában nem nyújt szándékosan ellenséges JavaScript-tel szembeni titkosságot.
- A GitHub CI **csak mockolt natív hívásokat** használ. Valódi telefonos kétfiókos helyi PASS-t **nem** állítunk, amíg majd külön QA-signed APK-t nem telepítenek és tényleges A/B/A teszt nem sikeres.
- A flag **alapból OFF**, ez a PR nem készít APK-t, nem változtatja meg a PROD-ot, nem engedélyez normál felhőszinkront.

## Következő szakasz

Miután ez a QA megfelelő CI ellenőrzést kapott, készülhet külön natív QA candidate, és A/B/A felhasználói próba. A normál modulok teljes átállítása csak **ellenőrzött helyi biztonsági mentés**, **explicit fiókhoz rendelés** és a projektlista / Food / Water / Finance / E-book valamennyi hozzáférési útvonalának fail-closed védelme után engedhető.
