# Grapes TEST Android — elkülönített APK és frissítési csatorna

Állapot: **implementációs draft**, nem kiadott alkalmazás. Kapcsolódó: [#20](https://github.com/fabianpetermark-commits/Grapes/issues/20) és [#21](https://github.com/fabianpetermark-commits/Grapes/pull/21).

## Miért nem a meglévő APK-t frissítjük közvetlenül?

A jelenlegi Android app csomagneve `hu.grapes.healthconnect`, a frissítő az éles `releases/latest` GitHub végpontot olvassa. Ugyanazon csomagnévvel a teszt-APK felülírhatná a már telepített Grapest, vagy más aláírókulcsnál telepítési hibát okozna. Ezért az elkülönített TEST alkalmazás **első telepítése külön APK-ból történik**, majd a későbbi TEST-kiadások önállóan frissíthetők. Az eredeti alkalmazás változatlanul megmarad.

## Új QA buildváltozat

- Gradle build type: `qa`, build parancs `gradle --project-dir android-health-connect-poc :app:assembleQa`.
- Package: `hu.grapes.healthconnect.test` (a stabil `hu.grapes.healthconnect` változatlan).
- Telepített név: **Grapes TEST**.
- Verziók: `GRAPES_VERSION_CODE` és `GRAPES_VERSION_NAME`; megjelenő QA verziónév `-test` utótaggal.
- A QA buildet külön `ANDROID_TEST_KEYSTORE_*` aláírókörnyezet támogatja. Titok nélkül a preview GitHub Actions artefaktuma ideiglenes debug-kulccsal aláírt; **nem alkalmas későbbi automatikus frissítések kiadására**.
- A stable `assembleRelease` és éles workflow változatlan.

## Frissítési csatornák

| | Meglévő Grapes | Grapes TEST |
| --- | --- | --- |
| Android package | `hu.grapes.healthconnect` | `hu.grapes.healthconnect.test` |
| Build | `assembleRelease` | `assembleQa` |
| GitHub Release | `android-v<N>` | `android-test-v<N>` |
| GitHub API | `/releases/latest` | `/releases?per_page=100` |
| Release típusa | normál, `--latest` | `--prerelease` |
| APK asset | `grapes-android-v<N>.apk` | `grapes-test-v<N>.apk` |
| Aláírókulcs | `ANDROID_KEYSTORE_*` | `ANDROID_TEST_KEYSTORE_*` |

A QA updater csak olyan, **nem draft prerelease** kiadást választ, amelynek tagje `android-test-v<number>`, a pontos fájlneve `grapes-test-v<number>.apk`, a `versionCode` nagyobb a telepítettnél, és a GitHub által közölt SHA-256 digest érvényes. A letöltött APK telepítése előtt a csomagazonosítót is ellenőrzi. A tényleges aláírás-egyezést az Android telepítő ellenőrzi.

Az éles updater változatlanul kizárólag a GitHub `releases/latest` végpontot olvassa, amely nem ad vissza prerelease kiadásokat. A TEST-kiadás semmilyen körülmények között nem jelölendő `latest`-nek.

## Preview build GitHub Actionsból

`.github/workflows/build-android-test.yml` az izolált QA appot buildeli, az `npm test` ellenőrzések után `grapes-test-preview-apk` artefaktumként. A workflow **nem hoz létre GitHub Release-t**, és nem telepít telefonra semmit.

A jelenlegi implementáció ideiglenesen a `codex/android-app` ágból leválasztott `feature/android-test-channel` ágon van, hogy ne kelljen a `develop`-ba vakon átemelni 88 más modulokat is érintő commitot. A külön TEST-build csak akkor lesz a kívánt `develop` ágról kiadható, miután az auditált Android-alapot külön PR-ben oda integráltuk.

## Aláírt TEST kiadás (CSAK KÉSŐBB, jóváhagyással)

A `.github/workflows/release-android-test.yml` manuális, és **mindig a `develop` ágat checkoutolja**. GitHubon a workflow_dispatch eléréséhez a workflow-nak általában a repository alapértelmezett ágán is jelen kell lennie; ezt külön kell ellenőrizni, nem feltételezhetjük, hogy most már indítható.

A kiadási workflow csak akkor folytatható, ha a `develop` tartalmazza a QA változatot és az alábbi négy GitHub Actions Repository Secret be van állítva:

- `ANDROID_TEST_KEYSTORE_BASE64` — hosszú távon biztonságosan őrzött PKCS#12 aláírókulcs Base64-ként;
- `ANDROID_TEST_KEYSTORE_PASSWORD`;
- `ANDROID_TEST_KEY_ALIAS`;
- `ANDROID_TEST_KEY_PASSWORD`.

**Soha ne kerüljenek ezek a repository fájljaiba, PR-be, logba vagy ChatGPT üzenetbe.** Az aláírókulcsot külön biztonságosan menteni kell: elvesztése esetén a már telepített TEST alkalmazás nem feltétlenül lesz többé frissíthető.

A TEST release csak `--prerelease` jelzéssel publikálható, külön verziószámozással. A workflow ellenőrzi az APK aláírását és pontos csomagnevét. A secrets létrehozása, új kiadás és Google Cloud módosítása **külön felhasználói jóváhagyást igényel**.

## Elkülönített TEST Google Drive mappák

A TEST-only APK buildben a `VITE_GRAPES_TEST_CHANNEL=1` beállítás a közös Grapes projektek számára a **Grapes TEST**, a mobil és webes E-book számára pedig a **Grapes TEST E-book Library** mappanevet választja. Az éles webes és Android buildek továbbra is a korábbi `Grapes` és `Grapes E-book Library` mappákat használják.

**Fontos korlát:** a Google-fiók szintjén ez nem teljes jogosultsági elkülönítés: a külön TEST alkalmazás által megkapott `drive.readonly` scope hozzáférést adhat más, már meglévő Drive-fájlok olvasásához, és a felhasználó további műveletekkel ugyanahhoz a fiókhoz csatlakozhat. Valós személyes adatok védelméhez lehetőség szerint külön teszt-Google-fiókot és kifejezetten TESThez létrehozott fájlokat használj; a QA app nem végezhet automatizált migrációt a valódi Drive-mappákból. A TEST alkalmazás Google OAuth-jogosultságát a külön `.test` csomaghoz és QA signing SHA-1-hez kell létrehozni.

## Első telefonos próba: kötelező ellenőrzések

1. A régi Grapes telepítve marad; a Grapes TEST külön ikonnal jelenik meg.
2. A régi Grapesben tárolt könyvek, Food napló, receptek és Drive kapcsolat nem sérülnek.
3. A TEST saját helyi tárolója külön van. Nem másolja át automatikusan a régi app adatait.
4. Health Connect a TEST csomaghoz **külön engedélykérést** igényel; ellenőrizni kell a forrásazonosítókat és az ismételt import duplikációvédelmét.
5. A Google Drive Android OAuth klienshez **külön package + TEST aláíró SHA-1** konfiguráció kell; a jelenlegi release Android OAuth kliens önmagában nem lesz megfelelő. Enélkül a natív Drive belépés hibára futhat.
6. TEST előkiadás nem jelenhet meg az éles Grapesben; éles kiadás nem jelenhet meg Grapes TEST-frissítésként.
7. Ugyanazzal a TEST aláírókulccsal kiadott magasabb versionCode frissítheti a TEST appot, annak helyi adatait megőrizve.
8. Android kamera/vonalkód, YAZIO, USDA, OFF, FatSecret, Samsung/Health Connect, e-book/Drive és normál háttérnavigáció valós készülékes ellenőrzése szükséges.

## Korlátok és leállási feltételek

- **Nincs merge, release, telepítés vagy éles deployment.**
- Ez a PR a külön csatornát előkészíti, nem bizonyítja a valós telefonos működést.
- Automatizált ellenőrzésre `node --test tests/android-test-channel.test.js`, `npm test`, `npm run build:android-web`, majd Android Gradle `:app:assembleQa` szükséges.
- A CI preview debug aláírásának cseréje a későbbi TEST release kulcsára meglévő preview app telepítése esetén eltávolítást/újratelepítést igényelhet; emiatt a felhasználói adatokkal végzett tesztelést **csak az állandó TEST aláírású alkalmazással** javasolt megkezdeni.
- Teljes bekötés csak az Android alap célzott `develop` integrációja, zöld build és eszközteszt után következhet.
