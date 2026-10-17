# Android-platform átemelés a develop integrációs ágba

2026-10-17 — **csak integrációs fejlesztői ág, még nem merge-elt PR**.

## Kiindulás és megőrzés

- Cél: a jelenlegi Android-shell és a külön Grapes TEST build **szükséges állományainak** integrálása a `develop` ágba, úgy, hogy a `main`, a meglévő `codex/android-app` és `feature/food-v23` ágak változatlanok maradnak.
- Forrás: `feature/android-test-channel` (a korábban sikeresen fordított QA preview).
- Célág: `feature/android-platform-develop`, tisztán a `develop` ágról indult.
- A teljes `codex/android-app` ág **nem kerül automatikusan beolvasztásra**; a kiválasztott fájlok tartalma beemelt, önálló commitokra osztva.

## Szétválasztott állománycsoportok

1. **Natív Android-keret**: Gradle, AndroidManifest, MainActivity, HealthConnectBridge, YazioApi, alkalmazásfrissítő, munkafolyamat és értesítések, Android ikonok és saját TEST appnév.
2. **TEST csatorna**: Gradle `qa` build, az `android-test-vN` prerelease és saját APK-ellenőrzés; elkülönített, kizárólag manuálisan indítható TEST release-terv; önálló GitHub CI preview.
3. **Android-only web mobilfelület**: `design/android-mobile-preview.html`, `src/android-mobile-shell.js`, `src/android-bridge.js`, ikonok, `vite.config.js` második build entrypoint.
4. **Közvetlen webes függőségek**: e-book mobil olvasó/tallózó/átvitel, Food mobil controller és kereső/YAZIO/Health/Drive segédek, valamint EPUB reader adatkezelési bővítése. Ezek egy része a közös Food/Drive adatmodellre is hat; ezért regressziós ellenőrzést igényel.
5. **Fókuszált tesztek**: Android shell/QA release, Food import, Health és YAZIO regressziók.

## Tudatosan NEM átvett, nem platformalap-kód

- `apps-script/ebook-transfer/Code.gs` és minden élő Apps Script deployment
- `src/finance-tracker.js`, pénzügyi OCR és CSS átszervezés
- `src/food/food-app.js`, a webes Food asztali felület nagy kísérleti módosításai
- `src/main.js`, `index.html`, a fő Grapes felület strukturális átalakításai
- `src/ebook-library.js`, e-book általános editor/Drive szinkron módosításai
- `src/styles/screens/*.css`, üzleti modulok külön stílusprojektjei
- Egyéb, az Android mobil shell számára közvetlenül nem szükséges dokumentumok, képek, archívumok és kísérleti funkciók.

## Szándékos és igazolandó kompromisszumok

A meglévő telefonos UI **statikusan importálja** a Food, YAZIO, e-book és Drive kódot. Nem lehet pusztán a Kotlin fájlokat átvenni: a mobil apphoz szükséges függőségek a `develop`-ra kerülés előtt is a kiválasztott állományokban együtt léteznek. A funkciók fokozatos szétválasztása a következő fázis lesz.

A jelen baseline a `codex/android-app` állapotát konzerválja, **nem** az összes új Food v23/USDA fejlesztést. A korábban jól működő funkciókat a `food-v23` backup és feature ágakon megőrizzük; célzott PR-ekkel kell később a `develop`-ba beemelni.

## Elfogadás ezen az ágon

- `npm ci && npm test && npm run build:android-web` sikeres
- `gradle --project-dir android-health-connect-poc :app:assembleQa` sikeres
- `aapt` ellenőrizze a `hu.grapes.healthconnect.test` package azonosítót
- `grapes-test-preview-apk` kizárólag CI artifact, **nem** Release
- Az Android buildben a mobil UI bejárása, helyi mentés és e-book/food funkciók browser + valós készülék ellenőrzése
- A `develop` célágba merge **csak az ellenőrzések után, külön felhasználói jóváhagyással**.
- Állandó TEST aláírás és Google Drive Android OAuth kliens még nincs beállítva; a debug preview nem éles tesztfrissítési csatorna.
