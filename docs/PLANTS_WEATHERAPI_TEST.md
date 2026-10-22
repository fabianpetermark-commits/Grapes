# Grapes Növények – WeatherAPI Edge Function TEST próba

**Állapot (2026-10-22):** `Grapes TEST` Supabase-projektben a `weather-forecast` Edge Function v1 **ACTIVE** és a telepített forrás visszaolvasva ellenőrizve. A valós WeatherAPI-kérés **még nincs végponttól végpontig igazolva**. Nem érintett `Grapes PROD`, Android TEST/éles APK, Food, Water, Drive vagy bármely növényadat.

## Az elérhető TEST végpontok

Projekt: `aighqtqjlzirlokxwupt` (**csak TEST**).

- `GET https://aighqtqjlzirlokxwupt.supabase.co/functions/v1/weather-forecast/health` – nyilvános, kulcsértéket nem mutató **állapotjelzés**. `secretPresent` csak azt jelzi, hogy a környezeti változó nem üres; nem bizonyítja a kulcs érvényességét.
- `GET https://aighqtqjlzirlokxwupt.supabase.co/functions/v1/weather-forecast/forecast` – **csak valódi Supabase Auth felhasználói JWT-vel** kérhető. Ellenőrzés: `/auth/v1/user` végpont. Enélkül 401-et küld és nem fordul a WeatherAPI-hoz.

A TEST próbában a lekérdezési hely **fixen Szentendre, Hungary**. Az adatok magától a WeatherAPI-tól származnának; a modul nem készít növénygondozási következtetést, csak napi minimum/maximumot, csapadékot, esélyt és aktuális időjárást ad vissza. Az API-kulcs csak Edge Function környezeti változóban van (név: `WEATHERAPI_KEY`), nincs a GitHubon vagy az APK-ban.

## Biztonság

- A függvény `verify_jwt: false` beállítással települ, **mert saját szerveroldali felhasználóazonosítást hajt végre** a meteorológiai végpont előtt. A `/health` szándékosan nyitott és nem hívja meg a szolgáltatót.
- A kulcsot sosem küldi vissza a kliensnek, nem írja logba; a külső időjárási hiba JSON-ját sem adja tovább.
- A `/forecast` egyelőre sem a Google Drive-bejelentkezéssel, sem a Grapes app jelenlegi profiljaival nincs összekötve. Supabase Auth bevezetése vagy más biztonságosan validált hitelesítési megoldás külön, későbbi feladat.
- Gyakori lekérdezésekhez később külön rate limiting és szerveroldali cache kell, mert a HTTP Cache-Control önmagában nem spórolja a külső API-hívásokat.
- A nyilvános állapotjelzés nem hitelesítési rendszer. Semmilyen életciklus-, locsolási- vagy fagyvédelmi döntést nem szolgáltat.

## Tesztelés

1. Ellenőrizd a Supabase-ben a `weather-forecast` függvény ACTIVE állapotát és a `WEATHERAPI_KEY` secret **létezését**, értékét nem kell megmutatni.
2. `GET /health` → HTTP 200, `secretPresent: true`, `providerCallExecuted: false`.
3. `GET /forecast` Authorization nélkül → HTTP 401, `authentication_required`.
4. **Későbbi, külön hitelesített próba**: Supabase Auth felhasználói hozzáférési tokent használva `GET /forecast` → HTTP 200 és 3 forecast nap. Az eredményt mint időjárási mérési értéket kell kezelni, nem előírt gondozási feladatként.

A 2–3. pont nem ellenőrzi a WeatherAPI kulcs érvényességét vagy a valós előrejelzést: ahhoz a 4. pont szükséges.

## Következő lépés

A `Home → Növények` felület és a WeatherAPI HTTP-proxy összekapcsolása külön TEST UI és adatmodell munka. **Nincs PROD deploy vagy kiadás** a felhasználó külön jóváhagyása nélkül.
