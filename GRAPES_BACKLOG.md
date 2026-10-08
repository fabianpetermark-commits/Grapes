# Grapes – félretett feladatok és tervezési jegyzetek

## Ebook modul – végső ellenőrzés után félretéve

Ezeket a pénzügyi modul után vesszük elő:

1. Az USB-szinkron csak támogatott ebook-fájlokat fogadjon el; jelenleg a kiválasztott mappa más, nem rejtett fájljai is bekerülhetnek.
2. A Google Drive-megosztás ne maradjon észrevétlenül nyilvános a későbbi feltöltéseknél, és a leválasztás kezelje a korábban kiosztott jogosultságokat is.
3. Aláírt EPUB (`META-INF/signatures.xml`) metaadat-módosítását biztonságosan el kell utasítani vagy külön kezelni.
4. Az USB-szinkron több olvasói könyvtármappát és lapozott fájllistát is kezeljen.
5. EPUB megnyitásakor a felület váltson a szöveges nézetre; a kapcsolódó böngészőteszt jelenleg hibát jelez.

Ellenőrzési alap: a unit tesztek, az elrendezésteszt és az EPUBCheck futása sikeres volt; az EPUB-megnyitás tartalmi böngészőtesztje maradt hibás.

## Pénzügyi modul – Excel/XLSM import terve

### Cél

A Grapes olyan `.xlsx`, `.xlsm`, `.xls` és `.csv` fájlokat is fogadjon, amelyek nem egyetlen szabályos adattáblát tartalmaznak. Az importáló előbb feltérképezi a munkalapokat és az egymástól elkülönülő adatblokkokat, majd a felhasználó jóváhagyása után alakítja át őket Grapes-adatokká.

### Technikai döntés

- SheetJS olvassa be a munkafüzetet, a cellaértékeket, képleteket, munkalapokat és tartományokat.
- A jelenlegi vanilla JavaScript/Vite alkalmazásban nem vezetünk be külön React-réteget csak az importáló miatt.
- A React Spreadsheet Import hasznos mintaként szolgál az importlépésekhez, de a felület saját Grapes-stílusú, akadálymentes modális folyamat lesz.
- Az `.xlsm` makróit nem futtatjuk és nem költöztetjük át; csak az adatok olvasása történik.

### Tervezett importfolyam

1. **Fájl kiválasztása** – méret-, típus- és olvashatósági ellenőrzés.
2. **Munkafüzet feltérképezése** – munkalapok, használt cellatartományok, összevont cellák, képletek és ismétlődő hónapfejlécek felismerése.
3. **Adatblokkok felismerése** – például a `Havi kiadások 2027` lapon a 12 hónap 12 külön blokk legyen, a `Félretett` lapon pedig a megtakarítások és kivétek külön blokkok.
4. **Kézi ellenőrzés** – a felhasználó be- és kikapcsolhat blokkokat, módosíthatja a tartományt, a hónapot, az adattípust és az oszlopok jelentését.
5. **Előnézet és hibajelzés** – az importálandó, kihagyott és bizonytalan sorok külön jelenjenek meg.
6. **Jóváhagyás** – csak a jóváhagyott sorok kerüljenek a pénzügyi naplóba, megtakarításokba vagy később egy másik támogatott adattípusba.
7. **Automatikus mentés** – az import ugyanazt a helyi és Google Drive-os mentési folyamatot használja, mint a kézzel rögzített tételek.

### Felismerési szabályok

- Üres sorok és oszlopok választják szét az összefüggő blokkokat.
- Az ismert magyar hónapnevek és rövidítések időszakot jelölhetnek.
- A képletet tartalmazó összesítő sorok, `Összesen`/`Részösszeg` sorok és az `Áttekintés` számított cellái alapból kimaradnak.
- A negatív összeg önmagában nem dönti el a típust; a fejléc, a munkalap és a felhasználói megfeleltetés együtt számít.
- A hiányzó nap esetén a hónap első napja csak látható, jóváhagyandó javaslat legyen.
- A pénznem soha ne legyen automatikusan átváltva.
- A bizonytalan sorokat az importáló ne dobja el csendben.

### Első kiadás javasolt határa

- Tranzakciók (bevétel és kiadás) importja több munkalapról és több blokkból.
- Megtakarítási mozgások importja a `Félretett` jellegű lapokról.
- Blokkonkénti oszlop-hozzárendelés és soronkénti előnézet.
- Ismételt importnál duplikációjelzés dátum, összeg, típus és leírás alapján.
- Az eredeti fájl érintetlen marad.

Későbbre hagyható: automatikus kategória-tanulás, AI-alapú jelentésfelismerés, makrók értelmezése és a módosított Excel-fájl visszaírása.

### Elfogadási feltételek

- Egy munkalapon legalább 12 vízszintes havi blokk felismerhető és külön kapcsolható.
- A számított összesítések nem lesznek tévesen pénzügyi tételek.
- A felhasználó import előtt minden létrejövő tételt ellenőrizhet.
- Hibás sorok mellett a jó sorok nem vesznek el, de részleges import csak kifejezett jóváhagyással történik.
- Import után az adatok szerkeszthetők, automatikusan mentődnek, és bekerülnek az áttekintésbe és az előrejelzésbe.

### Nyitott termékdöntés

Az első változatban a megtakarítási célokat is létrehozzuk-e automatikusan a munkafüzetből, vagy csak a megtakarítási mozgásokat importáljuk egy `Importált megtakarítás` gyűjtőcél alá?
