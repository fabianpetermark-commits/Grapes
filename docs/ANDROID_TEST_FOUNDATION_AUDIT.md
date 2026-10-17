# Grapes Android TEST – alapvizsgálat és biztonságos bevezetési terv

Állapot: **audit/terv, nem implementáció**. Dátum: 2026-10-17. Kapcsolódó feladat: [#20](https://github.com/fabianpetermark-commits/Grapes/issues/20).

## Megőrzési szabály

- A `main`, `codex/android-app`, `feature/food-v23`, `feature/food-yazio-safe-import`, `feature/food-off-region-settings` és a két `backup/*-before-split-20261017` ág érintetlenül marad.
- Ez a dokumentum a `develop` ágból indított **külön auditágon** készül; nincs merge, APK vagy release.
- Az éles alkalmazást és a meglévő, telefonon használt tesztalkalmazást **nem** helyettesítjük, amíg az új tesztcsatornát készüléken nem igazoltuk.
- A felhasználó által már kipróbált, megfelelően működő funkciókat megőrzendőnek tekintjük. Ez nem egyenlő a regressziós/integrációs teszt teljesítésével.

## Ellenőrzött GitHub-ágviszonyok

| Összehasonlítás | További commitok | Megjegyzés |
| --- | ---: | --- |
| `main` → `codex/android-app` | 88 | Meglévő Android tesztapp + más modulok |
| `codex/android-app` → `feature/food-v23` | 147 | Új Food/USDA/UI + más modulok |
| `feature/food-v23` → `feature/food-off-region-settings` | 2 | OFF országválasztó |
| `main` → `feature/food-yazio-safe-import` | 37 | YAZIO / OFF / FatSecret közös PR #15 |
| `main` → `feature/food-v23` | 235 | Food v23 PR #18, több modullal |

A `develop` kezdetben a `main`-nel azonos. **Nem** építhetünk belőle jelenleg működő Android TEST APK-t az Android alap előzetes integrálása nélkül. Ugyanakkor a `codex/android-app` teljes, 88 commitból álló ágának automatikus merge-e sem ajánlott: nem kizárólag Android-alapmódosításokat tartalmaz.

## Jelenlegi Android build: konkrét tények

A `codex/android-app` ágon:

- `.github/workflows/build-android.yml`: Node.js 24, `npm ci`, `npm run build:android-web`, JDK 17, Android SDK 36, Gradle 8.11.1, `assembleDebug`; `grapes-debug-apk` artifact. A push trigger csak `codex/android-app` ágra van konfigurálva.
- `.github/workflows/release-android.yml`: `workflow_dispatch`, a checkout **rögzítetten** `codex/android-app`; kiadott, aláírt `app-release.apk`; `android-v<version_code>` tag; GitHub Release `--latest`. Ez az éles frissítési csatorna, **nem** tesztcsatorna.
- `android-health-connect-poc/app/build.gradle.kts`: Android `applicationId = "hu.grapes.healthconnect"`; a normál kiadás ugyanazzal a csomagazonosítóval települ. A release aláírás GitHub secrets / env alapján történik.
- `AndroidUpdateManager.kt`: a `/releases/latest` végpontról olvas és az `android-v(\\d+)` tag alapján dönt; első `.apk` asset és GitHub `sha256` digest alapján frissít. A `latest` végpont nem alkalmas önmagában elkülönített tesztcsatornára.
- `UpdateCheckWorker.kt`: hatóránkénti háttérellenőrzés; a `MainActivity.kt` előtérbe hozáskor külön, kényszerített ellenőrzést indít.
- `MainActivity.kt`: helyben csomagolt `design/android-mobile-preview.html` webes app, natív Health Connect/Google Drive híd, updater.
- `deploy-pages.yml`: pushra csak a `main` ágon deployol. A tesztfejlesztésből nem indítunk éles Pages deploymentet.

### Bizonyított ütközési kockázatok és blokkolók

1. **Telepítési ütközés:** teszt APK és éles APK azonos `applicationId` esetén egymást felülírhatják, vagy eltérő aláírás miatt telepítési hibát kapunk. Külön párhuzamos apphoz külön csomagazonosító (javaslat: `hu.grapes.healthconnect.test`) kell.
2. **Frissítési csatorna:** az éles updater `releases/latest` végpontot nézi, az éles kiadási workflow `--latest` kapcsolót használ. A TEST APK kizárólag `android-test-vN` előkiadásokat és saját, külön azonosított APK assetet fogadhat el; az éles updater nem tekinthet TEST release-t frissítésnek.
3. **Aláírás:** az új TEST kiadások között is következetes, védett aláírókulcs szükséges, különben az Android nem fog frissítést telepíteni. A GitHub Actions egyszeri debug aláírására nem építhetünk updater-csatornát.
4. **Drive OAuth:** a jelenlegi Android OAuth kliens `hu.grapes.healthconnect` csomagnévhez és release aláíráshoz kötött. A `.test` csomagazonosítóhoz új Android OAuth kliens konfiguráció és készülékes próba szükséges; e nélkül Google Drive-belépés status 10 hibával meghiúsulhat.
5. **Health Connect és helyi adatok:** más package ID külön Android-engedélyeket és helyi app-adattárolást jelent; a valódi adatok migrációját nem szabad automatikusan feltételezni. Az `appassets.androidplatform.net` közös WebView-origin nem szünteti meg az app-azonosító szerinti adatizolációt.
6. **`workflow_dispatch` láthatósága:** külön tesztkiadási workflow manuális futtatásának GitHub default-branch követelményeit ellenőrizni kell, mielőtt csatornát ígérünk; a tesztworkflow GitHub felületi elérhetőségét igazolni szükséges.
7. **Visszaállíthatóság:** a régi tesztapp APK-jának verziója, csomagazonosítója, signing certificate-je és eredeti release-címkéje készüléken ellenőrzendő. Egy korábbi verzió visszatelepítése önmagában nem garantált adatmegőrző downgrade.

## Javasolt fejlesztési sorrend (jóváhagyás után)

### 1. Android platformalap különítése
- `codex/android-app` alapján **új implementációs ágon** vizsgáljuk meg, hogy a teszt shell és natív bridge mely fájlokból áll; külső e-book/finance módosításokat ne emeljünk át automatikusan.
- Alapfunkciók: mobil felület, fájlválasztás, helyi tárolás, Android bridge, Health Connect kapcsolat, alkalmazásfrissítő.
- Szétválasztáshoz fájlszintű és helyenként hunk-szintű diff szükséges.

### 2. Külön TEST Android build és frissítés
- TEST-hez külön Gradle buildkonfiguráció / `applicationId`, `Grapes TEST` látható alkalmazásnév, ellenőrizhető buildverzió.
- TEST frissítéseit kizárólag külön tag-prefixű, `prerelease` GitHub Releases listából válasszuk ki, a legmagasabb megfelelő `versionCode` alapján; csak saját APK-asset, SHA-256 és azonos package ID elfogadásával.
- A normál `AndroidUpdateManager` éles viselkedése maradjon változatlan; tesztcsatorna és éles csatorna egyértelmű, tesztelhető elválasztása.
- A teszt-release soha ne legyen `latest`; ne módosítsuk az éles release-workflow-t előzetes jóváhagyás nélkül.
- Kezdetben csak **nem publikált CI-artifact** készüljön review-hoz. Aláírt TEST release kizárólag külön engedéllyel.

### 3. `develop` integráció
- Előbb az Android- és UI-alap függőségei, aztán a működőnek jelzett funkciók külön PR-ekben: USDA; OFF/FatSecret; OFF régióválasztó; YAZIO előzményimport; Health Connect/YAZIO natív híd.
- Az `src/food/food-mobile.js` több területet együtt köt össze; receptek, UI, kereső, célok, statisztika és szinkron módosításait hunk-szinten, tesztekkel kell szétválasztani.
- Funkciónként elfogadási teszt: unit, browser, Android build, telefonos próba, meglévő adatok megtartása.

### 4. `main` integráció
- Csak a `develop`-on és a TEST APK-ban ellenőrzött funkciót + szükséges függőségeket vigyük át önálló éles PR-ként. Ne merge-eljük teljes egészében a `develop`-ot.
- Élesítést és release-t kizárólag a felhasználó külön jóváhagyásával.

## Felhasználói tapasztalat alapján működő funkciók (megőrzendők)

A felhasználó szerint „egészen jól működik”: OFF országválasztás, USDA keresés, OFF/FatSecret keresés, YAZIO-import nagy része, Android updater, Health Connect, közvetlen YAZIO API és Android natív keresőhíd. Ezeknél **regressziótilalom**, nem újraírás a cél. A teljes API/telefonos tesztek eredményeit ettől külön dokumentáljuk.

## Kötelező elfogadási tesztmátrix (TEST kiadás előtt)

| Ellenőrzés | Elvárt eredmény |
| --- | --- |
| `npm test` / browser-tesztek / `npm run build:android-web` | Minden érintett ellenőrzés sikeres; mock vs. élő eredmény jelölve |
| Android Gradle build / APK signature check | TEST build reprodukálható, aláírás ellenőrizhető |
| Package ID + test/stable telepítés | Mindkét app telepíthető egymás mellé, nincs adatfelülírás |
| TEST frissítés | Csak `android-test-v*` megengedett, stabil release soha nem ajánlható |
| Stabil frissítés | TEST előkiadás soha nem ajánlható, korábbi stable updater viselkedés változatlan |
| Google Drive | OAuth kliens/csomagnév/SHA-1 megfelel, olvasás és írás a megszokott jogosultságokkal |
| Health Connect | Külön permission grant és idempotens import, nem keverednek az appok adatai |
| YAZIO | Előzményimport backup/restore és ismételt import duplikáció nélkül |
| OFF/USDA/FatSecret | Név-/vonalkódkeresés, régióválasztás, offline és API-hibakezelés |
| Kamera / visszalépés / helyi mentés | Valódi készüléken validálva, nincs adatvesztés |
| Recovery | Eredeti app és eredeti branch/release érintetlen, eltérés esetén megállítás |

## Jelen audit korlátai

Ez **GitHub-ágak összehasonlításából és forrásfájlok olvasásából** készült, nem megismételt Android- vagy valós API-teszt. CI-t és APK buildet ez a dokumentációs PR **nem indít**. A jelenlegi telefonon telepített build pontos verziója, csomagazonosítója és aláírása még nincs készüléken ellenőrizve.

## Jóváhagyási kapu

Az implementáció csak ezen audit felülvizsgálata után indulhat külön feature ágon, draft PR-ben. Ne merge-elj, ne publikálj APK-t/release-t és ne változtass Google Cloud vagy Apps Script konfigurációt előzetes jóváhagyás nélkül.
