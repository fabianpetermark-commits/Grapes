# Home → Növények – TEST integráció és Szaporítás (2026-10-22)

## Navigáció / dizájn
- A Grapes főmenüje továbbra is **4 darab 2×2 kártya**: Home, Health, Utility, Finance.
- A `Home` almoduljai: Bevásárlólista, Készletkezelő, **Növények**.
- A Növények képernyőn az **időjárás a fejléc része**, nem önálló kártya/modul. Mellette Növényeim, Növénykatalógus; alul Aktuális teendők (egyelőre tényleges teendőkezelés nélkül).
- Növényeim kártyák **mintapéldányok**; nem tárolunk még valódi kert- vagy lakásnövény-adatot.
- Növényadatlap fülei: **Áttekintés, Gondozás, Napló, Képek, Szaporítás** (320 px-en vízszintesen gördíthető).
- Visszalépés: Növényadatlap → Növényeim → Növények → Home → Grapes.

## WeatherAPI kapcsolat – előrejelzés a TEST UI-ban
A mobil/web felület kizárólag ezt a **publikus, csak olvasható** Supabase TEST végpontot hívja:
`https://aighqtqjlzirlokxwupt.supabase.co/functions/v1/weather-forecast/cached-forecast`.

- A WeatherAPI-kulcs **nem** kerül sem az APK-ba, sem a GitHub kódjába.
- A szerveroldali hitelesített workflow egy háromnapos, megtisztított WeatherAPI válasszal frissíti a `public.grapes_weather_public_cache` táblát a Supabase **Grapes TEST** projektben; a tábla RLS-védett, `anon`/`authenticated` szerepkörből közvetlenül nem olvasható.
- A publikus cache végpont **nem** hívja magát a WeatherAPI-t (tehát nem fogyaszt WeatherAPI-kvótát).
- A helyszín ebben a körben **rögzített: Szentendre**. A TEST semmilyen eszköz-helymeghatározási engedélyt nem igényel és nem küld pontos koordinátát.
- A UI a hőmérsékletet, napi előrejelzett minimumot/maximumot, háromnapos csapadékmennyiséget és meteorológiai jelzéseket mutatja. A fagy/hőség/eső jelzés **nem növényspecifikus teendő**.
- Az adatoknál szerepel a **WeatherAPI.com** forrás, a lekérés időpontja és a régi adat jelzése. Hiány vagy hiba esetén nincs kitalált adat.
- Az alkalmazás „frissítés” gombja **a már tárolt előrejelzést olvassa újra**, nem indít új WeatherAPI-kérést.
- Jelenleg a frissítés a hitelesített GitHub TEST workflow futásához kötött. **Automatikus, rendszeres szerveroldali frissítés még nincs kiépítve**; ezért a felület jelzi a hat óránál régebbi adatokat. Éles indítás előtt időzített, kvótakímélő frissítést, több helyszínhez cache-kulcsot és helybeállítást kell kialakítani.

Kapcsolódó backend PR: [#112](https://github.com/fabianpetermark-commits/Grapes/pull/112).

## Szaporítás – elfogadandó adatmodell (még nincs éles implementáció)
Minden saját példányhoz rögzíthető *szaporítási esemény*, melyből később egy vagy több új saját növénypéldány létrehozható.

Tervezett mezők:
- `id`, `parent_plant_id` (nullable, ha eredet ismeretlen), `method` (dugvány, magvetés, tőosztás, bujtás, egyéb),
- `started_at`, `status` (elindítva, gyökeresedik/csírázik, sikeres, sikertelen), `notes`, opcionális `photos`,
- `child_plant_ids` az eredményként létrehozott növénypéldányokra hivatkozva (egyszeri létrehozás / duplikáció elleni védelem).

Viselkedési elvek:
1. Elindított szaporítás **nem** készít automatikusan új növényt és nem jelenti azt, hogy sikeres.
2. A sikeres utód **önálló azonosítót, nevet, elhelyezést, naplót és képeket** kap; kapcsolata az anyanövényhez megmarad.
3. A sikertelen próbálkozás az előzményekben marad, nem tűnik el.
4. Magvetésnél a származási kapcsolat **nem garantálja** a genetikai azonosságot vagy fajtaazonosságot.
5. Növénypéldány csak felhasználói jóváhagyással, egyedi adatrögzítéssel hozható létre; verziózással/konfliktusvédelemmel, profilok elkülönítésével.

**Jelenleg** a Szaporítás fül kizárólag mintafelület, nincs rögzítés vagy szinkron.

## Biztonsági állapot
A korábbi Food / Víz / YAZIO / e-book / Google Drive felhasználói adatokhoz nem nyúlunk. Nem készült vagy került kiadásra APK, nem történt merge; a TEST UI és backend PR-ok külön, felülvizsgálható állapotban maradnak.
