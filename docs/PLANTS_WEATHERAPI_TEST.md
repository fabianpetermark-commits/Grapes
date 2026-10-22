# Grapes Növények – WeatherAPI Edge Function TEST próba

**Állapot (2026-10-22):** `Grapes TEST` Supabase-projektben a `weather-forecast` Edge Function v2 **ACTIVE**, és a valódi WeatherAPI-válasz **sikeresen ellenőrizve** a GitHub Actions [39853094500](https://github.com/fabianpetermark-commits/Grapes/actions/runs/39853094500) futásával. Nem érintett `Grapes PROD`, Android TEST/éles APK, Food, Water, Drive vagy bármely növényadat.

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

A 2–3. pont önmagában nem ellenőrzi a WeatherAPI kulcs érvényességét. A 2026-10-22-i **sikeres GitHub OIDC CI-próba** ezt ténylegesen ellenőrizte az erre kialakított `/ci-forecast` útvonalon. A normál `/forecast` Supabase Auth mobilbelépési folyamat továbbra sem készült el.

## Következő lépés

A `Home → Növények` felület és a WeatherAPI HTTP-proxy összekapcsolása külön TEST UI és adatmodell munka. **Nincs PROD deploy vagy kiadás** a felhasználó külön jóváhagyása nélkül.

## Igazolt élő WeatherAPI-próba – 2026-10-22

- **CI**: [WeatherAPI TEST live OIDC verification – sikeres futás #39853094500](https://github.com/fabianpetermark-commits/Grapes/actions/runs/39853094500).
- **Biztonság**: `GET /ci-forecast` csak GitHub által aláírt, rövid élettartamú OIDC-tokennel, konkrét Grapes-repository/branch/workflow claimjeivel és RS256-aláírásellenőrzéssel hívható. A hitelesítés nélküli kérés 401.
- **Eredmény**: WeatherAPI.com élő válasz, Szentendre; aktuális hőmérséklet a próba idején **11,4 °C**.
- **Előrejelzés**:

| Nap | Minimum | Maximum | Csapadék |
| --- | ---: | ---: | ---: |
| 2026-10-22 | 9 °C | 16,5 °C | 8,67 mm |
| 2026-10-23 | 5,7 °C | 15,3 °C | 0 mm |
| 2026-10-24 | 6,8 °C | 11,2 °C | 1,43 mm |

Ez a CI-környezetben hitelesített, éles időjárási API-val végzett TEST-lekérdezés; **nem** élő Grapes APK-integráció és **nem** gondozási javaslat. A GitHub Action sem a WeatherAPI kulcsot, sem az OIDC tokent nem írja ki.

## Publikus, kvótakímélő TEST cache (2026-10-22)

A `/cached-forecast` **csak olvasott, előkészített időjárási adatot** ad vissza; nem hívja a WeatherAPI-t és nem teszi közzé a szolgáltatói kulcsot. A hivatalos `/forecast` továbbra is felhasználói Supabase Auth hitelesítéshez kötött, a `/ci-forecast` GitHub Actions OIDC-ellenőrzést végez. 

- **Elkülönített TEST adatbázistábla:** `public.grapes_weather_public_cache`, RLS engedélyezve, közvetlen `anon`/`authenticated` olvasás visszavonva; kiszolgálás kizárólag Edge Function által, szerveroldali jogosultsággal.
- A cache-t a GitHub-szignatúrával hitelesített, már bevált `weatherapi-live-verify.yml` sikeres futása tölti fel a **megtisztított** szolgáltatói válasszal.
- Nyilvános olvasási teszt: [GitHub Actions #39856254269](https://github.com/fabianpetermark-commits/Grapes/actions/runs/39856254269) — a cache válaszolt, 3 napra tartalmazott adatot, a hozzáférés nélküli privát `/forecast` 401.
- **Tesztpélda helyszíne: Szentendre, Magyarország**, nem kérünk GPS-t, így a felhasználó helyadata nem kerül a WeatherAPI-hoz.
- **NEM automatikusan frissülő végleges rendszer.** A GitHub Actions push/hitelesített újrafuttatás frissíti; egy időzített, kvótavédett szerveroldali adatfrissítés külön feladat a későbbi TEST/PROD integrációhoz.
- A mobil UI a `src/outdoor/plants-weather.js` komponensben erről a csak olvasható végpontról dolgozik, és csupán **Grapes TEST** buildben engedi a lekérdezést. A PROD buildnek másik, kifejezetten éles környezetet kell használnia, ami jelenleg nincs kialakítva.
- A frissítési időbélyeg és a 6 óránál régebbi adat jelzése kötelező; nem konvertáljuk automatikusan öntözési vagy fagyvédelmi utasítássá.

**Kiadás:** sem API-kulcs, sem felhasználói adatok, sem APK nem került az éles rendszerbe. A PR draft/NO-GO.
