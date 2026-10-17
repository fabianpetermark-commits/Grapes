# Grapes TEST — gyors fejlesztési és kiadási folyamat

## Miért?

A Grapes Android TEST a webes felületet (HTML/JS/CSS) az APK-ba csomagolja.
Egy receptmező változtatása ezért **a telefonra telepíthető végleges frissítéshez továbbra is új APK-t igényel**. Nincs jelenleg külön kódfoltozó OTA (over-the-air) rendszer, és nincs böngészőből futás közben automatikusan letöltött, aláírt web-bundle.

A fejlesztés közbeni *minden commit után* azonban felesleges Android SDK-t telepíteni és a teljes Gradle APK-t újrafordítani.

## Új alapműködés

| Esemény | Tesztek | Android APK |
|---|---|---|
| TEST funkcióág → PR a TEST integrációs ágba | `npm test`, Vite Android-web build, Chromium-receptteszt | **Nem készül** |
| Új commit az integrációs TEST ágon | Ugyanezek a gyors tesztek | **Nem készül** |
| Elavult gyors ellenőrzés helyett újabb commit érkezik | Régebbi ellenőrzés leáll, az új fut | **Nem készül** |
| Kifejezett kézi debug előnézet (`workflow_dispatch`) | Gyors tesztek + Gradle | Debug-aláírt, **nem telepíthető rá a végleges TEST appra** |
| Jóváhagyott TEST vN kiadás: `android-health-connect-poc/test-release.json` verzióváltás az integrációs ágon | Teljes release-validáció, Chromium és Gradle | **Egy** állandó kulccsal aláírt `grapes-test-vN.apk` |

A gyors ellenőrzés a `.github/workflows/build-android-test.yml` fájlban van. A valódi készülékre frissíthető TEST-kiadás továbbra is a külön `.github/workflows/release-android-test.yml` folyamatot használja.

## Példa új Food fejlesztésre

1. A fejlesztést külön funkcióágon készítjük a `integration/grapes-test-food-20261017` alapról.
2. Csak a kódot és a teszteket változtatjuk; **nem** módosítjuk a `test-release.json` fájlt.
3. Gyors unit- és böngészős ellenőrzések futnak, valós Android APK még nem készül.
4. A jól letesztelt módosítások TEST integrációs ágba kerülnek, de még nincsenek telepítve a telefonra.
5. Amikor a fejlesztési csomag készen áll, **egyszer** növeljük a `test-release.json` versionCode-ot és frissítjük a release jegyzetet.
6. A külön TEST release workflow npm/build/Chromium + Gradle aláírást, APK-csomagnév- és tanúsítványellenőrzést futtat, és létrehozza a `android-test-vN` GitHub prerelease-t.
7. Az állandó aláírású TEST app a következő vN verziót az alkalmazáson belül ajánlhatja fel; a telefon adatai megmaradnak, nincs újratelepítés.

**FONTOS:** Kézi preview során a `grapes-test-preview-apk` GitHub artifact csak fejlesztési diagnosztikára szolgál. Az eltérő debug-aláírás miatt azt soha ne ajánljuk a jelenlegi állandóan aláírt Grapes TEST app frissítéseként. A tényleges felhasználói telepítéshez kizárólag `android-test-vN` prerelease / `grapes-test-vN.apk` tartozik.

## Mi nem változott?

- Az éles Grapes, a `main`, `develop` és `codex/android-app` nem módosul.
- A TEST adatait és külön Drive-könyvtárát nem érintjük.
- Az éles Android aláírókulcs soha nem kerül a TEST workflow-ba.
- A TEST-változtatásokat nem telepítjük automatikusan, amíg a felhasználó nem kér egy következő TEST kiadást.
- A teljes npm unit regresszió és a receptes Chromium teszt megtartott ellenőrzési kapu. Ezek nagyságrendekkel olcsóbbak, mint egy új Android SDK + Gradle APK build, a valódi natív integráció továbbra is a kiadás során van ellenőrizve.

Ez **CI-folyamatoptimalizálás**, nem natív Android „hot update” funkció. A későbbi, valódi részleges távoli webes modulfrissítési rendszert csak külön, biztonsági és verziókompatibilitási tervvel lenne érdemes kialakítani.
