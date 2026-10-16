# Magyar USDA-keresőmotor (v23, Food felületre bekötve)

A Food webes és Androidos keresője az ellenőrzött USDA-katalógusból offline is kínál eredményeket. A választás minden esetben explicit; a v22 és main ág változatlan.


## Régi offline katalógus kivezetése

A 20 elemes, nem egyedileg ellenőrzött `food-offline-catalog.js` lista és a hozzá tartozó Androidos keresési útvonal eltávolítva a v23 fejlesztési ágon. Az Androidos kereső a saját mentett ételeket, az ellenőrzött 10 USDA-alapanyagot és az Open Food Facts online találatait használja. Hálózat nélkül az első két forrás működik.

A korábban mentett, `source.type: 'usda'` jelölésű saját ételek és az ezekre épülő naplóbejegyzések nem törlődnek. A kompatibilitást külön regressziós teszt védi.

## Adatmodell és ellenőrzési szabály

Minden katalógusrekord külön mezőben tárolja:

- a magyar nevet és a kézzel gondozott aliasokat;
- az elkészítési állapotot (`preparation`);
- az ehető részt (`ediblePart`);
- a feldolgozást (`processing`);
- az ellenőrzött `fdcId`, USDA-leírás és adattípus értékét;
- az ellenőrzés forrását és dátumát;
- a USDA-leírás kötelező és tiltott kifejezéseit.

Az első tíz rekord a 2026-10-16-i, `38952618590` GitHub Actions futás jelölt-artifactja alapján kézzel lett párosítva. API-találat soha nem írja át automatikusan ezt a katalógust.

## Keresési viselkedés

Az index a katalógus betöltésekor egyszer készül el. Az ékezetek, kis-/nagybetűk, többszörös elválasztók, a `BL55` / `BL 55` / `BL-55` alakok és néhány gyakori magyar rag kezelve van. A többtokenes kereséshez minden keresési tokennek külön jelölttoken kell megfeleljen.

A megjeleníthető találatok és az automatikus azonosítás szándékosan két külön művelet:

- `searchHungarianFoods` prefixekre is adhat találati listát;
- `resolveHungarianFood` csak pontos, egyedi katalóguskifejezést old fel;
- több azonos alias, eltérő állapot vagy rövid prefix esetén nincs automatikus USDA-fordítás és nincs `fdcId`-választás;
- az eredmény jelentése nem függ a katalógus sorrendjétől.

## USDA-validálás

Az `usda-fetch-candidates.mjs` kérésenként időkorlátot használ, 429 és 5xx válaszokra korlátozott újrapróbálkozást végez, és minden rekord után atomikusan menti a részjelentést. A válaszban kötelező a `foods` tömb, valamint jelöltenként az `fdcId`, leírás, adattípus, `score` és `foodCategory`.

A futás csak akkor sikeres, ha minden rögzített `fdcId` megtalálható, és a leírás, adattípus, állapot-, ehetőrész- és feldolgozási feltételek megfelelnek. Hiba esetén az addig elkészült artifact megmarad és a workflow az `always()` feltétellel feltölti.

## Ellenőrzés

Helyi, USDA-kulcs nélküli regresszió:

```text
node --test tests/food-search-method.test.js tests/food-usda-client.test.js
```

Valódi USDA-validálás csak repository secretből:

```text
USDA_FDC_API_KEY=... node scripts/usda-fetch-candidates.mjs
```

A regressziók lefedik a kétértelmű állapotokat, rövid prefixeket, katalógussorrendet, BL55-alakokat, toldalékokat, elkészítést/feldolgozást/ehető részt, hibás és üres USDA-választ, timeoutot, 429/5xx újrapróbálkozást és egy 50 000 rekordos index teljesítményét.


## Food felület és offline tápértékadatok (2026-10-16)

Az src/food/usda-foods.js modul az egyedileg ellenőrzött fdcId-hoz 100 g-ra vonatkozó USDA FoodData Central makróértékeket rögzít. Nem szükséges API-kulcs a kliensen. A hiányzó tápérték null, nem 0. Explicit választás nélkül nincs azonosító-feloldás; naplózáskor a forrás fdcId-je és a tápérték-pillanatkép megmarad. Forrásinformáció: https://whatyoueat.io/foods/170000-onions; https://nutrientgraph.com/foods/garlic-raw-fdc-1104647/; https://calorieinsight.com/foods/sweet-potatoes-orange-flesh-without-skin-raw/; https://nutrientgraph.com/foods/broccoli-raw-fdc-747447/. További tápérték-adatok értékeit az USDA API-ból kiadáshoz külön ellenőrizni kell.
