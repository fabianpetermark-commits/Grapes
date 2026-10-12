# Grapes Food

## Elkészült webes P0 + P1

- Google-fiókhoz kötött, egymástól elkülönített Food projekt.
- Helyi IndexedDB-mentés és kézi Google Drive szinkron az `Ételnapló` modulmappába.
- Saját ételek, kategóriák, kedvencek, magyar ékezet-/szinonima-/elírás-tűrő keresés.
- Open Food Facts vonalkódlekérdezés forrásjelöléssel és kézi adatbevitel fallbackkel.
- Kameraalapú EAN/UPC beolvasás, ha a böngésző támogatja a `BarcodeDetector` API-t.
- Étkezésnapló időponttal, megjegyzéssel, adagátváltással, szerkesztéssel, törléssel és ismétléssel.
- Naplózáskori tápérték-pillanatkép, napi energia- és makróösszesítés.
- Dátumtól érvényes manuális célértékek; eltérésnél figyelmeztetés automatikus módosítás nélkül.
- Profilhoz kötött JSON biztonsági mentés és visszaállítás.
- Saját recept hozzávalókkal, elkészítéssel, képpel, készételtömeggel és adag/darab/szelet hozammal.
- Receptverziók és naplózási pillanatképek: egy későbbi receptmódosítás nem írja át a múltat.
- All-time statisztika 7/30 napos szűrővel, napi/heti/havi aggregálással és tápanyag-összehasonlítással.
- Átlag, minimum, maximum, összes bevitel, naplózott napok, célkövetés és 4/4/9 makróenergia-gyűrűdiagram.
- Verziózott Health Connect/Samsung Health JSON-import rekordos előnézettel, kijelöléssel, hibajelzéssel és `externalKey` alapú duplikációvédelemmel.
- Receptvariánsok külön recept-, étel- és hozzávaló-azonosítókkal; az eredeti recept kapcsolata látható, de a tápérték és a naplózás független.
- Helyben futó tápértékcímke-OCR magyar/angol címkéhez, kcal/kJ-, tizedesvessző-, mg/g-, nátrium/só-, 100 g/100 ml- és adagonkénti átszámítással.
- Szerkeszthető OCR-előnézet: az eredmény nem ment automatikusan, csak az ételűrlapot tölti ki további felhasználói ellenőrzésre.
- Külön Drive-dokumentumban tárolt családi receptkönyvtár, amely nem tartalmaz naplót, célértéket vagy statisztikát.
- Meghívásos Drive-megosztás olvasó/szerkesztő szerepkörrel, szerepkör-módosítással és hozzáférés-visszavonással.
- Megosztott receptek névteres, csak olvasható naplózása, illetve saját szerkeszthető másolat készítése.

## Adat- és szinkronszabályok

A tápértékek 100 g vagy 100 ml alapra kerülnek. A hiányzó érték `null`, nem nulla és nem becslés. A külső termékadat mentés előtt szerkeszthető, a forrás attribúciója megmarad. A helyi, még nem Drive-ra mentett módosításokat a modul nem írja felül egy régebbi távoli példánnyal.

A Food modul a már engedélyezett `drive.file` jogosultságot használja; nem kér teljes Drive-hozzáférést. Új Food projekt neve `Ételnapló.grapes.json`.

A családi receptkönyvtár külön `Családi receptkönyvtár` modulnéven mentett Grapes Drive-fájl. A tulajdonos a Drive jogosultsági API-jával ad olvasó vagy szerkesztő hozzáférést. A meghívott a kapott Drive-fájlazonosítóval csatlakoztatja a könyvtárat. A leválasztás csak a helyi profil kapcsolatát törli; a **Hozzáférés visszavonása** a tényleges Drive-jogosultságot is eltávolítja.

## Külső termékadat

Alapértelmezésben a modul az Open Food Facts publikus végpontját hívja. Éles környezetben `VITE_FOOD_API_URL` alatt Open Food Facts-kompatibilis proxy adható meg a forgalomszabályozás és a stabil hibakezelés érdekében. Az API-találat nem tekinthető automatikusan ellenőrzött tápértéknek.

## Android Health Connect állapot

Az Android POC `NutritionRecord` és `HydrationRecord` adatokat exportál a Grapes bridge v1 JSON-formátumába. A Food modul ezt a fájlt a **Health import** gombbal, a meglévő napló lecserélése nélkül tudja hozzáfűzni. Import előtt minden rekord előnézetben jelenik meg; a hibás és korábban importált elemek nem választhatók ki.

A POC forrása elkészült, de a natív alkalmazás JDK 17/SDK 35 buildje és valódi Android-eszközös jogosultságtesztje blokkolt: ezen a gépen Java 8 van, Gradle és csatlakoztatott Android-eszköz nincs. A közvetlen Samsung Health Data SDK vízadapterhez ezen felül a Samsung AAR és nyilvános terjesztéshez partnerjóváhagyás szükséges.

## Külső feltétel miatt nem lezárható ezen a gépen

- telepíthető, eszközön ellenőrzött Android Health Connect alkalmazás;
- közvetlen Samsung Health Data SDK integráció.

A webalkalmazás csak a felhasználó által kiválasztott exportfájlt olvassa be; Samsung Health adatot nem állít be és nem módosít.

## Ellenőrzés

```powershell
node --test tests/*.test.js
node tests/developer-menu.browser.mjs
node tests/food-app.browser.mjs
node node_modules/vite/bin/vite.js build
```

2026-10-12-i eredmény: 209/209 egységteszt sikeres, mindkét érintett böngészőteszt sikeres, production build sikeres. A build csak a már meglévő nagy chunkokra figyelmeztet.
