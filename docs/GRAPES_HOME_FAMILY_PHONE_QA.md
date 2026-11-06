# Egységes Otthon – telefonos TEST APK ellenőrzőlista (#190)

Állapot: **NOT RUN**. Ezt a listát a későbbi natív integráció TEST APK-jával kell végrehajtani. Az alap A/B családmegosztást a felhasználó korábban telefonon már sikeresen ellenőrizte; ez a lista a kibővített regresszióhoz készült, nem állít új telefonos eredményt. PROD fiókot/adatbázist ne használj.

## Telepítés és azonosítás

- [ ] Rögzítsd: tesztelő, dátum, telefon/Android-verzió, APK forrása, Git commit, TEST projekt, A/B tesztfiók és háztartás azonosítója (jelszó/JWT nélkül).
- [ ] A kiadó által átadott APK SHA-256: `sha256sum TEST.apk` (Windows: `Get-FileHash TEST.apk -Algorithm SHA256`). Vesd össze a kiadó ellenőrzőösszegével.
- [ ] Android SDK: `apksigner verify --verbose --print-certs TEST.apk`. Jegyezd fel az aláíró SHA-256 tanúsítványujjlenyomatát; egyezzen a telepített TEST változat kiadó által igazolt tanúsítványával.
- [ ] `aapt dump badging TEST.apk`: ellenőrizd a `package: name`, `versionCode`, `versionName` értékeit; egyezzenek a TEST kiadási adatokkal, a verziókód ne legyen visszalépés.
- [ ] A telefonon a Beállítások → Alkalmazások alatt ellenőrizd a meglévő TEST app verzióját. A csomagazonosító a kiadó által átadott TEST azonosító legyen; ne találgasd.
- [ ] **A meglévő TEST app fölé telepíts**, például `adb install -r TEST.apk`. Ne töröld az appot, ne töröld az adatait, ne használj downgrade kapcsolót. Aláírás/csomaghiba esetén állj meg és jegyezd fel; ne kerüld meg adattörléssel.

## Felhasználói próba két TEST fiókkal

| Próba | Lépés és elvárt eredmény | Eredmény / bizonyíték |
| --- | --- | --- |
| Adatmegőrzés | Frissítés előtt és után ugyanazok a személyes v1, Food, Finance és Health adatok. Írd fel néhány ismert tétel nevét/darabszámát. | NOT RUN |
| Egységes Otthon | Egy Otthon, állandó Bevásárlás/Készlet/Javaslatok szekció, nincs Saját/Közös kapcsoló vagy külön Kimenő üzenetek képernyő. | NOT RUN |
| A/B közös adat | A és B ugyanannak a TEST családnak tagja. A közös listaelem és revízió B-nél is megjelenik. Személyes v1 tétel nem kerül közéjük. Csak ellenőrzött állapot zöld. | NOT RUN |
| Tartós offline művelet | A: repülő mód, új listaelem → „1 módosítás várakozik”. App háttérbe, bezárás és újranyitás; ugyanaz a tétel várakozik, nem duplázódik. | NOT RUN |
| Automatikus folytatás | Repülő mód ki → előtérbe vissza → „Szinkronizálva”. B-nél egyetlen példány és új revízió látszik. Többszöri hálózatváltás sem dupláz. | NOT RUN |
| A→B→A | A offline javaslata mellett válts B-re: A korábbi képernyőadata és várakozó javaslata nem látható. A-ra visszatérve a saját javaslat megmarad. Ugyanazon család igazolt közös adatai B-nél természetesen láthatók. | NOT RUN |
| Lassú válasz közbeni váltás | Korlátozott hálózat mellett indíts mentést, közben válts A-ról B-re. A régi válasza nem jelenítheti meg A javaslatát B alatt. **A böngészős QA jelenleg itt NO-GO hibát mutat; javítás után kötelező újramérni.** | NOT RUN |
| Jogosultság | Owner/editor tud módosítani. Viewer látja a közös adatot, de nem adhat hozzá, nem szerkeszthet és nem jelölhet vásároltnak. | NOT RUN |
| Hálózati hiba | Megszakított mentés után nincs hamis zöld státusz. A javaslat megmarad, az „Újrapróbálás” elérhető, későbbi siker nem dupláz. | NOT RUN |
| Tudatos konfliktus | A offline javaslatot készít; B online módosítja ugyanazt a revíziót. A online lesz → ütközés, javaslat megmarad, nincs automatikus felülírás. Rögzítsd a javaslatot és kérj kézi egyeztetést; a jelenlegi QA nem igazol kész konfliktusfeloldó UI-t. | NOT RUN |
| Megvettem | Rögzítsd a készletet. Egy listatételnél „Megvettem” → elintézett listaelem, a készlet neve/mennyisége nem változik. | NOT RUN |
| Ismeretlen mennyiség | Mennyiség nélküli listaelem nem készlet és nem igazolt hiány. Csak kézzel megerősített nulla készletből lehet hiányjavaslat. | NOT RUN |
| Mobil / akadálymentesség | Keskeny kijelzőn és nagyított betűvel nincs vízszintes túlnyúlás; a kis szinkronjelzés és az Újrapróbálás olvasható/kezelhető. TalkBack felolvassa a státuszváltozást. | NOT RUN |

Minden sorhoz PASS/FAIL/NOT RUN, időpont, képernyőkép és a tényleges revízió kerüljön. Hibánál írd le a lépéseket és a várt/tényleges eredményt; ne töröld a függő javaslatot és ne ismételd új műveletként a bizonytalan mentést. Személyes adatot, jelszót és tokent ne csatolj. APK-készítés, aláírás és kiadás nem része ennek a QA-feladatnak.
