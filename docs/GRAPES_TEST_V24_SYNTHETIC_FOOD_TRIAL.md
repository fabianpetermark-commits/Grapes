# TEST v24 — egyetlen szintetikus Food-bejegyzés (Draft, NO-GO)

Szülő: #130, natív Supabase bearer-kapu + tartós IndexedDB offline sor. Ez **nem** valódi Food-szinkron, nem migráció, nem PROD-frissítés és nem kiadási jelölt.

## Kapuk (alapértelmezetten OFF)

Normál buildben egyik TEST-adatkapu sem kapcsol be. Kizárólag a külön Android QA build esetén és tudatosan engedélyezhető:

- VITE_GRAPES_TEST_CHANNEL=1
- VITE_GRAPES_TEST_AUTH_ENABLED=true
- VITE_GRAPES_TEST_DATA_ENABLED=true
- VITE_GRAPES_TEST_FOOD_SYNTHETIC_ENABLED=true
- Kizárólag a Grapes TEST Supabase URL és **publishable** kulcs; soha service_role/secret.

A Beállítások alatti háromgombos QA-panel csak igazolt natív TEST Auth esetén látható. Automatikus felhőmentés nincs. A normál Food, Water, Health és a Drive E-book nem importálja az új QA modult.

## Három külön explicit művelet

1. **Próba előkészítése (online):** a szerver külön, új fióktulajdonú tesztprofilt hoz létre a create_profile RPC-vel; csak erre a profilra kerül az egyetlen food_diary jelölt a meglévő IndexedDB outboxba, expectedRevision=0, saját UUID-műveletazonosítóval. A minta syntheticQA: true, 100 g, 123 kcal, külön qa-food- rekordazonosító. A helyi pointer fiókhoz kötött, meglévő mintát újból nem hoz létre. A profil-előkészítés online művelet; előbb a TEST SQL telepítését és Auth/RLS ellenőrzését kell elvégezni **külön jóváhagyás után**.
2. **Mentés ellenőrzése / újrapróbálás:** kizárólag a felhasználó gombnyomására fut. Az outbox a meglévő natív Supabase RPC-adatkapun küld CAS-t, majd azonos műveletazonosítóval visszaolvassa a szerver immutable attempt sorát. Offline hiba, elveszett válasz, nem egyező attempt esetén a jelölt pending, nincs sikeres visszajelzés. Új gombnyomás azonos op ID-val újrapróbálhatja. A committed önmagában még **nem** igazolt külön rekord-visszaolvasás.
3. **Külön visszaolvasás:** önálló, új read_document RPC, amely a visszakapott profil/kind/record ID, 1. revízió, séma és teljes szintetikus payload egyezését ellenőrzi. Hiány/eltérés esetén nincs PASS.

A próba kizárólag a hozzá létrehozott **új** Supabase-profilban létezik. A valódi Food napló, Water helyi tároló, YAZIO, Drive, E-book és fiókstruktúra változatlan. A próbaprofil és próbabejegyzés későbbi törlése **nincs** ebben a PR-ban; semmit sem törlünk automatikusan.

## Ellenőrzések és még nyitott kapuk

- tests/grapes-test-synthetic-food-trial.test.js: alapértelmezett OFF, egyszeri előkészítés, offline hiba, újrapróbálás, független visszaolvasás, sérült pointer és fiókváltás.
- tests/grapes-test-synthetic-food-trial.browser.mjs: valódi IndexedDB és a tényleges native-client → gateway → outbox lánc böngészős próbája, **szimulált** natív RPC-n és szimulált szerveren. WebView-t, valódi Android natív hálózatot és távoli Supabase TEST-et nem igazol.
- Külön CI: teljes unit suite, web + Android-web build, célzott böngészős regressziók, QA Kotlin teszt/fordítás **hamis publishable kulccsal**, APK feltöltés nélkül.
- A #130 ismert hat teljes böngészős baseline hibája továbbra is nyitott. Nem kapcsolunk ki tesztet.
- Nincs távoli TEST SQL-telepítés, két valódi TEST-fiókos RLS/CAS bizonyítás, fizikailag kipróbált APK vagy valós mentés. Ezekig: **NO-GO**.
- A WebView egyazon originjében az outbox account-szűrése nem erős titkosítási/konfidencialitási határ; #95 helyi tartóssági és account privacy kérdései továbbra is blokkolják a valódi Food-adatokat.

Ne engedélyezd a két adatkapcsolót normál TEST/PROD buildben, és ne használd valódi Food-bejegyzésekkel. Nem történt release, merge vagy felhasználói adatmozgatás.
