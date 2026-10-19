# Grapes Home / Háztartás — termékkoncepció és fejlesztési szerződés

> **2026-10-19 · Koncepció v0.4 · TARGET (nem IMPLEMENTED).**  
> A korábbi, közösen elfogadott Home-irány fejlesztésre előkészített összefoglalója. Részletek, amelyekre nem született döntés, külön „javaslat” vagy „nyitott” jelölést kapnak.  
> **Termékígéret:** „Kevesebb adminisztráció. Okosabb mindennapok.”  
> **Alapelv:** „Ne a felhasználó dolgozzon az alkalmazásért. Az alkalmazás dolgozzon a felhasználóért.”

**Részletes, kötelező esemény- és adatkezelési logika:** [GRAPES_HOME_LOGIC_SPECIFICATION.md](./GRAPES_HOME_LOGIC_SPECIFICATION.md). Az M1 H-01–H-12 elfogadási esetek és a későbbi Food/Pénzügy/családi adatkapcsolatok adatbiztonsági invariánsai Codex számára kötelezőek. Az itt szereplő jövőbeli koncepciók ettől még nem implementált funkciók.

## 1. Mit jelent a Home?

**Home / Háztartás** = a háztartás közös feladatait támogató, önálló Grapes-modul. **NEM** a Grapes jelenlegi `data-page="home"` kezdeti modulválasztó képernyőjének felülírása vagy az alsó „Kezdőlap” navigáció átnevezése. Vizuálisan külön „Home” modul-kártyán lehet belépni, változatlan globális alkalmazásnavigációval.

Kezdeti cél: **kizárólag élelmiszerek** és élelmiszer-készlet; később bővíthető háztartási fogyóeszközökre / vegyszerekre. Ez most **nem** feladata a kódnak és nem jogosít fel veszélyes kategóriák összekapcsolására élelmiszerrel.

Végső cél: minimális napi munka mellett segíteni
- mi van otthon (megerősített / becsült / ismeretlen),
- mit érdemes felhasználni előbb,
- mit vegyünk / írjunk a bevásárlólistára,
- „**Mit főzzünk?**” — meglévő, engedélyezett Food-receptek és az elérhető készlet alapján,
- hogyan osszunk el élelmiszert a **❄️ Hűtő / 🧊 Fagyasztó / kamra** között,
- hogyan használható a Pénzügy (igazolt vásárlás) és Food (recept/főzés) adata **adatduplázás nélkül**.

**A nulla kötelező napi bejegyzés teljesen érvényes használat.** A hiányzó adatokból ne gyártsunk fiktív valóságot.

## 2. A háztartási modell és jogosultság

### 2.1. Adatmodell – fogalmak

Az **Alapanyag / Ingredient** a recept kompatibilis hozzávalója (pl. tej). A **termék / Product** konkrét bolti változat és csomag (pl. tej 1 l). A **Készlettétel / InventoryLot** a valós vagy becsült, adott tárolási helyű egység. A **bevásárlólista-tétel** szándék, **nem készlet**. A **főzési esemény** a felhasznált nyers tételek visszavonható, megerősített eseménye; a **készétel-tétel** ennek eredménye. A **Food étkezési naplóbejegyzése** személyes fogyasztás, nem azonos a főzéssel.

Közös otthoni készlet nem írhatja felül automatikusan egy családtag személyes Food-/egészségadatát. Bejegyzések csak egyértelmű engedély és megfelelő jogosultság mellett kerülhetnek át, és mindig saját adaggal.

### 2.2. Az adat bizonyossága

Minden megjelenített döntési adatot egyértelműen megkülönböztetünk:

| Állapot | Jelentés | Példa |
| --- | --- | --- |
| **TERVEZETT** | szándék, nem történt vásárlás/főzés | bevásárlólista |
| **MEGERŐSÍTETT ESEMÉNY** | felhasználó vagy megbízható forrás igazolta, hogy történt valami | „Fagyasztóba tettem”, vásárlási esemény |
| **BECSÜLT** | következtetés, csak valószínűség | „Lehet, hogy elfogyott a tej” |
| **ISMERETLEN** | hiányos vagy elavult adat | nincs tudás a csirkemellről |

A **vásárlást bizonyító blokk nem bizonyítja az aktuális készletet**. A Food-napló egy megevett ételről nem jelenti azt, hogy otthon készült, illetve a bevásárlólista nem bizonyítja a vásárlást. A becsült mennyiség nem könyvelődhet észrevétlenül megerősített készletként. A naprakészség állapotfüggő; tároljuk a forrást, megfigyelés idejét és — ha indokolt — felhasználói megerősítést.

### 2.3. Egy eszköz vs. valóban közös használat

A családi Home a **célzott termékélmény**, de a többkészülékes közös adatszinkron és háztartási jogosultsági modell nem tekinthető késznek pusztán egy helyi tároló létrehozásától. Az első vertikális szelet használhat biztonságos, elkülönült helyi adatot; a felületen egyértelműen jelezze: „Ezen a készüléken tárolva”. Későbbi szinkronhoz legyen `householdId`, `actorId`, rekordazonosító és változásnapló alap, de hitelesítést/szerepköröket **ne színleljen**. A többkészülékes családi szinkron külön review és implementáció.

## 3. Termékfolyamatok

### A. Első használat

Első pillanatban már legyen érték: „Van otthon valami?”, „Szeretnél bevásárlólistát?”, illetve finom, nem kötelező meghívás a készlet felvételére. Ne legyen hosszú kötelező profilozás, napi leltár vagy teljes termékkatalógus-feltöltés.

### B. Készlet és tárolás

- Élelmiszerlista kereséssel / kategóriák helyett praktikus tárolási nézettel: **Hűtő**, **Fagyasztó**, **Kamra**, valamint **Összes** (a megvalósítási navigáció dönthető).
- Minimális kézi hozzáadás: név, mennyiség és mértékegység, tárolási hely; opcionális vásárlási/felbontási / fogyaszthatósági vagy minőségmegőrzési dátum.
- **Mennyiség elosztása:** 1 kg csirkemell → 600 g Hűtő + 400 g Fagyasztó. Gyorsválasztók: teljes hűtő / fele-fele / teljes fagyasztó. Haladó: pontos számmező és csúszka; az összeg invariáns, minden lépés auditálható / visszavonható. A csúszka önmagában nem elég.
- Fagyasztás csak megerősítéssel; külön tárolási és lejárati/romlási becslés szükséges. Ne állítsuk, hogy egy becsült lejárat garantált élelmiszerbiztonsági dátum.
- A „Lejárt” státuszt tényleges címkédatum és minőségmegőrzés/fogyaszthatóság megkülönböztetésével kezeljük, nem generikus „biztosan romlott” ígérettel.

### C. Bevásárlólista és „Mit vegyünk?”

- Felvehető / szerkeszthető / törölhető / kipipálható lista; a kipipálás **nem tesz automatikusan készletbe** (kivéve, ha később külön felhasználói megerősítési folyamat létesül).
- Későbbi, forrásjelölt javaslat: „Lehet, hogy elfogyott a tej · becslés”; „Elfogyott” / „Van még” / „Nem most”. Nincs visszatérő zaklató prompt.
- A Pénzügy OCR/blokk és tranzakció együtt lehetséges vásárlási jel, de **csak tételes, kellően megbízható felismert sor** alakítható termékjavaslattá, akkor is ellenőrzés mellett. Egy `összeg: 5 990 Ft` bizonylat önmagában nem elegendő készletfeltöltésre. A Pénzügy modul adatát és bizonylatát nem módosítjuk.
- A bevásárlólista és a készlet két külön adatstruktúra és két külön felhasználói szándék.

### D. „Mit főzzünk?”

**Fontos korábban elfogadott referencia:** egy képes, sötét Grapes-kártya a recept nevével, idővel/adaggal **ha van valódi adat**, készletbizonyossággal és rövid indoklással: „Miért ezt ajánlom?”. **„Recept megtekintése”**, és külön **„Mentés a receptjeim közé”** a Food meglévő receptgyűjteményébe.

A Home **nem** hoz létre második, konkurens receptadatbázist. A meglévő Food receptadatlap / 5 füles szerkesztő kifejezett védelem alatt áll. A Home csak megengedett olvasási hídon keresztül tekint meg releváns recepteket, és később a meglévő Food API-val/adapterrel indít felhasználói akciót. Ha a Food-adatok vagy jogosultságok hiányoznak, nincs fiktív recept, „Minden van” vagy kitalált idő.

**Készletlevonás kizárólag tényleges főzéskor, felhasználói megerősítéssel.** Ekkor az alapanyag készlet csökken és készétel adagok jöhetnek létre. A későbbi, külön Food-fogyasztás már **nem** vonhatja le ismét ugyanazt a nyers alapanyagot. Receptek mentése, megnyitása és a menütervezés nem készletmozgás.

### E. Proaktív használat, nem felügyelet

A Home időnként, ritkán és releváns döntési pillanatban kérdezhet („A tejet felírom?”), de nem követel napi készletigazolást. A becslés magyarázható, korrigálható és visszafogott; nincs hamis pontosság, büntetés, streak vagy indokolatlan értesítés.

## 4. Megjelenés

- Grapes mobil **`#090E14`** alap háttér, **`#101821`** kártya, **`#17222E`** emelt panel, **`#243343`** keret, **`#F2F7FB`** szöveg, **`#94A5B8`** másodlagos, **`#3BDCF2`** cián akcentus.
- Grapes Brand Guide v0.x még jóváhagyás alatt, vizuális referencia: [Brand Guide PR #41](https://github.com/fabianpetermark-commits/Grapes/pull/41), [Concept UI / Food PR #47](https://github.com/fabianpetermark-commits/Grapes/pull/47).
- Már korábban jóváhagyott hangulat: sötét, tiszta, egyértelmű Food-fotó/kártya, diszkrét fény, státusz mindig szöveggel; kis képernyőn is olvasható.
- Home mintakártyák: **Goal, Recipe Recommendation, Storage Split, Shopping Suggestion**, dokumentáció: [Concept UI Reference](https://github.com/fabianpetermark-commits/Grapes/blob/docs/grapes-product-vision-ui-kit-20261019/docs/GRAPES_CONCEPT_UI_REFERENCE.md) és [HTML mintalap](https://github.com/fabianpetermark-commits/Grapes/blob/docs/grapes-product-vision-ui-kit-20261019/docs/GRAPES_CONCEPT_UI_KIT.html).
- Az illusztratív fotók nem valós használati adatok. Kép hiányában egységes Grapes helyőrző; placeholder CTA nem állíthatja, hogy működik.

## 5. Fejlesztési ütemek

### **M1 — most induló biztonságos vertikális szelet**

Új Home / Háztartás modul belépőpont; külön nézet, belső navigáció / komponensek; **helyi élelmiszerkészlet CRUD**, hűtő/fagyasztó/kamra, egységkezelés és mennyiségelosztás; **alap bevásárlólista**, üres állapotok, visszavonható változások, helyi mentés és adatvesztés-ellenőrzés. Ezen a körön belül **nincs** Pénzügy-, Food-, Drive-, Health-, YAZIO- vagy családi szinkronadat módosítás.

A „Mit főzzünk?” koncepciót a navigációban csak akkor jelenítsük meg funkcionálisként, amikor valódi receptadapter és ajánlás létezik. Egyébként jól jelölt, nem kattintható jövőbeni terv vagy egyszerű tájékoztató üres állapot.

### **M2 — biztonságos adathidak**

Meglévő Food receptolvasás (engedélyezett), Pénzügyből csak tételes, megerősített vásárlási javaslat, valós fogyasztás/főzés és készétel események, egyirányú adapterek, duplikátumvédelem, becslés-státusz. Minden adatmozgás külön review és felhasználói jóváhagyás.

### **M3 — családi szinkron és proaktív Home**

Megbízható többeszközös, jogosultságalapú `household`-szinkron; konfliktusok/eltérő időbélyegek; „Mit főzzünk?”, javaslatok, pazarláscsökkentési elemzés és későbbi vegyszer/kellék kategóriabővítés **csak külön elfogadott terv után**.

## 6. Fogalmi és technikai invariánsok

- Élelmiszertételek normalizált mértékegységgel (`g`/`ml` alap, darab csak megfelelő konverzió esetén), negatív készlet tiltása, ismeretlen nem nulla.
- Készletelosztásnál `hűtő + fagyasztó = kiinduló mennyiség` változatlan mértékegységben; nem duplikálhat mennyiséget.
- Ugyanaz a vásárlási/főzési forrásazonosító idempotens feldolgozásnál nem növelhet/levonhat kétszer.
- Főzési esemény és személyes fogyasztás más típus; a megevés nem von le másodszor nyers alapanyagot.
- Felhasználó által nem megerősített esemény **nem ír át készletet**; hiányzó vagy bizonytalan adat látszódjon.
- Készlet/kapcsolatok és privát Food-adatok szerepkör / hozzáférés szerint külön.
- Helyi alapélmény offline is működik; hiányzó import/szinkron mellett sem sérül.
- Teszt- és éles adat/Drive/Android csomag/aláírás teljes szétválasztása.

## 7. Mérhető elfogadás az M1-hez

1. Home / Háztartás megnyitható a meglévő Grapes fő menüből, és vissza lehet térni. **A `data-page="home"` globális kezdőlap változatlan.**
2. Egy élelmiszer felvehető, szerkeszthető, törölhető, tárolás szerint szűrhető, a mennyiség mértékegységgel és eredettel együtt látszik.
3. Egy 1 kg-os tétel gyorsan 600 g/400 g arányban elosztható; összege 1 kg, negatív nem lehet, a tárolási státusz „megerősített”, ha a felhasználó jóváhagyta.
4. A bevásárlólistát lehet kezelni, de a kipipálás **nem állítja át** automatikusan a készletet.
5. A bezárás/újraindítás után az adatok sértetlenek; migrációs hibánál biztonságos visszaállás/figyelmeztetés (nem csendes adatvesztés).
6. Üres készlet, hiányzó adatok, hibás mennyiség és offline állapot kezelve; TalkBack és mobil 320/360/390/412 px ellenőrizve.
7. Változatlanul működik Food, Food TEST design, Pénzügy, e-book, Drive, Health, YAZIO; M1 nem írja adataikat.
8. `npm test`, `npm run build:android-web`, célzott browser/Android shell tesztek lefuttatva, eredmény PR-ben; nem hamis zöld státusz.
9. Nincs auto-merge, aláírt APK, TEST/PROD kiadás vagy külső publikálás külön felhasználói engedély nélkül.

## 8. Nyitott részletkérdések, amelyek az M1-et nem blokkolják

- Háztartáson belüli jogosultságok és közös szinkron technológiája (Drive vs más backend) — **külön döntés**, ne gyártsunk látszatmegosztást.
- Beszerzés forrása, blokktétel-kivonat bizalomküszöbe, készletbecslési stratégia, családi szerepek.
- Kimutatások összesített, időszakos és pazarláscsökkentési céljai.
- A Home későbbi nem-élelmiszer kategóriáinak jogosultság- és biztonsági modellje.

## 9. Kapcsolódó Home-minták és jóváhagyás

A dokumentum a **közösen elfogadott Home alapirányt** rögzíti. A részletes M1 komponensszerkezet, a tárolási séma és a konkrét navigáció **Codex technikai javaslata**, amely a cél és az invariánsok megtartásával szabadon finomítható. A jelen koncepció nem jelenti az alkalmazás vagy a backend élesítési jóváhagyását.
