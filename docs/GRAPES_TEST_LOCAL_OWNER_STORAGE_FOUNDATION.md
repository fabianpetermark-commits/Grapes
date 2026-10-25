# Grapes TEST – hitelesített felhasználóhoz kötött helyi tárhely (első fejlesztési szelet)

**Állapot: ALAP KÉSZÜL / még NEM aktív a Grapes normál moduljaiban.** A régi helyi adatok megőrzése elsődleges.

## Mi készült a #138 Draft PR-ben?

- Új, önálló `src/storage/grapes-test-local-owner-store.js` modul.
- A tároló a hitelesített **Supabase TEST Auth subject UUID** alapján külön IndexedDB adatbázisnevet használ (`grapes-test-local-owner-v1-<UUID>`). A tényleges alkalmazás-integrációnak a natív `getAndroidTestAuthSubject()` ellenőrzést kell majd biztosítania.
- `read`, `list` és `save` csak a külön ellenőrzött aktuális fiók tárolóját nyitja meg; a subjectet **minden művelet elején és végén** újból ellenőrzi. Fiókváltás közben nem adja ki az előző fiók olvasott adatát.
- A `save` optimista revízióellenőrzéssel (CAS) véd a stale mentéstől. Nincs automatikus törlés, import, tulajdon-átrendelés, automatikus szinkron.
- A `enabled` alapértelmezése `false`; a normál Food, Finance, Water, E-book nem importálja, ezért a meglévő felhasználói adatokat és UI-t **nem változtatja meg**.
- A külön Chromium teszt valódi IndexedDB-vel demonstrálja A → B → A elkülönítést, két lapon az azonos fiók következetes visszaolvasását, ütközést, kijelentkezést, megszakadó munkamenetet, és a korábbi nem fiókozott Finance + Water tárolók változatlanságát.
- A #137 audit regressziós tesztje továbbra is jelzi a **régi tárolók tényleges megosztási kockázatát**. A teszt PASS az új tároló működésére vonatkozik, nem arra, hogy a normál modulok már biztonságosak.

## Mit NEM jelent ez?

- **Nem titkosított adattároló.** A böngésző origin alapú IndexedDB-t ugyanazon WebView-n belüli rosszindulatú vagy hibás kód megnyithatja, ezért később külön fenyegetésmodellt, natív titkosítást és kulcskezelést kell mérlegelni.
- Nem ad jelenleg migrációt a `grapes-projects` adatbázisból, a `grapes-water-v1` kulcsból, a pénzügyi rögzített projektből, a Food Drive-profilból és az E-book olvasási haladásából.
- Nem helyettesíti a biztonságos, ellenőrzött **mentés → explicit hozzárendelés → másolás → visszaolvasás → visszaállítás** folyamatot.
- Nem engedélyez normál Supabase Food/Health szinkronizálást, nem készít APK-t, és nem módosít távoli TEST/PROD adatokat.

## A következő, külön jóváhagyandó mérföldkövek

1. **Hitelesített natív kapu bekötése, csak TEST:** minden helyi adattárolási művelethez valódi natív Auth subject, ellenőrzött logout/switch, két tényleges TEST-fiókkal.
2. **Modulonkénti adatvédelmi kapu:** a projektlista + Finance + Food + Water + E-book *minden* olvasási/írási/export/visszaállítási útvonala használja az owner-scope-ot, vagy tiltson fail-closed. A részleges átállás nem lehet bekapcsolva felhasználók számára.
3. **Örökölt adatok biztonsági mentése és explicit fiókhoz rendelése:** az app semmilyen Legacy adatot ne tulajdonítson el pusztán a pillanatnyilag aktív login miatt. Visszaolvasható másolat készítése; törlés kizárólag jóval később és külön jóváhagyással.
4. **Valódi egytelefonos A/B helyi teszt:** A saját normál adatai láthatók, B-nek nem; B sajátjai A számára nem; újraindítás, offline, ütközés, fiókváltás írás közben, mentés/visszaállítás és külön Drive-fiók tesztek.

**NO-GO** valódi adatok automatikus migrációjára, éles Food/Health felhős szinkronra és általános közös készülékes használatra.
