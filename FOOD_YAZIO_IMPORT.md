# Grapes Food – YAZIO JSON-előzményimport (fejlesztői ág)

Állapot: **ellenőrzés alatt / részleges megvalósítás**. Az 1zun4/yazio-exporter JSON-bundle formátumát használja. A `main` ág nincs módosítva, az Apps Script deploymentek nem változtak.

## Kódfelmérés
- `src/food/food-data.js`: Food projekt (profil, napló, receptek, célok), étkezéskori tápérték-pillanatkép, profilhoz kötött backup.
- `src/food/food-app.js`: napló, statisztika, Health-import, mentés és UI.
- `src/food/food-health-import.js`: Health Connect bridge v1, stabil `externalKey`.
- `src/storage/local-project-store.js`: IndexedDB `grapes-projects`, projektek objektumtára.
- `src/storage/grapes-drive.js`: `Ételnapló.grapes.json` Drive-szinkron, a kézi mentés működését nem változtattuk.
- `android-health-connect-poc`: NutritionRecord/HydrationRecord, importnál `healthconnect:` és `samsunghealth:` azonosítók.

## Megvalósítva
- Helyi, legfeljebb 40 MB-os JSON-bundle és táblanév-/verzióellenőrzés; ismeretlen formátum nem ír adatot.
- Kötelező előnézet, céllal egyező aktív profil, időszak, napok, státuszok, 200-as lapozás, dátum/étkezés/státusz szűrők, forrásfigyelmeztetések és napi eltérések.
- Új, duplikált, bizonytalan és hibás sorok elkülönítése. Biztos duplikáció kizárva; bizonytalan kézi kijelöléssel.
- Eredeti `entry_id` elsődleges; ID nélküli rekordoknál kanonikus tartalom + előfordulási sorszám + exportazonosító. Más exportban megegyező, de bizonytalan esemény nem összevonható automatikusan.
- Importált soron `origin` eredetadatok és eredeti `sourcePayload`, teljes forrásbundle `importBatches[].sourceArchive` archiválva. Tápanyagok 8 jegy pontosságig, ismeretlen értékek `null`; mg/µg saját egységgel.
- 150-es mentett darabok, azonos fájlból történő folytatás és idempotens írás; egy importköteg véglegesítése.
- Helyi IndexedDB backup + automatikus JSON backupletöltés *az első rekord írása előtt*; `Mentés visszaállítása` visszatöltheti a JSON-t a meglévő profilra.
- Importköteg visszavonása; utólag módosított sorok automatikus megőrzése.
- Napi napló és meglévő all-time, kalória, makró és statisztikai nézet. Az eredeti YAZIO-dátum alapján csoportosít.
- Importált YAZIO-forrásreceptek és hozzávalók külön, csak olvasható formában megjelennek a Receptek oldalon (legfeljebb 400 egyszerre), az eredeti Grapes saját receptadatok változatlanok maradnak.

## Fontos korlátok / lezárandó feltételek
1. **Nincs valós felhasználói exporttal végzett kompatibilitásteszt.** Az upstream nem dokumentált YAZIO API-ja és exportálója változhat. 40 MB fölötti export jelenleg nem támogatott; a nagy fájloknál a böngésző memóriakerete is korlátozhat.
2. A YAZIO-forrásreceptek egyelőre **csak olvashatók**; nem keletkezik automatikusan új natív, szerkeszthető Grapes-recept / termék. Ezzel elkerülhető a hiányos összetevőből tévesen számolt tápérték.
3. Testsúly, víz és korábbi napi célok a forrásarchívumban megmaradnak, de nem jelennek meg új önálló Food naplórekordként vagy célsorként.
4. A `nutrition_log` tápértékei az *exportáló által számított* történeti értékek; a YAZIO által akkor rögzített, azóta módosult termék régi összetétele nem rekonstruálható. Az eltéréseket az előnézet jelzi. Veszteségmentes az exportált JSON megőrzése, de **nem ígérhető az eredeti YAZIO-szerverállapot pontos visszaállítása**.
5. Hiányzó rekord-ID esetén átfedő, eltérő exportok közt nincs biztos identitás; a lehetséges egyezés `bizonytalan`, külön jóváhagyás szükséges.
6. Nincs külön, eszközön elvégzett teljesítmény-, kvóta- és végponttól-végpontig böngészőteszt. A natív Android Health Connect híd buildje sem része ennek a webes fejlesztésnek.
7. A helyi JSON-fájl nem kerül automatikusan külső szolgáltatásra. A Food projekt későbbi kézi Drive-mentése viszont az archivált YAZIO-forrást is elmentheti; a felhasználónak tudnia kell róla.
8. A biztonsági mentés IndexedDB-ben történő tárolásának és a mentésből visszatöltésnek **valódi böngészős próbája még szükséges** a kiadás előtt.

## Manuális ellenőrzési lépések
1. Válts a fejlesztői ágra és nyisd meg a Food modult az aktív Google-profillal.
2. Készíts először Food backupot a **Mentés export** gombbal.
3. Az upstream exportálóval készíts teljes `export.json` bundle-t: `yazio-exporter --format json --out export`. A Grapes oldalon ne add meg a YAZIO-jelszót.
4. Kattints **YAZIO import**, válaszd ki a JSON-t. Ellenőrizd az időszakot, a kategóriákat, a 40+ tápanyag értékét, a warnings listát és a biztos/bizonytalan duplikációkat.
5. Ellenőrizd, hogy **Importálás indítása** nélkül a napló, a Drive és az IndexedDB főprojekt változatlan. Kattints Mégse, majd próbáld újra.
6. Indíts importot; ellenőrizd a backupletöltést és a helyi backup meglétét, a státuszt és a korábbi naplózott dátumokat.
7. Frissítsd az oldalt; ismételt fájlfeltöltéskor a stabil ID-k biztos duplikációk legyenek.
8. Próbáld meg megszakítani az importot böngészőfrissítéssel, majd azonos fájl újrafeltöltésével folytatni. Ellenőrizd a köteg státuszát.
9. Nézd meg az all-time statisztikát és a Receptek oldalon a YAZIO-archív receptlista mintát.
10. Válaszd a **YAZIO visszavonás** gombot, és ellenőrizd, hogy kizárólag az adott köteg bejegyzései tűnnek el.
11. Az import előtti mentést a **Mentés visszaállítása** gombbal töltsd vissza; ellenőrizd a Food-katalógust és a Health Connect rekordokat.
12. Külön Google-fiókkal/profillal ellenőrizd, hogy nem látható az előző profil naplója.

## Automatizált ellenőrzés
`npm test`, `npm run build`; dedikált `.github/workflows/food-yazio-ci.yml` kizárólag a fejlesztői ágon fut, **nem deployol**.

A fenti hiányosságok miatt a funkciót nem szabad teljes, éles használatra hitelesített YAZIO-importként kommunikálni.
