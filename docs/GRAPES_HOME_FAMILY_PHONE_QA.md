# Grapes Egységes Otthon — v50 TEST APK telefonos elfogadási próba

**Állapot: TELEFONON NOT RUN (2026-10-27).** Az APK natív és teljes böngészős tesztkapui **14/14 PASS** a #192 PR-en; a Codex #190/#193 által felfedezett két késői CAS/read_attempt fiókváltási hibát a #192 branchben kijavítottuk, a böngészős fullchain teszt PASS. **A telefonos működés még nem igazolt.**

## Ellenőrzött TESZT-csomag

- Forrás: `codex/android-app`, PR **#192**, squash commit `111bd141b78d4825a25428fe3116d04d89e018cf`; APK az eredeti QA head `da3d3ef989a02c556fcdb76ae98d41453cb712ea` commiton épült.
- GitHub Actions: https://github.com/fabianpetermark-commits/Grapes/actions/runs/40544521094
- Artifact: `grapes-one-home-v50-signed-test-only` (`grapes-one-home-v50-test-signed.apk`, `grapes-one-home-v50-test-signed.apk.sha256`). A workflow hét napig őrzi az artifactot (2026-11-03-ig).
- APK SHA-256: `18f3c96c43f0da1f3da8c644a2d526131e2f2c09c10ad0c2a21493d9a779a915` — a letöltött ZIP-ből visszaellenőrizve.
- Android package: `hu.grapes.healthconnect.test`; `versionCode=50`; a CI az aláíró SHA-256 tanúsítványt a meglévő TEST kulcshoz egyeztette: `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`.
- Csak a Supabase **TEST** projekt: `aighqtqjlzirlokxwupt`. A PROD Supabase: `yopabovoxyffhokhbgxl`, **tilos érinteni**. A telefonon végzett családi tesztek valódi TEST-adatmódosításokat hajtanak végre, csak a már ismert tesztfiókokkal és háztartással végezd.

## Előkészítés és frissítés

1. Jegyezd fel az előző TEST appban meglévő Home / Food / Finance / Health adatokból néhány nem érzékeny kontrolltétel nevét. Ne készíts képernyőképet jelszóról vagy bearer tokenről.
2. Töltsd le a fenti workflow **TEST APK** artifactját, és ellenőrizd a hash értéket (Linux/macOS: `sha256sum grapes-one-home-v50-test-signed.apk`; Windows: `Get-FileHash .\grapes-one-home-v50-test-signed.apk -Algorithm SHA256`).
3. Opcionális Android SDK ellenőrzés: `apksigner verify --print-certs grapes-one-home-v50-test-signed.apk`, `aapt dump badging grapes-one-home-v50-test-signed.apk`; ellenőrizd a fenti tanúsítványt, csomagazonosítót és verziót.
4. **A meglévő Grapes TEST alkalmazás fölé telepítsd** (Android fájlkezelő vagy `adb install -r grapes-one-home-v50-test-signed.apk`). **Ne töröld az alkalmazást, ne töröld az adatait és ne engedélyezz downgrade-et.** Ha aláírás vagy csomagazonosító eltérés miatt hibázik, állj meg és jelezd; ne oldd meg adattörléssel.
5. Az éles Grapes alkalmazás nem célpontja ennek a tesztnek.

## A/B, offline és biztonság — kézi ellenőrzések

| # | Teendő | PASS feltétel | Eredmény |
| --- | --- | --- | --- |
| 1 | Nyisd meg a TEST appot, jelentkezz be az **A** Grapes TEST-fiókkal | A fiók hitelesített; a közös Otthonon **Bevásárlás, Készlet, Javaslatok** működik, nincs Saját/Közös vagy külön outbox menü | NOT RUN |
| 2 | Ha A több családi háztartás tagja, válaszd ki a közöset | Nem nyit meg tetszőleges másik háztartást; a választott család listája látható | NOT RUN |
| 3 | A létrehoz egy egyedi nevű listaelemet (pl. `v50 QA tej 2 l`) | „Szinkronizálva”, elem egyszer szerepel, készlet változatlan | NOT RUN |
| 4 | Lépj át a **B** TEST-fiókra; nyisd meg ugyanazt a családi Otthont | A új eleme B-nél látható; B saját korábbi képernyő- és outbox-adatai nem keverednek A személyes adataival | NOT RUN |
| 5 | B változtasson egy másik listaelemen, A frissítse a Home-ot | A B módosítását látja, külön fiókok közös családi adata működik | NOT RUN |
| 6 | A-val kapcsold be a repülő módot, vegyél fel egy új listaelemet | „1 módosítás várakozik”, a módosítás látható; nincs hamis szinkronizálva állapot | NOT RUN |
| 7 | Tedd háttérbe / indítsd újra a TEST appot ugyanazzal az A-fiókkal, még offline | Az offline művelet megmaradt; nincs duplikáció; ha a bejelentkezés online megújítást kér, a pending állapot ellenőrzéséig ne töröld a tárolót | NOT RUN |
| 8 | Kapcsold vissza a hálózatot, nyisd előtérbe az appot | A műveletet egyszer szinkronizálja, „Szinkronizálva”; B-nél egyetlen új elem jelenik meg | NOT RUN |
| 9 | A offline pending módosítása mellett válts A→B→A fiókot | B alatt A függő javaslata nem látszik; A-ba visszatérve a saját pending művelet megmarad | NOT RUN |
| 10 | Mentés közben, késleltetett internetnél válts A-ról B-re | Sem a CAS, sem a `read_attempt` késve érkező válasza nem mutathatja A védett adatait B alatt; ezt a Codex korábban reprodukálta, a #192 javította browser teszttel | NOT RUN |
| 11 | A offline módosítás mellett B módosítsa a közös revíziót, majd A kapcsolódjon vissza | „Ütközés”: nincs automatikus felülírás, a függő javaslat megmarad; nincs garantált automatikus konfliktusfeloldás | NOT RUN |
| 12 | Jelölj `Megvettem`-ként egy listaelemet | Az elem állapota megváltozik, de a készletbe **nem** kerül automatikusan | NOT RUN |
| 13 | Ellenőrizd a régi kontrolltételeket a frissítés előtt/után | A PROD app és a meglévő Food, Finance, Health adatok nem sérültek; a személyes Home v1 nem kerül a családi v2-be engedély nélkül | NOT RUN |
| 14 | Keskeny kijelző / nagy betű / TalkBack | Nincs vízszintes túlnyúlás, a kis szinkronstátusz kezelhető és felolvasható | NOT RUN |

**Tesztjegyzőkönyv:** minden tételnél jelöld PASS/FAIL/NOT RUN, röviden írd le a várt/tényleges eredményt, és ahol releváns, rögzíts képernyőképet a Home-ról. Személyes adatot és jelszót ne másolj a PR-be. A régi alkalmazás adatait a teszt kedvéért ne töröld.

**GO/NO-GO:** ez a v50 a sikeres CI ellenére továbbra is csak **TEST jelölt**. A natív telefonos A/B, offline visszaszinkron és a fiókváltási adatelrejtés bizonyítása után lehet PROD-release jelöltről dönteni. Nem történt PROD-adatbázis-migráció vagy PROD APK-kiadás.
