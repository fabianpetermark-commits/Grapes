# Grapes Health / Food – elfogadott belső UI és vonalkód UX (2026-10-26)

**Státusz: Felhasználó által jóváhagyott dizájn- és interakciós célállapot, nem Android-/PROD-implementáció.**

A 2026-10-26-i interaktív **Food belső képernyőtervet** a felhasználó jóváhagyta: „Jólvan akkor ez végleges szerintem :) szép munka. Következő modul”. Előtte külön tisztázta, hogy az alsó vonalkód gyorsgombnak közvetlenül a kamera **vonalkódolvasó módját** kell indítania, és ezt az egyeztetett működést elfogadta.

## Elfogadott Food-oldal
- A közös Grapes Brand Guide v1.2 szerinti 6 ikon, aktív Food helyzettel, normál alakú beállításfogaskerékkel. Egyszeri `Food` cím; ne legyen mellette ismételt „Ételnapló” címke, felső ikont másoló címikon vagy redundáns „Statisztika” hivatkozás. Egyetlen fontos képernyőcím, tartalomorientált widgetcímek: `Napi egyenleg`, `Étkezések`, `Rögzített ételek`.
- Napi dátumváltás; a kiválasztott nap összes kcal-ja, fehérje, szénhidrát, zsír célhoz viszonyítva egy helyen, egyértelmű gyűrűvel és progress barokkal.
- Étkezésenkénti kompakt bontás (Reggeli/Ebéd/Uzsonna/Vacsora), közvetlen `+` rögzítés. A már rögzített tételek olvashatók/törölhetők az adott nap és tulajdonos adatai alapján.
- Alsó közös Health Quick Action: `Fotó / Étel / Víz` és külön nagy `Vonalkód` gomb. Másodlagos választómenü ne legyen a vonalkód előtt. Statisztika közvetlenül az ikonsorból elérhető.
- A Health **Beállítások** kizárólag `Napi célok` és `Adatkapcsolatok`. Fotó, vonalkód, Health Connect, Samsung Health, YAZIO: csak ténylegesen engedélyezett eszközkapcsolatokra valódi jogosultság- és adatforrásjelzés.

## Kamera / vonalkód pontos művelet
1. Felső vonalkód ikon **vagy** alsó Quick Action vonalkód: **ugyanaz a natív, közvetlenül megnyíló kamerás vonalkódolvasó**; nincs köztes kódbeviteli/menü képernyő.
2. Látványos felismerési keret, zseblámpa, kameraengedély és annak megtagadása esetén tiszta hiba/kézi kódbevitel fallback.
3. EAN/UPC felismerés után termékadat-keresés az élő szolgáltatásokban (pl. Open Food Facts / USDA ahol megfelelő), egyértelmű tápérték és adagolás (mértékegység) képernyővel; pontatlan/több találatos esetben a felhasználó választ.
4. Hiányzó terméknél felvételi lehetőség, de kitalált termék/adat nem menthető automatikusan.
5. Szkennelés/keresés/termékadatlap megnyitása önmagában **nem rögzít tényleges fogyasztást**. Csak külön `Naplóba rögzítés` jóváhagyás után, a megfelelő fiókhoz/naphoz/étkezéshez kerülhet tétel.
6. A Food napló és az étrendtervező külön világ: tervezett étkezés nem lesz automatikusan tényleges fogyasztás.

## Megvalósítási határ
A chatben elfogadott interaktív prototípus kizárólag helyi mintaadatokat módosított; a valós Food napló, natív Android kamera, Health Connect, YAZIO, Open Food Facts/USDA integráció és PROD migráció **nem került átvezetésre**. A `design/references/candidates/food.html` korábbi HTML dizájnváltozat, a jóváhagyott célviselkedéshez még át kell dolgozni. A felhasználó következőnek a **Víznapló** belső képernyőjét kéri ellenőrizni.
