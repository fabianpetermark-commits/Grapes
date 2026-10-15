# GRAPES FOOD — Codex fejlesztési átadás / közös ág

Állapot: 2026-10-15. **A YAZIO előzményimport és a külső ételkereső ugyanazon az ágon található.** A funkciók jelenleg **nem élesek**.

## Kiindulópont

- Repo: `fabianpetermark-commits/Grapes`
- **Egyetlen aktív fejlesztési ág: `feature/food-yazio-safe-import`**
- Egyetlen aktív integrációs PR: [#15 — YAZIO + connected food search](https://github.com/fabianpetermark-commits/Grapes/pull/15), célág `main`, draft státusz.
- A korábbi [#16-os PR](https://github.com/fabianpetermark-commits/Grapes/pull/16) az ágak egyesítése után lezárult; csak történeti referencia.
- Az előző `feature/food-connected-search` ág ugyanazt a commitot tartalmazta, mint az immár frissített YAZIO-ág; **ne külön két PR-t próbálj összeolvasztani**.
- Egyesítéskor ellenőrzött commit: `bfdace78b851730cf5635e04b6552b9f74ad8f91`.
- A `main` ágat és az Apps Script deploymenteket az egyesítés **nem** módosította.

```bash
git fetch origin
git switch feature/food-yazio-safe-import
git pull --ff-only origin feature/food-yazio-safe-import
npm ci
npm test
npm run build
node tests/food-catalog.browser.mjs
```

## Előkészült funkciók

### YAZIO teljes előzményimport (még nem élesíthető)

- `src/food/food-yazio-import.js`: JSON-bundle parser, forrásmezők, profil- és forrásazonosító, duplikációellenőrzés, terv, kötegelt import, visszavonás.
- `src/food/food-data.js`: `origin`, `externalKey`, `importBatches`, eredeti naplózott tápanyagok és mikrotápanyagok.
- `src/food/food-app.js`: importelőnézet, felhasználói jóváhagyás, 150 rekordos mentések, backup letöltés, importköteg-visszavonás.
- Eredeti YAZIO receptek és összetevők archiválása, csak olvasható megjelenítés.
- Részletes leírás: [FOOD_YAZIO_IMPORT.md](FOOD_YAZIO_IMPORT.md).
- Egységtesztek: `tests/food-yazio-import.test.js`; létezik `tests/food-yazio.browser.mjs` is, amelyet külön validálni/futtatni szükséges.

### Összekapcsolt Open Food Facts + FatSecret keresés

- `src/food/food-catalog-search.js`: találatok egyesítése, vonalkódalapú deduplikáció, forrásonkénti hibaállapot.
- `src/food/food-api.js`: OFF kereső, legacy fallback, FatSecret Apps Script iframe bridge.
- `src/food/food-app.js`: Napló és Ételek fül keresése, késleltetés, cache, ellenőrzés előtti forrásjelölés, mentés után naplóhoz visszatérés.
- `src/food/food.css`: mobil/asztali kereső és eredménylista.
- Részletes leírás: [FOOD_SEARCH_INTEGRATION.md](FOOD_SEARCH_INTEGRATION.md).
- Teszt: `tests/food-catalog-search.test.js`, böngésző: `tests/food-catalog.browser.mjs`.

## Elsődleges ellenőrzési pontok — ne hagyd ki

1. **P0 — FatSecret forrástípus:** a `normalizeFoodItem()` jelenlegi engedélyezett forrástípusai közt hiányozhat a `fatsecret`, ezért mentés/újratöltés során `manual` lesz belőle. Ellenőrizd és javítsd ezt regressziós teszttel: `source.type`, `source.id`, barcode és duplikációellenőrzés.
2. **P0 — valós hálózati adatbázisok:** a CI jelenleg stubolt OFF/FatSecret válaszokat tesztel; valós CORS, HTTP 429, Apps Script iframe postMessage origin/nonce, beállított FatSecret hitelesítés és valóban telepített broker nincs igazolva. Ne írj titkot repo-ba vagy böngészős tárolóba; az Apps Script deploymentet ne módosítsd jóváhagyás nélkül.
3. **P0 — YAZIO import adatbiztonsága:** végezz valós, többéves JSON-exportos próbát teljes backup/restore, megszakítás/folytatás, dupla export, bizonytalan egyezés, profil-izoláció, tárhelykvóta, utólag módosított rekord és rollback útvonalon.
4. **P0 — YAZIO forrásadat pontossága:** hiányzó tápanyag ≠ 0; az exportáló történeti értékeket mai termékadatokból is rekonstruálhat. Importált naplóbejegyzést ne számolj át automatikusan. 40 MB exportméret-korlát dokumentálandó.
5. **P1 — saját receptek:** az importált YAZIO receptek csak olvashatók, egyelőre nem hoznak létre natív szerkeszthető Grapes-recepteket. Folyadék, testsúly és célértékek a nyers archívumban maradnak.
6. **P1 — kereső UI/UX:** ellenőrizd mobilon és asztali nézeten a lokális és külső találatok különválasztását, oldalváltást, késői találatokat, hálózati részleges hibákat, mentés utáni ételkiválasztást.
7. **P1 — eredet és biztonság:** ne változtass meglévő egyéb Grapes modulon vagy az `android-health-connect-poc` programon, Samsung Health, Health Connect és Drive regressziót futtass.

## Már ellenőrzött eredmények

- A két ág egyesítése előtti kereső HEAD-en: **262/262 egységteszt** sikeres, `npm run build` sikeres, valamint `node tests/food-catalog.browser.mjs` sikeres, **mockolt külső szolgáltatókkal**.
- [GitHub Actions korábbi sikeres futás](https://github.com/fabianpetermark-commits/Grapes/actions/runs/38714938529).
- Az egyesített ág utolsó CI-eredményét munkakezdéskor újra ellenőrizni kell; a fast-forward új futásokat indított.
- Ez **nem bizonyítja** a valós éles FatSecret/OFF vagy a teljes YAZIO import működését.

## Elvárt további lépések és szabályok

1. Az új közös ágon indíts teljes kódfelmérést és regressziós teszteket.
2. Javítsd a talált kritikus hibákat, külön commitokban, teszttel.
3. Végezz valós OFF/FatSecret és felhasználói YAZIO export integrációs próbát adatbiztonsági mentéssel.
4. Dokumentáld a lefutott teszteket, a kézzel nem ellenőrizhető külső feltételeket, a módosított fájlokat és az ismert korlátokat.
5. A #15 PR maradjon draft, amíg az elfogadási feltételek nem teljesülnek.
6. **Ne merge-elj `main`-be és ne indíts éles GitHub Pages deploymentet a felhasználó kifejezett jóváhagyása nélkül.**

A végén adj tételes státuszt: módosított fájlok, működő funkciók, egység-/böngésző-/valós API teszteredmények, adatvédelmi és migrációs kockázatok, ismert korlátok, kézi tesztlépések, valamint a merge-re való alkalmasság.
