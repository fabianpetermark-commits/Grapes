# Food Android integráció – 2026-10-15

A `feature/food-yazio-safe-import` ág (`9b721d5`, benne `bfdace7`) beépítve az Android fejlesztési ágba. A main és az Apps Script deployment változatlan. A #15 PR állapotát nem módosítottuk.

## Beépített funkciók

- Az új Android Szinkron képernyő YAZIO gombja CSV-t és JSON-t fogad. JSON esetén 40 MB korlát, aktív profilhoz kötött előnézet, 100 soros lapozás, státuszszűrő, új rekordok alapértelmezett kijelölése, bizonytalan sorok kézi választása.
- Import előtt IndexedDB biztonsági másolat és JSON-letöltés; 150 soros, mentésenként ellenőrzött kötegek; ugyanazzal az exporttal folytatás, duplikációvédelem és utolsó köteg visszavonása. Sikertelen helyi mentés nem cseréli le a memóriában lévő projektet.
- A forrásarchívum és hiányzó/eredeti tápanyagok megmaradnak; importált receptek a mobil Receptek nézetben csak olvashatóak (legfeljebb 400). Víz, testsúly és történeti célok csak az archívumban szerepelnek.
- A mobil ételkereső a közös OFF/FatSecret keresőt használja, forrásjelöléssel, részleges hibajelzéssel, vonalkódos deduplikációval és késői válaszok védelmével. Online találat megnyitása nem ment; jóváhagyott étkezés-hozzáadáskor kerül a katalógusba.

## Integráció közben javított hibák

- Az importált rekord két alapértelmezett időbélyege ezredmásodperces eltérés miatt néha utólag módosítottnak látszott. Azonos kezdeti időbélyeg, külön regressziós teszt.
- A mobil Ismétlés művelet már nem viszi tovább a YAZIO eredeti dátumát és külső azonosítóját.
- A FatSecret iframe válaszánál a forrásablak és nonce mellett a Google-origin ellenőrzése is kötelező.
- A korábbi megosztási kapcsolatok, feldolgozott megosztások, Android Health és release-beállítások megmaradtak az összeillesztésben.
- Az alkalmazáskeret nem görgethető el a felugró panelek fókuszváltásakor; a panelek és tartalom saját görgetése marad meg.

## Ellenőrzés

- Teljes egységteszt: 289 teszt, sikeres.
- `tests/android-food-yazio.browser.mjs`: szintetikus 151 sor; előnézet írás nélkül, lapozás, mégse, mentés előtti tárhelykvóta-hiba, újrapróbálás, backupletöltés, két köteg, újratöltés, ismételt fájl és visszavonás.
- `tests/food-catalog.browser.mjs`: mindkét szolgáltató, termékellenőrzés, naplózás, részleges hiba és újratöltés; mockolt szolgáltatókkal.
- `tests/android-mobile-preview.browser.mjs`: mobil navigáció, ikonok, megosztási/étkezésfelvételi felület, Health/Samsung-víz import és CSV-import.
- `tests/android-food-mobile.browser.mjs`: Android Food nézet elrendezése.
- Androidhoz csomagolt Vite build: sikeres; ez önmagában nem natív APK-build vagy eszközteszt.
- Valós OFF: parancssorból és böngészőből a `keksz` keresés sikeres (57, illetve 75 találat; eltérő kereső/fallback válaszok).
- Valós FatSecret: a jelenlegi release broker URL-lel böngészőből 20 másodperces időtúllépés. A hiba pontos külső oka nincs igazolva. Deploymentet, kulcsot, jogosultságot nem módosítottunk.

## Korlátok és kiadási feltételek

Nincs valódi felhasználói, többéves YAZIO-export, ezért annak kompatibilitása és telefonos teljesítménye nem igazolt. A tárhelyteszt mentés előtti kvótahibát szimulál; nem teljes valós eszközös kvótakimerítés. A megszakított kötegek folytatására egységteszt van, a böngészős próba a mentés előtti hibából folytatást ellenőrzi. Nem futott valódi Google-fiókos Drive-visszaállítás vagy natív Samsung/Health eszközteszt.

A JSON teljes forrásarchívuma a Food-projekt része; későbbi Drive-szinkron feltölti. Erre az előnézet figyelmeztet. Ismeretlen tápanyag nem nulla. Eredeti szerverállapot visszaállítása és automatikus szerkeszthető receptkonverzió nincs ígérve.

Az új JSON-import fejlesztői tesztelésre kész; a teljes éles elfogadás még nyitott. Main-merge, Pages deployment és új nyilvános APK-kiadás nem történt.

## Kézi próba

1. Szinkron → YAZIO → JSON; ellenőrizd a profilt, napokat, bizonytalan sorokat és figyelmeztetéseket; Mégse után ne változzon a napló.
2. Importálj a biztonsági mentés megtartásával; újratöltés után ugyanaz a fájl ne hozzon létre másolatokat.
3. Receptek alatt nézd meg a csak olvasható YAZIO-recepteket. Egy importált bejegyzés szerkesztése után a visszavonás azt tartsa meg.
4. A mentés visszaállításával állítsd vissza az import előtti állapotot; külön ellenőrizd a Health-bejegyzéseket és megosztási kapcsolatokat.
5. Telefonon keress az étkezés + paneljén; OFF találat mentése, részleges FatSecret-hiba és offline saját ételek használata.
