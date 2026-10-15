# Grapes Food — egységes, külső adatbázishoz kötött ételkereső

Fejlesztési ág: `feature/food-connected-search`. Bázis: `feature/food-yazio-safe-import`, nem a `main`. A meglévő Apps Script deploymentek nem változtak.

## Probléma és megoldás

A korábbi `#food-search` kizárólag a `project.customFoods` lokálisan/Drive-ban tárolt saját listáját szűrte. A két külső adatbázis csak egy külön keresőgombbal volt elérhető, a napló kiválasztójából pedig egyáltalán nem. Az `Étel neve` űrlap egyik hibakezelési ágában nem létező `report()` hívás szerepelt.

Most a `Napló` és az `Ételek` fül egyaránt közvetlenül használhatja a két meglévő forrást:
- saját ételek és receptek: azonnali, profilhoz kötött helyi találatok;
- Open Food Facts: név szerinti termékkeresés és vonalkódos termékadat;
- FatSecret: az Apps Script szerveroldali OAuth / saját kulcsos közvetítőjén át történő keresés, ha konfigurált és telepített.

Gépelés után csak 3 karaktertől, 1100 ms szünettel indít külső keresést; Enterrel vagy a gombbal már 2 karaktertől azonnal lehet keresni. 2 percig tartott, legfeljebb 25 kereséses munkamenet-cache mérsékli az API-terhelést. Újabb keresésnél a korábbi, késve érkező eredmény nem írhatja felül az újabbat.

A két szolgáltató párhuzamosan fut, a részleges hiba látható. Ha mindkettő nem elérhető, a program **nem** állítja, hogy nincs találat. A találatok forrásjelöléssel, tápértékkel és vonalkóddal jelennek meg. Azonos vonalkódú találat nem szerepel kétszer. Két külön azonosítójú, vonalkód nélküli terméket nem olvasztunk össze.

Open Food Facts esetén az elsődleges Search-a-licious `/search` végpont hibájánál a dokumentált régi kulcsszavas `/cgi/search.pl` végpontot próbáljuk ki. HTTP 429 korlátozásnál nincs automatikus kerülő kérés. Ismeretlen JSON válaszformátum hibának számít, nem üres találatnak.

## Mentési / naplózási folyamat

Külső találat megnyitása **nem ment automatikusan**. Az ellenőrző ételűrlapon láthatók a tápértékek; itt a felhasználó szerkeszthet és menthet. Ha a Naplóból indult a keresés, az érvényes mentés után a felület visszatér a Naplóhoz, és az új ételt kijelöli. Már létező saját ételnél egyszerűen a meglévő ételt használja; nem írja felül a Food-katalógust.

A napló tápérték-pillanatképét, a receptkezelést, a helyi IndexedDB-projektet, a Drive-szinkront, a Health Connect hídját és a YAZIO-importot nem módosítja ez a keresőfejlesztés.

## Módosított / új fájlok

- `src/food/food-app.js` — egyesített kereső, naplókereső, forráscímkék, késleltetett keresés, státuszüzenetek, bejegyzéshez visszalépés, korábbi nem definiált `report` javítása;
- `src/food/food-api.js` — robusztus válaszfeldolgozás és OFF tartalék kereső;
- `src/food/food-catalog-search.js` — tesztelhető keresőösszesítő és duplikátumszűrés;
- `src/food/food.css` — mobilra is használható kereső / találatlista;
- `tests/food-catalog-search.test.js` — egységtesztek hibákra, két forrásra és tartalék keresőre;
- `tests/food-catalog.browser.mjs` — Chromiummal végponttól-végpontig UI teszt;
- `.github/workflows/food-connected-search-ci.yml` — külön CI, nincs deployment.

## Ellenőrzés

`npm test`, `npm run build`, `node tests/food-catalog.browser.mjs`.

A böngészős teszt stubolt Open Food Facts és FatSecret válaszokkal ellenőrzi a találatokat, naplóból indított mentést, részleges szolgáltatóhibát és az IndexedDB projekt újratöltését.

## Korlátok / valós környezeti ellenőrzések

- A tesztek **nem bizonyítják**, hogy az éles Open Food Facts/FatSecret hálózati kapcsolat a felhasználó böngészőjében működik. CORS, hálózati tiltás, keresési korlátok, Apps Script deployment és tokenjogosultságok valós ellenőrzése szükséges.
- A FatSecret backend az `apps-script/ebook-transfer/Code.gs` fájlban már szerepel, de csak akkor működik, ha a megfelelő titkok Script Properties alatt be vannak állítva, a megfelelő kód verziója deployolva van és a FatSecret API a keresést engedélyezi. **Sem a tulajdonságokat, sem az Apps Script deploymentet nem változtattuk.**
- Az Open Food Facts fő keresője vagy a régi API időszakosan korlátozhat; ezt a találatok mellett hibaüzenet jelzi.
- Az automatikus keresés külső szolgáltatókhoz küldi a beírt keresőkifejezést. A napló és a személyes Food projekt nem kerül elküldésre a termékkeresés során.

## Manuális próba

1. Nyisd meg az új fejlesztői ágat; a Food > Napló fülön keress a `keksz` szóval.
2. Ellenőrizd, hogy a saját ételek azonnal, az online találatok kis késéssel jelennek meg és a találatokon látszik a forrás.
3. Válassz külső találatot; ellenőrizd és mentsd; a Naplóba visszatérve állíts be mennyiséget, majd naplózd.
4. Az Ételek fül keresőjében keress egy másik névre; a találatot nyisd meg és ellenőrizd, hogy a meglévő adat nem íródik felül.
5. Kapcsold le a hálózatot és ismételj meg egy új keresést: hibaüzenet legyen látható, a saját adatok maradjanak használhatók.
6. Próbálj ismert magyar vonalkódot és ellenőrizd a FatSecret esetleges jogosultsági üzenetét.
7. Frissítsd az oldalt és ellenőrizd, hogy a mentett naplóadat megmaradt.

Eredmény csak a CI és manuális külső próba után tekinthető éles keresőnek.
