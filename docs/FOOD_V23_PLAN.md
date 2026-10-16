# Grapes v23 — Food fejlesztési terv

Állapot: fejlesztés folyamatban. B2 (navigáció és panelgesztusok) kódja elkészült; a 053445e commit két kapcsolódó CI-ellenőrzése sikeres. Valódi Android-eszközön végzett gesztusteszt még szükséges a kiadáshoz. Alapág: `codex/android-app`. Fejlesztési ág: `feature/food-v23`.
A blokkokat külön commitokban, tesztekkel kell megvalósítani. A v22 kiadás és a meglévő felhasználói adatok megőrzendők. Az ág nem olvasztható be a teljes elfogadási ellenőrzés előtt.

## B3 részállapot — Receptfelület (2026-10-16)
- Teljes képernyős receptszerkesztő, saját vissza gomb és mentési művelet.
- Nem mentett módosítások megerősítése visszalépéskor.
- Saját ételek név szerinti keresése a hozzávalók között, teljes szélességű hozzáadás gomb.
- A 5daa54c commit Food YAZIO és connected search CI-ellenőrzései sikeresek.
- **Megvalósítva kódban:** meglévő közös online/offline kereső megnyitása receptből, étel visszaválasztása a recepthez; élő EAN/UPC kamerakép-felismerés WebView kameraengedéllyel, fotós/kézi fallback és kamerafelszabadítás.
- **Kiadás előtti nyitott ellenőrzés:** teljes Android build, kameraengedély és BarcodeDetector valós eszközön, receptkereső visszalépés és adatintegritás. A meglévő Food CI-k nem tesztelik a natív kamerát. B3 funkciók kódja elkészült, de teljesen tesztelt/kiadható állapot még nincs igazolva.
- A felhasználó a kiadás utáni telefonos tesztelést vállalja; ez nem helyettesíti az automatizált ellenőrzéseket.

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


## B3 – Recept és keresés: részfeladat lezárás
- Elkészült: teljes képernyős receptszerkesztő, visszalépés előtti nem mentett változások figyelmeztetése, helyi hozzávalókeresés, teljes szélességű hozzáadás.
- Ellenőrzés: a 5aaef00166199da486dd6dee39673c12497257e6 commit Food YAZIO import és Food connected search GitHub Actions ellenőrzése sikeres.
- Hátralévő B3-feladatok: közös ételadatbázis-kereső, élő Android-kamerás vonalkódolvasó és tényleges készülékteszt.
- Kiadás/merge: külön jóváhagyásig nem történik.


## B8 — Pénzügyi napló: Grapes Mobile, többpénznemes blokkok, Android értesítések

**Státusz:** újonnan felvett fejlesztési blokk; implementáció még nem kezdődött el. A B6/B7 kiadás előtti feltételeit nem helyettesíti.

### B8.1 — Grapes Mobile felület
- A pénzügyi napló főoldalának, tranzakciólistájának, hozzáadás/szerkesztés paneljének, blokkbeolvasásának és szűrőinek egységesítése a Grapes Mobile vizuális rendszerével.
- Mobilon használható, billentyűzet- és safe-area-biztos panelek; hozzáférhető gombok, visszanavigálás, mentetlen módosítások megerősítése.
- Meglévő tranzakciók, személyek, kategóriák, megtakarítások, bizonylatok, előrejelzések és Drive-adatok változatlan megőrzése.

### B8.2 — Többpénznemes blokkbeolvasás és tranzakciók
- A jelenlegi naplószintű HUF/EUR/USD pénznem mellett tranzakciónkénti eredeti pénznem és eredeti összeg adatmodellje, visszafelé kompatibilis migrációval.
- OCR végösszeg-jelöltekhez pénznem és bizonyosság társítása (Ft/HUF, EUR/€, USD/$ és releváns helyi pénznemjelölések); többértelmű jelölésnél ne legyen automatikus, csendes HUF-könyvelés.
- A tranzakció hozzáadásánál/szerkesztésénél és a blokkbeolvasás előnézetében az **összeg beviteli mező jobb szélén, azzal egy vizuális egységben** kompakt pénznem-legördülő (pl. HUF ▾ / EUR ▾ / USD ▾) jelenik meg; mobilon is könnyen érinthető, billentyűzet mellett is használható.
- A legördülő az adott tranzakció pénznemét módosítja, nem a teljes naplóét; OCR esetén a felismerés előtölti, a felhasználó jóváhagyás előtt javíthatja. Pénznemváltás önmagában nem váltja át az összeget.
- Blokk előnézetben az összeg és pénznem külön ellenőrizhető/javítható, és a tényleges mentés csak jóváhagyással történhet.
- Vegyes pénznemű tételek összesítése kizárólag világosan jelzett, megadott vagy ellenőrzött árfolyammal; eredeti összeg/pénznem soha nem íródik felül, árfolyam hiányában nincs megtévesztő összeadás.
- Mentés, CSV/backup import-export, Drive szinkron, szűrés és kimutatások kompatibilitási tesztjei; korábbi v22 adatok sértetlensége.

### B8.3 — Android banki és Google Wallet értesítések megvalósíthatósága
- Android NotificationListenerService lehetőségeinek és készülék/bankfüggő korlátainak vizsgálata; az értesítések hozzáférése külön, kifejezett Android-rendszerengedélyt igényel.
- Csak felhasználó által engedélyezett banki/Wallet alkalmazások; minimális helyi adatfeldolgozás, érzékeny értesítéstartalom naplózása és felhőbe továbbítása nélkül.
- Kiadás/bevétel, összeg, pénznem, kereskedő és időpont felismerése kizárólag a tényleges értesítéstartalomból; ismeretlen/hiányos tartalom ne generáljon automatikus tranzakciót.
- Beérkezett javaslatok külön ellenőrző listába kerüljenek; jóváhagyás/szerkesztés/elvetés; nincs automatikus pénzügyi könyvelés.
- Duplikációvédelem értesítés-ismétlés, blokkból és kézzel bevitt tételek esetén; visszavonható import.
- Engedély-visszavonás, értesítés nélküli bankok, maszkolt összegek, különböző nyelvek és Android-verziók tesztjei.
- A Google Wallet/banki értesítés nem tekinthető teljes vagy hiteles számlatörténetnek; banki API-kapcsolat ettől külön fejlesztés lenne.

### B8 elfogadási feltételek
- A jelenlegi HUF-naplóba EUR blokk felvihető úgy, hogy EUR marad; HUF összesítés csak megfelelő árfolyammal készül.
- A v22 pénzügyi adatok megmaradnak; CSV/backup és Drive körutak nem veszítenek pénznemet.
- A felhasználó explicit engedélye nélkül sem banki értesítésfigyelés, sem automatikus pénzügyi tranzakciómentés nem történik.
- B8 külön commitokban és ellenőrzésekkel, kizárólag a feature/food-v23 ágon készül; nincs automatikus merge vagy release.
