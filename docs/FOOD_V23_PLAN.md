# Grapes v23 — Food fejlesztési terv

Állapot: fejlesztés folyamatban. Alapág: `codex/android-app`. Fejlesztési ág: `feature/food-v23`.
A blokkokat külön commitokban, tesztekkel kell megvalósítani. A v22 kiadás és a meglévő felhasználói adatok megőrzendők. Az ág nem olvasztható be a teljes elfogadási ellenőrzés előtt.

## B1 — Food főoldal és Víz UI
- A duplikált ÉTELNAPLÓ/nagy dátum/dátum-alcím eltávolítása; dátumválasztó és nyilak megtartása.
- „Megosztva velem” hivatkozás eltávolítása a főoldalról; a megosztások a postaládába kerülnek.
- Sorrend: dátumválasztó, napi kalóriakártya, víz, kompakt receptek, étkezések.
- Receptek panel: ikon, lista megnyitása, közvetlen + létrehozás, 2 legutóbbi recept neve és kcal/adag.
- Víz: duplikált felső blokk törlése; „Heti folyadékbevitel” valós adatokból, valós átlaggal és napokkal; a teljes „Mai bevitel”/„Előzmények” alsó szekció eltávolítása (adatvesztés nélkül).
- Kalóriagyűrű importált adatoknál grafikai javítás, összesítési logika módosítása nélkül.

## B2 — Navigáció és egységes panelek
- Minden modul/almodul dinamikus fejléce: modulnév + aktuális képernyő alcíme.
- Egységes bottom-sheet dizájn, képernyőmagasság és billentyűzet/safe-area kezelése.
- Fogantyún lefelé húzva bezárás; kis húzás visszaugrik; belső görgetés nem zárja be; nem mentett adat esetén megerősítés.
- Teljes képernyős szerkesztők normál visszanavigálással működnek.

## B3 — Receptek és ételkereső
- Új recept és szerkesztés teljes képernyős oldalon, nem bottom-sheetben; kitöltött űrlap megőrzése.
- Hozzávaló dropdown helyett egységes keresőpanel a teljes élelmiszer-adatbázissal, legutóbbiakkal, kedvencekkel, fotóval, saját étellel.
- Lapos, teljes szélességű „Hozzávaló hozzáadása”; mennyiség/egység, módosítás/törlés; összes és adagonkénti tápérték.
- Vonalkód gomb mind receptben, mind étkezésnél valódi Android-kamerát indít; engedély, EAN/UPC felismerés, terméktalálat, kézi felvitel fallback, visszatérés eredeti művelethez.
- Valódi Android-eszközön kötelező teszt: nem elegendő fájlválasztó vagy újabb keresőpanel.

## B4 — Statisztika és üzenetek
- Napi kártyáról hárompontos menü eltávolítása; kalóriagyűrűre koppintva ÚJ teljes statisztikai oldal.
- Limitértékekre koppintva cél-/limitbeállítások.
- Statisztika: 7/30/90 nap, teljes időszak, egyéni tartomány; kalória, cél, átlag, makrók, kördiagram, étkezési megoszlás, választható tápanyagok, interaktív napértékek.
- Napi üzenetek: napszak, mai/múltbeli/jövőbeli nap, naplózott étkezés és valódi célállapot alapján. „Megvan a napi cél!” csak igazolt teljesítésnél; maradék csak pozitív ismert keretnél. Stabil üzenetválasztás.
- Étkezésenként (reggeli, tízórai, ebéd, uzsonna, vacsora, egyéb) 4 állapot: nincs rögzítés, limiten belül, pontosan limit, túllépve. Csak beállított limit mellett értékelhető. Nem bűntudatkeltő szövegek.

## B5 — Postaláda
- Megosztott receptek/étkezések és verziófrissítések közös postaládában, olvasatlan jelzés, rövid előnézet, típus szerinti műveletek.

## B6 — Szinkron
- Food megnyitásakor, ha legalább 5 perc telt el, automatikus frissítés; aktív nézetben 5 percenként.
- Pull-to-refresh neon-kék forgó karikával és sikerpipával; kézi frissítés azonnal indítható.
- YAZIO közvetlen API, Health Connect és Samsung Health → Health Connect útvonal; csak új/módosult adatok, idempotens import, forrásazonosítás, utolsó sikeres frissítés és hiba.
- Biztonságos hitelesítőadat-kezelés; opcionális háttérszinkron Android korlátain belül (nem ígérünk garantált 5 perces háttérfutást).

## B7 — Kiadás előtti tesztek
- Automatizált unit/browser/build és Android build; valódi Androidon kamera, gesztusok, safe-area, billentyűzet, offline/hibás hálózat.
- Meglévő v22-es adatok megőrzése, szinkron duplikációk kizárása, víz és Food statisztika valós adatokkal.
- PR ellenőrzés után v23 aláírt APK külön kiadási folyamattal.

## Munkaszabályok
- Minden blokk külön ellenőrizhető commitokkal; nincs automatikus beolvasztás/kiadás.
- Az adatmodell vagy importösszesítés csak kifejezetten indokolt esetben módosul.
- A terv teljes; új igények külön egyeztetéssel.
