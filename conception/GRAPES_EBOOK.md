# Grapes E-book – PDF-feldolgozás és e-könyv-konvertálás

**Státusz:** ötlet / későbbi termékfejlesztési koncepció. Nem implementációs ígéret, nem része a jelenlegi stabilizációs munkának.

## 1. Cél

Az E-book modul tegye kényelmesebbé a nehezen olvasható, különösen a fix oldalképet tartalmazó PDF-könyvek mobilos olvasását. A felhasználó egy PDF-ből újratördelhető EPUB-ot készíthessen, amelyben szabadon állítható a betűméret és a sortörés.

Az eredeti PDF minden esetben maradjon meg változatlanul. A konvertált EPUB külön fájlként és könyvtárelemként jelenjen meg.

## 2. Tervezett felhasználói folyamat

1. A felhasználó kiválaszt vagy importál egy PDF-et az E-book könyvtárba.
2. A Grapes megvizsgálja, hogy a PDF tartalmaz-e kinyerhető szöveget, vagy szkennelt, képalapú oldalakat tartalmaz.
3. A rendszer a dokumentum típusának megfelelő feldolgozási útvonalat választja.
4. A szöveget és a dokumentumszerkezetet fejezetekre, címekre, bekezdésekre bontja.
5. A felhasználó előnézetben ellenőrizheti az eredményt és a felismert metaadatokat.
6. A rendszer EPUB3-fájlt készít, amely külön könyvként hozzáadható a könyvtárhoz.
7. Az eredeti PDF és a konvertált EPUB egymáshoz kapcsolva marad.

## 3. Kimeneti formátumok

### Elsődleges: EPUB3
- Újratördelhető szöveg mobilos olvasáshoz.
- Állítható betűméret, betűtípus és sorköz az olvasóban.
- Fejezetek és navigációs tartalomjegyzék.
- Képek, lábjegyzetek és metaadatok megőrzése, amennyiben megbízhatóan kinyerhetők.

### Másodlagos: mobilra optimalizált PDF
Opcionális lehetőség olyan anyagokhoz, amelyeknél az eredeti oldalkép, tördelés, ábra vagy képlet megőrzése fontosabb az újratördelhetőségnél. Ez nem azonos az EPUB-konverzióval: a PDF optimalizálása nem feltétlenül jelent valódi szövegkinyerést.

## 4. Feldolgozási útvonalak

### 4.1. Szöveges PDF
- Helyi szövegkinyerés, OCR nélkül.
- Oldalak, bekezdések és lehetséges fejezetcímek elemzése.
- EPUB-struktúra létrehozása.

### 4.2. Szkennelt vagy képalapú PDF
- OCR szükséges.
- Magyar nyelvi modell támogatása kiemelt követelmény.
- Az OCR után helyre kell állítani az olvasási sorrendet, a bekezdéseket, fejezeteket és a tartalomjegyzéket.
- A feldolgozás legyen háttérfeladat, előrehaladás-jelzéssel, megszakítási és újrapróbálási lehetőséggel.

### 4.3. Vegyes PDF
Egy dokumentum tartalmazhat valódi szöveget és szkennelt oldalakat is. A rendszer lehetőség szerint oldalanként vagy oldaltartományonként válassza ki a szükséges feldolgozást, ne küldje automatikusan az egész dokumentumot OCR-re.

## 5. Lehetséges nyílt forráskódú projektek

Az alábbiak vizsgálandó technológiai jelöltek, nem jóváhagyott függőségek. A kompatibilitást, karbantartottságot, licenceket, modelllicenceket, adatkezelést és erőforrásigényt a kiválasztás előtt ellenőrizni kell.

- [PDF Craft](https://github.com/oomol-lab/pdf-craft): PDF-feldolgozás, OCR, Markdown és EPUB munkafolyamat. Vizsgálandó a helyi futtatás, a GPU-igény, a magyar OCR-minőség és a függőségek licence.
- [pdf2epub-paddle](https://github.com/jarodise/pdf2epub-paddle): szkennelt PDF-ek EPUB-ba alakítására fókuszáló projekt. Ellenőrizni kell a PaddleOCR-függőséget, a külső API-k használatát és a magyar nyelvi támogatást.
- [pdf2epub-v2](https://github.com/asdqweasdzxcasd/pdf2epub-v2): EPUB3-kimenetre törekvő alternatíva; vizsgálandó az OCR-szolgáltatóhoz való kötődés és a magyar nyelvi minőség.
- [scan-to-ebook](https://github.com/phuc-nt/scan-to-ebook): szkennelt dokumentumokból e-könyv előállítására irányuló projekt; vizsgálandó a külső LLM/API-költség és az adatküldés.
- [doc-convert](https://github.com/brezgis/doc-convert): többféle dokumentumformátum és helyi OCR-feldolgozás vizsgálatához érdekes jelölt; a projekt érettségét és karbantartottságát külön ellenőrizni kell.

A fenti projektek aktuális állapotáról, képességeiről és licenceiről a tényleges kiválasztáskor ismételt ellenőrzés szükséges. Egy GitHub-projekt licencét nem szabad automatikusan kiterjeszteni a modelljeire és minden függőségére.

## 6. Előzetes technológiai irány

A cél ne egyetlen külső OCR-szolgáltatóhoz kötött megoldás legyen. Előnyben részesítendő a helyi feldolgozás, ahol ez ésszerűen megvalósítható, és a felhőalapú OCR csak külön, egyértelműen engedélyezett lehetőségként jelenjen meg.

Javasolt logikai felépítés:

1. PDF-vizsgálat és típusbesorolás.
2. Helyi szövegkinyerés, ha lehetséges.
3. OCR-adapter szkennelt oldalakhoz.
4. Egységes köztes könyvstruktúra.
5. EPUB3-generálás.
6. Eredményellenőrzés és könyvtárba mentés.

A konverter legyen leválasztható feldolgozókomponens, hogy később más OCR- vagy EPUB-motorra cserélhető legyen. A webes felület ne tartalmazzon nehéz OCR-feldolgozást.

## 7. Adatvédelem és biztonság

- A dokumentumokat alapértelmezetten ne küldje külső szolgáltatásba.
- Külső OCR vagy LLM használata előtt legyen egyértelmű tájékoztatás és felhasználói jóváhagyás.
- A feldolgozott fájlok csak az adott felhasználó vagy explicit módon megosztott háztartás számára legyenek elérhetők.
- Legyen fájlméret- és oldalszámkorlát, erőforráskorlát és feldolgozási időkorlát.
- A feldolgozó ne férjen hozzá tetszőleges fájlrendszer-útvonalakhoz.
- Az eredeti fájl megőrzése és a konvertált példány törlése külön kezelhető legyen.

## 8. Minőségi és elfogadási tesztek

A technológia kiválasztása előtt ugyanazokon a magyar nyelvű mintadokumentumokon kell összehasonlítani a jelölteket:

- tiszta, szöveges PDF;
- jó minőségű szkennelt könyv;
- régi, gyengébb minőségű szkennelt könyv;
- két hasábos tördelés;
- képeket, táblázatokat és lábjegyzeteket tartalmazó könyv;
- vegyes, szöveges és szkennelt oldalakat tartalmazó PDF.

Kiemelt ellenőrzési pontok:
- magyar ékezetek, különösen ő és ű;
- olvasási sorrend és hasábfelismerés;
- bekezdések és oldaltörések;
- fejezetcímek és tartalomjegyzék;
- lábjegyzetek, képek, táblázatok és képletek;
- EPUB kompatibilitás több mobilos olvasóban;
- feldolgozási idő, memória- és GPU-igény;
- helyi és felhőalapú feldolgozás adatvédelmi különbségei.

## 9. Javasolt fejlesztési sorrend

1. A jelenlegi E-book modul és fájlkezelés állapotának felmérése.
2. 3–5 reprezentatív magyar PDF-ből álló tesztkészlet összeállítása.
3. PDF Craft és legalább egy alternatíva összehasonlító próbája.
4. A legjobb jelölt licenc-, biztonsági és üzemeltetési ellenőrzése.
5. Kis, leválasztható prototípus készítése.
6. Előnézetes, visszavonható EPUB-import megvalósítása.
7. Integráció az E-book könyvtárba és mobilos olvasóba.

**Prioritási megjegyzés:** ez a fejlesztés csak a Grapes stabilizációja és a meglévő E-book modul rendbetétele után kerüljön megvalósítási tervbe.
