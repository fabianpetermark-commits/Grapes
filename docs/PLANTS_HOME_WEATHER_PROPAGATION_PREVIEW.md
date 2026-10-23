# Home → Növények – TEST időjárás-integráció

## Navigáció / dizájn
- A Grapes főmenüje továbbra is **4 darab 2×2 kártya**: Home, Health, Utility, Finance.
- A `Home` almoduljai: Bevásárlólista, Készletkezelő, **Növények**.
- A Növények képernyőn az **időjárás a fejléc része**, nem önálló kártya/modul. Mellette Növényeim, Növénykatalógus; alul Aktuális teendők (egyelőre tényleges teendőkezelés nélkül).
- Növényeim kártyák **mintapéldányok**; nem tárolunk még valódi kert- vagy lakásnövény-adatot.
- Növényadatlap fülei: **Áttekintés, Gondozás, Napló, Képek**. A Szaporítás egyelőre nincs a felületen.
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

## Halasztott lehetőség
A szaporítás (dugvány, magvetés, szülő–utód kapcsolatok) **nem része a jelenlegi fejlesztési körnek**. A felhasználó kérésére a mintafelületről és az aktuális tesztekből is kikerült. Később külön tervezhető, ha szükség lesz rá.

## Biztonsági állapot
A korábbi Food / Víz / YAZIO / e-book / Google Drive felhasználói adatokhoz nem nyúlunk. Nem készült vagy került kiadásra APK, nem történt merge; a TEST UI és backend PR-ok külön, felülvizsgálható állapotban maradnak.
