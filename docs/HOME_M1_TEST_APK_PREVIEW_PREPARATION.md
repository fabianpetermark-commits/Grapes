# Home M1: adatmegőrző Grapes TEST APK-próba előkészítése

Állapot: **csak review; nincs APK-build, kiadás vagy merge**. A #51 draft PR Home-kódjának ellenőrzött kiinduló commitja `4729a4c4ae553b51a1a339d4d0725fa5d3c4003c`. A dokumentációs commit nem módosítja az APK forrását. A tényleges build csak új, kifejezett felhasználói jóváhagyás után kérhető.

## Forrásaudit

- A `.github/workflows/build-android-test.yml` PR/push útja csak webes ellenőrzés. Manuális `workflow_dispatch` útja `:app:assembleQa`-t futtat, és a QA APK-t artifactként feltölti, de nem ad állandó TEST kulcsot vagy ellenőrzi a signer fingerprintjét. A `build.gradle.kts` ilyenkor a runner debug kulcsára esik vissza. Ezt az artifactot **nem szabad a meglévő TEST telepítés frissítéseként ajánlani**.
- A `.github/workflows/release-android-test.yml` az állandó TEST kulcsot használja, és az APK csomagazonosítóját, verziókódját, tanúsítványát ellenőrzi, de `test-release.json` változtatására GitHub prerelease-t publikál. Ezt az útvonalat most nem indítjuk. A fájl jelenlegi `versionCode` értéke 10; ez **nem bizonyítja** a telefonra ténylegesen telepített verziót.
- A Gradle QA `applicationId` értéke `hu.grapes.healthconnect.test`, alap `versionCode`-ja környezeti változó nélkül 1. A TEST tanúsítvány nyilvános elvárt SHA-256 értéke a release workflow-ban: `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`.
- Az Android manifest `allowBackup="false"`: automatikus felhős visszaállítás nem garantált. A WebView DOM storage aktív, az origin `https://appassets.androidplatform.net`, a betöltött útvonal `/assets/design/android-mobile-preview.html`. A Home új, saját `grapes-home-household-v1` és `grapes-home-household-v1-previous` localStorage-kulcsokat használ; a TEST Food/Drive meglévő tárolójának törlését a #51 változásai nem vezetik be. A TEST Drive-gyökér `Grapes TEST`. A #51 PR nem módosítja a Gradle-t, a manifestet, a natív WebView-t, a release workflow-t vagy a kiadási JSON-t.
- A `docs/GRAPES_PROJECT_CONTEXT.md` nem található a #51 forráságán (GitHub 404). Az itt rögzített tények a tényleges forrásfájlokból származnak.

## Megállási pontok a telefonon, még build előtt

1. A tulajdonos az érintett telefonon ellenőrzi a TEST alkalmazás jelenlétét és adatait. Az ADB-vel kiolvasható csomag és verzió: `adb shell dumpsys package hu.grapes.healthconnect.test` (a `versionCode` és `versionName` sorokat kell feljegyezni), valamint `adb shell pm path hu.grapes.healthconnect.test`. Ha a csomag nincs telepítve, vagy az azonosító eltér, **nincs adatmegőrző frissítési állítás**.
2. Az `adb shell pm path` által jelzett telepített APK tanúsítványát a tulajdonos saját gépére átmásolva az Android SDK `apksigner verify --print-certs` parancsával ellenőrzi. Több APK/split esetén mindegyik releváns aláírást egyezteti. Az eredménynek pontosan a fenti TEST SHA-256 értékkel kell egyeznie. A kulcsot vagy jelszót nem kell és nem szabad megosztani.
3. A felhasználó előbb ellenőrzi az alkalmazásban az elérhető Food és más modulok exportját/Drive-mentését, azok visszaolvashatóságát és dátumát. A Home M1 helyi mentésére és minden helyi WebView/IndexedDB adatra nincs garantált automatikus cloud backup; ezért a kockázatmentes helyreállítás nem ígérhető. Az alkalmazást és adatait tilos törölni, az `adb uninstall`, cache/storage clear és újratelepítés kerülendő.
4. A javasolt új QA `versionCode` a feljegyzett telepített kódnál **nagyobb**, és a legutóbbi TEST kiadás kódjánál is nagyobb legyen. A pontos értéket csak a fenti kiolvasás és az aktuális TEST release-ek ellenőrzése után szabad rögzíteni; a `test-release.json` fájlt változatlanul kell hagyni.

## Javasolt külön, artifact-only út (későbbi review tárgya)

A #51 PR-ből futtatható jelenlegi debug-preview workflow-t **ne egészítsük ki közvetlenül a hosszú távú TEST signing secretekkel**. A PR forrása a buildscriptet és az npm scripteket is módosíthatja; a buildtel közös jobban elérhető kulcs így nem biztonságosan elkülönített. A repository védett environment/branch beállításait ebből a PR-ből nem lehetett igazolni, ezért most nincs biztonságosan engedélyezhető, aláírt workflow.

Külön review után egy megbízható, védett workflow csak explicit manuális kérésre indulhat. Bemenete a teljes, előzetesen review-zott commit SHA és a jóváhagyott `versionCode`/`versionName`; a SHA-nak a #51 ellenőrzött commitjára kell mutatnia. A workflow `contents: read` joggal, tartós checkout hitelesítő nélkül, nem PR eseményből fut. A kód buildelése **titok nélküli jobban** történik. A külön, védett environmentben jóváhagyott aláíró job csak az ellenőrzött, változtathatatlan build artifactot fogadja, és nem futtat PR-ből származó scriptet; a TEST kulcsot kizárólag ott használja. Ha ez a szétválasztás, environment-jóváhagyás és actor/commit-korlát nem valósítható meg, ne készüljön aláírt preview. Alternatíva: külön jóváhagyott review és TEST merge után a hivatalos TEST frissítési folyamat.

Az aláíró job az APK-n `aapt dump badging`/`apkanalyzer` segítségével **pontos** `hu.grapes.healthconnect.test` csomagazonosítót és jóváhagyott, a telefonon telepítettnél nagyobb `versionCode`-ot ellenőriz. `apksigner verify --print-certs` eredménye pontosan a fenti SHA-256 legyen; más signer vagy más package esetén megáll. Az APK-ról `sha256sum` készül. Csak a korlátozott hozzáférésű GitHub Actions artifactként kerülhet fel az APK és a checksum, rövid megőrzési idővel. Nem készül GitHub Release, publikus letöltési link, updater-bejegyzés vagy prod build. A dokumentált build az adott commit SHA-ját, run ID-ját, verziókódját és checksumát rögzíti kulcsadat nélkül.

## Későbbi, külön jóváhagyandó gombnyomások

1. A telefonos csomag/verzió/signer és a helyreállítható mentések rögzítése; ha bármelyik bizonytalan, megállás.
2. A külön signing workflow kódjának, a védett environment szabályainak, az actor/commit ellenőrzéseknek és az artifact hozzáférésének review-ja. A szükséges változás külön, review-ra váró PR-ben marad, automatikus kulcshasználat nélkül.
3. **Új, kifejezett felhasználói engedély** a megnevezett SHA és verziószám alapján egyetlen QA APK buildjének indítására. A workflow manuális indítása és environment approval csak ezután történhet.
4. A sikeres build után külön döntés a checksum és aláírás ellenőrzött artifact letöltéséről, majd a telefonon a meglévő TEST app **helyben történő** frissítéséről. Android telepítőhibánál megállás, nincs törléses kerülőút.
5. Telepítés után a csomag és verzió újbóli ellenőrzése, majd Food/YAZIO, Víz, Drive, Home és korábbi helyi adatok visszaolvasása; a Home navigáció, 600/400 g, lista, mentés és visszavonás próbája. WebView, billentyűzet, TalkBack és safe-area külön telefonos QA-kapu.

A jelen dokumentum csak döntés-előkészítés. Nem ad engedélyt buildre, telepítésre, kiadásra vagy merge-re.
