# Grapes — állandó AI/Codex projektutasítások

> Belépési pont új munkamenethez. Ez az `AGENTS.md` a repó gyökerében található; a munkát végző kódasszisztens először ezt és a `docs/GRAPES_PROJECT_CONTEXT.md` fájlt olvassa el. **Az aktuális branch, PR és release állapotot mindig frissen ellenőrizze; a dokumentáció pillanatkép, nem élő adat.**

## 1. Projekt és munkaindítás

- Repository: `fabianpetermark-commits/Grapes` (nyilvános GitHub).
- Nyelv: alapértelmezetten magyar; rövid, világos státuszok, tényleges ellenőrzések, pontos linkszövegek.
- Éles Android-forrás: **`codex/android-app`**; külön TEST fejlesztési ág: **`integration/grapes-test-food-20261017`**.
- A `main` ág **nem egyenlő** a jelenleg kiadott Android-forrással. A megfelelő ág kiválasztása a feladat része.
- Friss állapot: `node scripts/grapes-context.mjs` (GitHub-adatok lekérése; `--offline` opció, ha nincs hálózat). A scriptben semmilyen titok nincs.
- Olvasd el a `docs/GRAPES_PROJECT_CONTEXT.md` összefoglalót, és az adott terület részletes dokumentációját. A `CODEX_HANDOFF.md`, `FOOD_CODEX_HANDOFF.md` régi részei történetiek lehetnek; ne tekintsd őket felülírhatatlan tényeknek.
- Feladatkezdéskor ellenőrizd a branch HEAD-jét, releváns nyitott PR-okat, release-eket, és az adott funkció valódi forrását. **Ne állítsd, hogy valami kész, ha csak terv, PR vagy teszt.**

## 2. Adatbiztonság és környezeti elkülönítés

- **Éles Android:** `hu.grapes.healthconnect`, saját release-aláírás és stabil `Grapes` Drive-gyökér.
- **Grapes TEST:** `hu.grapes.healthconnect.test`, külön TEST-aláírás, TEST-adatok, külön TEST Drive-gyökér és külön frissítési csatorna.
- SOHA ne keverd a TEST és éles APK-kat, aláírókulcsokat, alkalmazásazonosítókat, Drive-gyökereket, adatbázisokat és automatikus frissítőcsatornákat.
- Meglévő Food- és Víz-napló, receptek, felhasználói/profil-azonosítók, YAZIO-előzmények, ebookok és Drive-fájlok megőrzendők. Ne törölj appot vagy appadatot, ne futtass automatikus migrációt/összefésülést/Drive-felülírást kifejezett engedély és biztonságos terv nélkül.
- Importnál **hiányzó adat ≠ nulla**. Bizonytalan hozzávaló, adag, kalória vagy makró nem található ki. Felhasználói előnézet/jóváhagyás és biztonságos hibakezelés szükséges.
- A repository nyilvános. Ne írj bele API-kulcsokat, tokeneket, felhasználói exportokat, credentialt, keystore-t, jelszót; ne kérd a felhasználótól ezeket chatbe másolva.

## 3. Fejlesztési és kiadási protokoll

1. Az adott **helyes** célág HEAD-jéből indíts külön feature/fix/docs ágat; tesztekkel és célzott változtatásokkal dolgozz.
2. A TEST integrációs ágra készíts PR-t, ellenőrizd a CI-t. A normál TEST PR/push **ne gyártson teljes Android APK-t**.
3. A TEST tényleges frissítése csak külön jóváhagyott `android-health-connect-poc/test-release.json` **versionCode-emeléssel** és a `release-android-test.yml` aláírt workflow-val történik. Aláírásazonosságot, csomagnevet, checksumot ellenőrizni; debug APK-t nem szabad meglévő aláírt TEST-re telepíttetni.
4. Éles munkánál külön PR a `codex/android-app` ágra, plusz valós adat/mentés-visszaállítási regresszió; **az éles merge és release csak a felhasználó egyértelmű jóváhagyásával**. Stabil `release-android.yml` manuális workflow.
5. A kódellenőrzés nem készülékes teszt. Ne állítsd, hogy telepítve van, ha csak a GitHubon készült APK.
6. Minden végén tételesen közöld: branch, PR, commit, lefutott tesztek, ismert korlátok, van-e új APK, érintett-e éles felhasználói adat.

## 4. UI/arculat és funkciók

- Az Android Food UI fő akcentusa `#3BDCF2` (`var(--accent)`); eltér a korábbi desktop tokenektől. A tényleges logó `public/grapes-logo.svg`.
- A Food-kalóriagyűrű ragyogását vissza kell fogni, kizárólag az aktív ív világíthat finoman; a fennmaradó track sötét. A `docs/grapes-brand-guide-and-ring-brief-20261018` ág PR #41-e **javaslat/review**, nem automatikusan elfogadott vagy minden modult érintő globális módosítás. Ne legyen teljes körös „reaktor-glow”.
- Mobilon 320–412 px, Android safe-area, visszalépés, billentyűzet, tap target, kontraszt, reduced motion fontos; a statisztika és napi cél megjelenítés ne találjon ki értéket.
- A szöveges és képes receptek importja piszkozatként működik; WEB/CORS/PDF korlátokat tényszerűen jelezd. Soha ne állítsd, hogy „minden fájlt felismer”.

## 5. Tesztelés és további hivatkozások

Alap: `npm ci`, `npm test`, `npm run build:android-web`, szükség esetén `node tests/android-recipe-ingredient.browser.mjs` és `node tests/android-mobile-preview.browser.mjs`. Éles Android és natív/Health Connect/Food/Víz regressziók külön ellenőrzést igényelhetnek.

Dokumentációs belépő: `docs/GRAPES_PROJECT_CONTEXT.md`. A ChatGPT új beszélgetéséhez: `docs/GRAPES_NEW_CHAT.md`.

**A különböző időpontban készült doksik eltérő fejlettségi állapotot írhatnak le. GitHub élő állapot + aktuális forrás > egy korábbi kézikönyv.**
