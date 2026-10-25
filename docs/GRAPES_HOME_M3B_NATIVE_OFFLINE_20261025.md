# Home M3/B — natív Auth adapter + tulajdonoshoz kötött offline szinkronsor (2026-10-25)

**Biztonsági státusz: TEST Draft.** A teljes funkcionalitás nincs bekötve a kiadott telefonos Home képernyőbe; a távoli Grapes TEST Supabase-en a M3/B SQL továbbra sincs alkalmazva. PROD, Drive, a fiókonkénti Home és a Food/Finance napló érintetlen.

## 1. Natív Android hitelesítési kapu (nincs második login)
A már meglévő `TestSupabaseProxy.kt` tartja a kizárólag izolált Auth oldalról átadott, /auth/v1/user útvonalon hitelesített TEST Supabase hozzáférési tokent **natív memóriában**. Az app WebView csak a ellenőrzött UUID-t kapja. A családi modulhoz további, pontosan 10 név szerinti `home_m3b_*` RPC lett engedélyezve, **csak** ha:

- Android QA alkalmazás `hu.grapes.healthconnect.test`;
- `VITE_GRAPES_TEST_AUTH_ENABLED=true` és rögzített TEST URL + publishable key;
- `VITE_GRAPES_TEST_DATA_ENABLED=true`;
- külön `VITE_GRAPES_TEST_HOME_FAMILY_ENABLED=true`.

Ezek együttes feltétele nélkül a natív `GRAPES_TEST_HOME_FAMILY_ENABLED` flag **false**. RELEASE/PROD/debug mindig false. A JavaScript oldal az `openHomeFamilyNativeGateway` adapterrel, felhasználói token nélkül hívja a natív kérést; a családi gateway minden RPC előtt és után újra ellenőrzi az Auth alanyát. Kijelentkezés/fiókváltás az eredeti natív tokenkaput érvényteleníti, a késői válasz elutasításra kerül.

Nincs `service_role`, új identitásszolgáltató vagy új Google Drive-jogosultság.

## 2. Tartós offline sor
`src/home/home-family-outbox.js` külön IndexedDB-ben (`grapes-test-home-m3b-outbox-v1`) dolgozik, nem írja felül az eddigi Grapes Food/Water szinkronsort vagy a személyes Home CAS tárolót.

- `refresh(householdId)`: a gateway által hitelesítetten visszaolvasott teljes közös pillanatkép (szerepkör + revízió) mentése.
- `cached(householdId)`: korábbi távoli pillanatkép megnyitása **csak az aktív natív tulajdonos számára**. A régi snapshot nem bizonyítja, hogy a szerveroldali tagság még él; küldés előtt a szerver újraellenőriz.
- `enqueue(householdId,command)`: **offline is** az utoljára ellenőrzött helyi alapból készít változtatást; a teljes kandidátust és stabil `operationId`-t atomikus IndexedDB tranzakcióban menti el, **mielőtt** hálózatra kerülne.
- `retry(householdId)`: online, natív tokenkapun át ugyanazzal az `operationId`-val CAS-t küld; a szerver saját `home_m3b_read_attempt` visszaolvasásával validálja a pontos jelöltet, revíziót, műveletet és státuszt; csak ezután jelölhető `committed` vagy `conflict` állapotúnak.
- Elveszett válasz, áramkimaradás, adatbázis-írási hiba vagy szervereltérés esetén a művelet **pending** marad. `conflict` esetén a teljes elutasított jelölt a sorban marad kézi feloldásig.

**Tudatos első korlátozás:** háztartásonként egyszerre csak **egyetlen rendezetlen offline művelet** engedélyezett. Nem tesz úgy, mintha az egymásra épülő több offline változtatás összeolvasztása kész volna. A családi napló/Finance/OCR/Health nem kerül automatikusan családtaghoz.

**Adatvédelmi megjegyzés:** az IndexedDB adat fiók szerint szűrt, de nem külön kliensoldali kulccsal titkosított. A fizikai készülék/app-adattároló hozzáférési szabályai továbbra is fontosak. A személyes adat automatikus szinkronja változatlanul tiltott.

## 3. Bizonyítékok és nyitott kapuk
- `tests/home-m3b-native.test.js`: TEST-only flag, natív tokencsatorna, késői RPC válasz és A→B váltás.
- `tests/home-m3b-family-outbox.browser.mjs`: valós IndexedDB + Chromium, több lap, frissítés előtti hitelesített baseline, internetvesztés, böngészőújratöltés, tartós `operationId`, hamis szerverbizonyíték, valódi konfliktus, B fiók elkülönítése.
- Android Robolectric: `TestSupabaseProxyTest.kt`, natív RPC whitelist, külön családi engedély és tokenmemória védelem.
- CI: `.github/workflows/home-m3b-native-offline.yml`, teljes `npm test`, Android web build, két Home A→B→A böngészőteszt, offline böngészőteszt, natív `testQaUnitTest` és `assembleQa` (csak debug-aláírású CI jelölt, **nem** telefonra frissítő release).

### A következő, kiadás előtt kötelező fázis
1. M3/B SQL-javaslat külön jóváhagyott telepítése a valódi **TEST** projektre, JWT/ACL két független TEST-fiókkal ellenőrizve.
2. A family Auth+gateway+outbox bemenetének felhasználói Home UI-hoz kötése a #41 szerint jóváhagyott widgetes dizájnban, kifejezett család-alapítás/meghívás és állapotok.
3. Offline konfliktus **felhasználói feloldófelülete** (nem automatikus LWW); több offline változtatás külön további munkafázis.
4. Tartósan TEST-aláírt APK + két fizikailag független telefon, kapcsolat megszakítása, visszaállítás, fiókváltás, kiléptetés, tokenlejárat, rossz hálózat.
5. Külön merge/release döntési kapu. PROD változatlan.

**Nem igazolt:** a távoli TEST Supabase hozzáférése; valós kéttelefonos szinkron; felhasználói UI és automatikus háttérszinkron. A sikeres szimulált CI nem helyettesíti ezeket.
