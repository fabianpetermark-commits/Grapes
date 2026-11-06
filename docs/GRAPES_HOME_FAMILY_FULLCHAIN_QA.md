# Egységes Otthon – teljes láncú QA (#190)

**ÚJRAFUTTATÁS SZÜKSÉGES:** az eredeti 2026-10-27-i mérés a #192 natív TEST-integráció merge előtti forrásán készült. A késői CAS/proof fiókváltási hiba javítása a jelenlegi `codex/android-app` ágon található; ezt a QA-harness-t a jelenlegi ágon újrafuttatjuk. A korábbi 21 PASS / 2 FAIL eredmény történeti adat, nem a jelenlegi forrásra vonatkozó eredmény.

A két bukás ugyanannak a fiókváltási hibának két aszinkron belépési pontja. Nem módosítottuk az alkalmazást vagy a teszt elvárt működését. A teszt minden esetet lefuttat, hiba esetén nem nulla exit kóddal zár; nincs skip/expected-failure/continue-on-error a hibák elfedésére.

## Mit futtat a teszt?

A `tests/fixtures/home-family-fullchain.html` az eredeti `home-mobile.css`-t és `createHomeMobile(root, localStorage, {familySync})`-t használja. Ez maga hozza létre az eredeti `createHomeFamilyAutoSync` koordinátort; az injektált `createOneHomeTestSync` az eredeti `createHomeFamilyOutbox`-ot és `createFamilyHomeGateway`-t hozza létre. Chromium valódi IndexedDB-je dolgozik, nincs in-memory outbox vagy helyettesítő üzleti modell.

Csak a transport mock: `auth.getUser()` nem anonim A/B fiókot ad, az RPC kizárólag `schema('api')` felületen érhető el. A mock szerver revíziót, CAS-t, operationId szerinti idempotens próbát és `read_attempt` választ tárol a teszt sessionStorage-jában, ezért reload után sem felejti el a szerverállapotot. A minták és B konkurens parancsa is az eredeti `stageFamilyHomeCommand`-ból készülnek. Külön read/CAS/proof gátak biztosítják a késői válasz determinisztikus reprodukcióját. A CAS transport belépésénél visszaolvassuk az IndexedDB-t, így az adatbázis-commit valóban megelőzi a CAS-t.

Minden eset külön browser context, az összes nem localhost HTTP-kérés blokkolva és hibának számít. Nincs Supabase kliens inicializálása, jelszó, JWT, éles HTTP, migráció vagy adatírás. A TEST URL a meglévő kapu kötelező konfigurációs ellenőrzését szolgálja. Ez JS/UI jogosultságellenőrzés, **nem hosted SQL/RLS bizonyíték**.

A teljes localStorage byte-ra összehasonlított a tesztek előtt/után, beleértve két valódi v1 dispatch-ből származó current/previous mentést és Food/Finance/Health privát tesztjelzőket. Ezek a moduljelzők nem teljes moduladatbázisok: a teszt a Home-ból indított automatikus átvitel tilalmát és a meglévő localStorage érintetlenségét bizonyítja, nem ezen modulok teljes működését.

## Kötelező esetek tényleges eredménye

| Követelmény | Eredmény | Mérési pont |
| --- | --- | --- |
| A első olvasása, 3 widget, v2/v1 elkülönítés, csak igazolt állapot zöld | PASS | `verified-three-widgets`, `unverified-auth-never-green`; blokkolt read alatt checking, ellenőrzés után synced, személyes cukor nincs a DOM-ban |
| Offline stabil operationId/candidate és tartós mentés a CAS előtt | PASS | `offline-reload-exactly-one-cas-and-proof`; pending IndexedDB job, 0 offline CAS, CAS belépésnél ugyanaz a lemezről visszaolvasott job |
| Reload, online/foreground és dupla kattintás/esemény | PASS | Ugyanaz a teljes job reload után; első CAS az eredeti ID/candidate; ismételt resume után is 1 CAS; proof-gát alatt még pending |
| Kézi újrapróbálás | PASS | `resume-manual`; elérhető gomb, 1 CAS, proof után synced |
| Bizonytalan válasz és hiányzó/hiányos/hamis proof | PASS | `lost-response`, `missing-proof`, `incomplete-proof`, `forged-proof`; pending marad, javított válasszal ugyanazon args újraküldése, 1 szerveroldali attempt |
| CAS konfliktus, nincs merge/rebase/automatikus újraírás | PASS | `cas-conflict-preserves-proposal`; B revíziót növel, job conflict, eredeti candidate és expectedRevision megmarad; 3 online/foreground pár és reload után is 1 CAS |
| Owner/editor írhat, viewer csak olvas | PASS | `role-owner`, `role-editor`, `role-viewer`; viewer UI tiltott, közvetlen queue is elutasítva, 0 job/CAS |
| A→B→A outbox/DOM elkülönítés és visszatérés | PASS | `account-A-B-A-durable-isolation`; régi capability B alatt elutasít, friss B outbox üres, A offline javaslata visszatéréskor azonos |
| Késői read válasz A→B váltáskor | PASS | `late-read-after-account-switch`; unverified, üres korábbi DOM |
| Késői CAS válasz A→B váltáskor | **FAIL / NO-GO** | `late-cas-after-account-switch`; B aktív, státusz pending és A közös listája/offline javaslata továbbra is látható |
| Késői read_attempt válasz A→B váltáskor | **FAIL / NO-GO** | `late-proof-after-account-switch`; ugyanaz a megjelenítési adatszivárgás |
| Megvettem nem készletbevétel; ismeretlen mennyiség nem hiány | PASS | `purchased-is-not-stock-and-private-sources-denied`; a megnyomott tétel checked, teljes inventory változatlan, hiányjavaslat száma 1 (csak a megerősített nulla) |
| Nincs Food/Finance/Health automatikus átvitel | PASS | A három külső sourceType/sourceId queue elutasítva; privát tesztjelzők és v1 érintetlenek |
| v1 current és previous byte-megőrzés | PASS | Minden sikeres eset végén teljes localStorage egyezés; a 2 hibás esetnél is `storagePreserved: true` |
| 320/360/390/412 px, státuszok és kézi retry | PASS | `mobile-320/360/390/412`; synced/offline/pending/conflict alatt 0 px overflow; role=status, aria-live=polite, retry a viewporton belül és Enterrel működik |
| Nincs Saját/Közös kapcsoló vagy külön Kimenő üzenetek képernyő | PASS | Mobil esetek, meglévő PROD regresszió |
| Valódi HTTP A/B / hosted RLS | **NOT RUN** | Kifejezetten mockolt transport; nincs valódi adatírás |
| Telefon / TEST APK frissítés / natív bridge / TalkBack | **NOT RUN** | Lásd külön magyar telefonos listát; APK-t nem készítettünk |

Az összesített 23 önálló browser esetből 21 PASS, 2 FAIL. A fenti táblázat követelményeket csoportosít, ezért a sorainak száma nem azonos az esetek számával.

## Reprodukálható alkalmazáshiba és javasolt javítás

Érintett: `src/home/home-family-auto-sync.js`, `createHomeFamilyAutoSync` → `reconciliate()` catch ága (112–122. sor a kiinduló commitban); kapcsolódó `src/home/home-family-gateway.js` → `rpc()` válasz utáni `verify()`.

1. Ellenőrzött A alatt offline új listaelemet adunk hozzá; IndexedDB job pending, candidate tartalmazza az „Offline kenyér” tételt.
2. Online eseménnyel elindítjuk a mentést; a mock a CAS vagy a `read_attempt` válaszát feltartja.
3. A natív owner-jelző és az Auth-fiók B-re vált, majd felengedjük a régi A-kérést. Szándékosan nem hívunk külső UI-invalidálást: a meglévő JS lánc válasz utáni hitelesítését teszteljük.
4. A gateway észleli az owner eltérését és elutasítja a választ. Az auto-sync `await sync.retry()` kivétellel kilép, ezért az utána következő `pin(epoch)` nem fut le.
5. A catch feltétel nélküli pending-megőrzése a snapshotot is megtartja. Megfigyelt: aktív B UUID `…0002`, `data-status="pending"`, DOM-ban „Közös tej” és „Offline kenyér”; job továbbra is pending. Várt: unverified és A korábbi snapshotjának azonnali elrejtése; a tartós A-job maradjon meg.

Kockázat: A előző családi adatai B alatt megjelennek a már felépített UI-ban, amíg egy új esemény vagy külső invalidálás nem törli őket. Ez nem szerveroldali jogosulatlan olvasást/írást bizonyít, hanem kliensoldali megjelenítési adatszivárgást. Nem zöld státusz a hiba, hanem a hibásan megtartott pending snapshot.

Javaslat a forráskódot kezelő fejlesztési ág számára: a hibautat is védeni kell aktuális owner/epoch ellenőrzéssel, owner eltérésnél snapshot törlés + unverified, az outbox törlése nélkül. Ugyanazon owner valódi hálózati hibájánál a pending proposal maradjon meg. Külső auth-váltási invalidálás hasznos további védelem, de nem helyettesíti a válasz utáni ellenőrzést. A QA-ág nem módosítja a Home/Android implementációt. Mindkét reprodukciót újra kell futtatni a javítás után.

## Futtatás, regresszió, CI

```sh
npm ci
npm test
npm run build:android-web
node tests/prod-home-one-house.browser.mjs
node tests/home-one-outbox-status.browser.mjs
node tests/home-family-preview.browser.mjs
node tests/home-m3b-family-outbox.browser.mjs
node tests/home-one-family-fullchain.browser.mjs
```

Szükséges: Node 24, Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, vagy `/usr/bin/google-chrome`, `/usr/bin/chromium`). A teszt saját Vite szervert indít a 4297-es porton, majd bezárja. `qa-results/home-family-fullchain/results.json` tartalmazza az összes PASS/FAIL-t és a NOT RUN határokat. Hibáknál HTML, screenshot és JSON-ben megfigyelt owner/státusz/DOM/job adatok; minden mobilmérethez screenshot készül.

| Helyi parancs | Eredmény |
| --- | --- |
| `npm ci --cache /workspace/.npm` | PASS, 222 csomag telepítve; külön cache csak a futtatókörnyezet írható útvonala miatt |
| `npm test` | PASS, 59 tesztfájl, 0 bukás |
| `npm run build:android-web` | PASS; a forrás HEAD-jének külön `/tmp/grapes-fullchain-build` másolatában, ugyanazzal a node_modules-szal, hogy a közös Android asset fákat se érintsük |
| `node tests/prod-home-one-house.browser.mjs` | PASS, 320/360/390/412 px |
| `node tests/home-one-outbox-status.browser.mjs` | PASS |
| `node tests/home-family-preview.browser.mjs` | PASS, 320/360/390/412 px |
| `node tests/home-m3b-family-outbox.browser.mjs` | PASS |
| `node tests/home-one-family-fullchain.browser.mjs` | **FAIL (exit 1): 21 PASS / 2 FAIL**, reprodukált alkalmazáshiba |

Új workflow: `.github/workflows/grapes-home-family-fullchain-qa.yml`. Saját QA-ág push és `codex/android-app` felé PR trigger; `contents: read`, nincs secret, release, APK, deploy, DB- vagy Supabase-lépés. A teljes lánc hibájánál is feltölti az evidence artifactot. A regressziós lépések unit hiba esetén is lefutnak, hogy minden ellenőrzés állapota látható legyen. A GitHub Actions futás konkrét linkje és végállapota a Draft PR leírásában lesz rögzítve; ezt a dokumentumot a helyi mérés után készítettük.

Új fájlok: a fullchain runner, két test fixture, az önálló workflow, ez a QA-jelentés és `docs/GRAPES_HOME_FAMILY_PHONE_QA.md`. Kizárólag új teszt-, CI- és dokumentációs fájlok; a csomagfájlok, meglévő workflow-k, Home, belépési pont, Kotlin és Supabase séma változatlan.
