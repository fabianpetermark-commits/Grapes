# Grapes Food v0.8.0 – élesítés előkészítése (NEM kiadás)

**Állapot:** csak elkülönített, review-ra váró fejlesztési ág. A tényleges Android release, `codex/android-app` és `main` nem változhat további ellenőrzés és külön jóváhagyás nélkül.

## Származás és scope

- Bázis: `codex/android-app` (a meglévő stabil Android-app forrása).
- Forrás: `integration/grapes-test-food-20261017` (aláírt TEST v0.8.0).
- Átemelve: `src/food/**` szükséges változásai, Food mobil web markup, szükséges `src/android-mobile-shell.js` és `src/android-bridge.js`, natív kamerás / USDA / YAZIO integráció, releváns unit és böngészős regressziós tesztek.
- **Nem átemelve:** QA buildvariáns / QA aláírás / TEST updater, `test-release.json`, TEST workflow-k, pénzügyi/e-book újítások, `apps-script/ebook-transfer/Code.gs` és a TEST Google Drive gyökérmappa.
- A `src/storage/grapes-drive.js` és a stabil `release-android.yml` változatlan; a rendes Drive-gyökér `Grapes`, az Android package `hu.grapes.healthconnect`.

## Még ellenőrizendő, mielőtt egyáltalán merge-ről döntünk

1. **Mentés és visszaállítás**: stabil Food biztonsági mentés `grapes-etelnaplo-*.json` exportja **frissítés előtt**; külön ellenőrzés, hogy a letöltött fájl ténylegesen létezik és tartalmaz ételeket, recepteket, naplókat, célokat, importmetaadatokat. Drive-projekt másolata / visszaállíthatóság ellenőrzése a meglévő fájl felülírása nélkül.
2. **Migráció adatokkal**: régi projekt `FOOD_PROJECT_VERSION=2` betöltése az új kóddal; mentés/újranyitás utáni mennyiség-, ID- és tápértékazonosság, régi receptek megtartása. Későbbi visszalépésre régi appal **nem támaszkodhatunk**: az új `instructionsHtml`/helyi receptkép felülíródhat.
3. **Drive**: a TEST `Grapes TEST` és az éles `Grapes` elkülönítve marad. A TEST adatát nem importáljuk és nem szinkronizáljuk automatikusan az éles adattal. Hálózati hiba és helyi nem szinkronizált adatok esetén nincs csendes felülírás. Két eszköz egyidejű szerkesztésének ütközése külön manuális teszt.
4. **Health Connect és YAZIO**: történeti import, előnézet, deduplikáció, visszavonás, külön kapcsolókkal opt-in automatikus szinkron. Valós telefonon jogosultság és importmennyiségek ellenőrzése.
5. **Receptek**: régi recept + új kép + formázott elkészítés + hozzávaló egységátváltás + USDA/OFF keresés + import előnézet/fájlválasztó; **PDF-import továbbra sincs**, és a CORS blokkolt oldalak továbbra sem ígérhetők működőnek.
6. **Más modulok**: víznapló teljes előzménye megmarad; Finance, E-book, általános Drive kapcsolódás, Android visszalépés és értesítések regresszió; az integrációs HTML és a mobil shell vízpanelhez/értesítésekhez kapcsolódó változásai külön felülvizsgálandók.
7. **Android**: natív debug assemble (nem aláírt release), kamerajogosultság, YAZIO CredentialVault, natív USDA-híd; a **stabil** release tanúsítvány/azonosító és update mechanizmus változatlan.
8. **Valódi éles build csak később**: előbb zöld unit + böngészős + Android debug CI, valós eszközön adatbiztonsági teszt, visszaállítási próba, majd külön felhasználói jóváhagyás a `codex/android-app` merge-re és az aláírt éles APK kiadására. Stabil ágon nem szabad TEST APK-t publikálni.

## Release-kapu

A merge és release **tilos**, amíg a fenti ellenőrzések (különösen a régi adatokból történő roundtrip és a Drive-mentés ütközési próbája) nincsenek teljesítve. A GitHub CI önmagában nem helyettesíti a telefonos ellenőrzést.

A projekt azonosítója és a kiadási workflow ne változzon; a szinkronizálás alapértelmezett viselkedését és az adatok visszaállíthatóságát kiadás előtt újra át kell nézni.
