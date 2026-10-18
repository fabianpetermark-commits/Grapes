# Grapes Food – egyszerűsített élesítési terv (még NEM kiadás)

**Állapot:** előkészítés a [PR #35](https://github.com/fabianpetermark-commits/Grapes/pull/35) fejlesztési ágán. Az éles `codex/android-app` ág, a kiadási APK és a felhasználó Drive-adatai nem változtak. Az éles merge és az aláírt APK kiadásához új, külön jóváhagyás kell.

## Mi marad?

- A TEST v0.8.0 új Food-felülete, saját ételek, receptszerkesztő, USDA/Open Food Facts keresés, Health Connect, YAZIO importok és statisztika.
- A v23-mal javított **valós Android fájlmentés** és a Food JSON backup visszaállítása.
- A korábbi helyi Food-adat megőrzése ugyanazon alkalmazás frissítésekor (az alkalmazást törölni vagy az adatait törölni tilos).
- A meglévő Drive-projekt automatikus, csendes felülírását tiltó alapvédelem (`food-drive-safety.js`). A Drive-kötés nélküli helyi napló nem írhat rá egy másik felhős példányra.
- A **külön tárolt Víz napló** (`grapes-water-v1`) teljes JSON-exportja, ellenőrzött importja és helyi visszaállítási másolata. Nem kerül a Food JSON-ba és nem szinkronizálódik automatikusan a Drive-ra.
- Éles alkalmazásazonosító: `hu.grapes.healthconnect`, Drive-gyökér: `Grapes`; a TEST csomagnév, TEST mappa, TEST updater és QA aláírás nincs az élesítésben.

## Mi került ki?

- Különböző Food-profilazonosítók automatikus összefésülése.
- Többlépcsős jóváhagyásos migrációs képernyő, IndexedDB migrációs helyreállítási rendszer, második Drive-felülíró művelet és a hozzájuk tartozó külön tesztkód.
- A két YAZIO-importforrás archívumainak automatikus egyesítése. Az eredeti mentések változatlanul rendelkezésre állnak, és a YAZIO a meglevő importfelületen ismét importálható, ha a forrás megvan.

## Miért biztonságos így?

- A korábbi éles telefonos mentés és a Google Drive korábbi Food-projektje már külön fájlokban megvan. A valódi mentéseket *nem* töltöttük fel GitHubra; a repó tesztjei csak szintetikus adatokat tartalmaznak.
- A telefonos újabb mentés 1044, a Drive-példány 1048 étkezést tartalmazott, de a különálló profilazonosítókat **nem** írjuk automatikusan át. Az új telepítés sem importálja vagy egyesíti automatikusan ezeket a fájlokat.
- A Google Drive hozzáférése **nem garancia** az azonnali vagy teljes szinkronra. Ha az összekapcsolás hiányzik, a fájl eltér, vagy a távoli ellenőrzés sikertelen, az automatikus felülírás leáll; a helyi adat megmarad.
- A vízelőzmény a Food-modultól független: frissítés előtt külön menteni kell, utána a napok és mennyiségek megtartását a készüléken ellenőrizni kell.

## Hátralévő ellenőrzések az éles kiadás előtt

1. **Automatikus:** `npm test`, Android web build és böngészős regresszió, `assembleDebug`, YAZIO import, mentés, adatütközés és Víz-export tesztjei.
2. **Valós telefonon:** Food megnyitása azonos APK-csomag frissítésével, Health Connect és YAZIO import, kézzel felvett étel és receptek, Food/Víz JSON fájlmentés és visszaállítási próba; régi víznapok változatlansága.
3. **Alapvető regresszió:** Drive bejelentkezés, Finance, E-book, Android-visszalépés, értesítések. TEST és éles Drive-fájlok elkülönítése.
4. **Külön felhasználói jóváhagyás:** PR #35 merge a stabil ágba, majd az aláírt éles Android-kiadás. Ezek automatikusan **nem** következnek a tesztek sikeréből.

**Korlát:** az ugyanazon Drive-fájlt két eszközön, egyidejűleg módosító műveletek nem tranzakcióbiztosak. A kiadás előtti készülékes próba egyetlen szerkesztő eszközzel történjen; párhuzamos írás biztonságát ne állítsuk.
