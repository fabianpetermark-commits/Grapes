# Magyar USDA-keresőmotor (v23, még nincs integrálva)

Ez a fejlesztési ág különálló, tiszta keresőmotort és ellenőrzött USDA-katalógust tartalmaz. A Food UI, a vonalkódos keresés, a stabil v22 és a `main` ág változatlan. Az új motor addig nem köthető be a Food modulba, amíg a katalógus és a felhasználói választási felület külön jóváhagyást nem kap.


## Régi offline katalógus kivezetése

A 20 elemes, nem egyedileg ellenőrzött `food-offline-catalog.js` lista és a hozzá tartozó Androidos keresési útvonal eltávolítva a v23 fejlesztési ágon. Az Androidos kereső jelenleg a felhasználó saját, elmentett ételeit és az Open Food Facts online találatait használja. Hálózat nélkül az elmentett saját ételek maradnak kereshetők; az új, ellenőrzött magyar USDA-katalógus még nincs bekötve a felületre.

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
