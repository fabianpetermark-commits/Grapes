# Grapes TEST — natív SAF fájlmentés és független SHA-256 visszaolvasás

## Állapot

Ez a **#141 tulajdonos nélküli, visszaállítható helyi JSON mentésének következő védelmi kapuja**. A kliens oldali forrásleltár és mentés előkészítése után a natív Android Storage Access Framework segítségével a **felhasználó által kiválasztott** fájlba ír; lezárás után az Android újra megnyitja a fájlt, majd a kiválasztott fájl SHA-256 és UTF-8 bájtszámát a köztes, ideiglenes állománnyal összeveti. Csak egyezés esetén ad receiptet. Nem háttérben fut, és nem készít automatikus fájlt.

## Elkészült a külön, alapértelmezésben KIKAPCSOLT TEST úton

- Android buildkapu: `BuildConfig.GRAPES_TEST_LEGACY_BACKUP_ENABLED`, kizárólag külön TEST QA összeállításnál, és csak `VITE_GRAPES_TEST_AUTH_ENABLED=true` hitelesített QA környezetben lehet aktív. **Alapértelmezése minden buildnél OFF**. A szokásos PROD/release/debug nem engedi.
- Új, kizárólag TEST natív művelet: `beginUnclaimedBackupExport`, amely egyetlen szigorú formátumot fogad el: `grapes-helyi-adatok-YYYY-MM-DD.json`. A korábbi Food, Water és Health mentési nevek, illetve API-k változatlanok. Ellenőrzés: TEST build, feature flag, pontosan az ismert Grapes app-origin, natív Auth által igazolt Grapes TEST subject.
- Az Android SAF fájlválasztás alatt és minden csomag hozzáadásakor ellenőrzi az eredeti TEST subject azonosságát; ha az A → B fiókváltás közben megváltozott, a mentés leáll. Grapes TEST kijelentkezéskor az ideiglenes tulajdonoshoz kötött mentési állapotot azonnal megszünteti.
- `src/android-bridge.js`: `saveAndroidVerifiedUnclaimedBackup(prepared)` külön, alapból meg nem hívott kliensadapter, amely ellenőrzi a backup marker/version/unclaimed státuszt, a teljes UTF-8 bájtszámot és SHA-256-ot, az exportot Unicode-biztos darabokban adja át; megszakítás, sérült vagy rövid Android-nyugta esetén nem jelenti sikeresnek.
- A natív `finishFoodBackupExport` belső befejező művelete a korábbi Health-mentéshez hasonlóan **fájl-újranyitás és SHA-256+byte readback** ellenőrzést hajt végre az új, külön engedélyezett backup névnél is; a régi Food/Water esetleges egyszerű mentésmechanizmusa továbbra sem kap hamis független receiptet.
- Tesztek: `UnclaimedLocalBackupPolicyTest` (engedélyezési határok, hamis fájlnevek, módosított/trunkált fájlok, megszakadó olvasás), valamint `grapes-test-native-unclaimed-backup.browser.mjs` (mock Android bridge: több darab, magyar Unicode, hibás receipt, picker cancel, megszakadó chunk). Meglévő owner-local és legacy no-loss browser regresszió is fut.

## Kritikus határok

1. **Nem kapcsoltuk be a valódi adatokhoz használható UI-ban.** A mentés API-ja egy későbbi, felhasználói hozzájárulással indított backup-út számára elérhető, de **nem fut megnyitáskor**, és nem indul el fiókváltáskor. Ez a PR nem készít APK-t.
2. A sikeres natív fájl receipt **nem** bizonyítja a történeti adatok tulajdonosát. A #141 `verifyUnclaimedLegacyBackup(..., freshCapture)` visszaellenőrzését a majdani UI-nak kötelező külön elvégeznie, és addig is a kimenet `ownership='unclaimed'`, `migrationAuthorized=false`.
3. Egy közös telefon régi, globális helyi tárhelyének B általi olvasási/backup-kitettségét a jelenlegi rendszer **még nem** szünteti meg. A mentési UI-t nem lehet aktiválni, amíg a régi adatokhoz való hozzáférés / tulajdonosi döntés nincs biztonságos módon megoldva.
4. A mentés bizonylatát a GitHub CI natív Kotlin unit tesztje valódi digestgel és szimulált Stream-ekkel teszteli. **Nem bizonyít valódi telefonos Storage Access Framework exportot**; ahhoz külön aláírt TEST candidate, ellenőrzött helyi mentés és telefonos próba kell.
5. Az esetleges sikertelen SAF írás **létrehozhat egy sérült/hiányos célfájlt**, de a Grapes ekkor soha nem ad PASS receiptet, és a *forrás* rekordokat nem törli/módosítja. A felhasználónak a hibás célmentést törölnie vagy új fájlnevet választania szükséges.
6. **Nincs felhőszinkron, Supabase vagy Drive távoli írás, nincs PR-merge, APK, PROD módosítás vagy régi adatok migrálása.**

## Következő döntési kapu

Biztonságos régi-adat-tulajdonosi feloldás, teljes modulonkénti nyers forrásleltár és **felhasználói hozzájárulás**; ezután külön QA felület/Android-jelölt a kiválasztott file SAF mentéséhez és tényleges fájl-újranyitásához. Normál Food/Finance/Water/E-book multiuser még mindig **NO-GO**.
