# Grapes Home Logic Specification — események, készlet, főzés, vásárlás, család

**Állapot:** v0.1 / 2026-10-19 / M1-hez kötelező logikai szerződés + M2/M3 előre definiált bővítési határok.  
**Repo/ág:** fabianpetermark-commits/Grapes · feature/home-household-mvp-20261019  
**Kapcsolódik:** GRAPES_HOME_PRODUCT_SPEC.md, CODEX_HOME_IMPLEMENTATION_BRIEF.md, #49, draft PR #50.  
**Elsőbbség:** adatbiztonsági és szétválasztási invariánsokat ez a dokumentum pontosít; képernyő- vagy rendszerarchitektúra-változást ez önmagában nem engedélyez.  
**Jelmagyarázat:** **KÖTELEZŐ M1** = most megvalósítandó; **KÖTELEZŐ JÖVŐBELI** = későbbi integráció során nem sérthető; **JAVASLAT** = review után válik döntéssé; **NYITOTT** = nincs még jóváhagyott üzleti szabály.

## 1. A Home célja és működési határa

A Grapes Home/Háztartás **új önálló modul**, nem a meglévő Grapes Kezdőlap átnevezése. A felhasználó kevés kézi adminisztrációval képes legyen kezelni, mi lehet otthon; a rendszer valós, megmagyarázható javaslatokkal segítse a vásárlást, tárolást és főzést. A nulla napi megnyitás is elfogadható.

A Home M1 **élelmiszerre korlátozódik**. Később egyre kevesebb bevitel legyen szükséges az engedélyezett Food- és Pénzügy-adatokból, de a hiányzó információ nem igazolás. A kezdeti adatbázisnak később támogatnia kell a Food-recepteket, több profilt, készételt, vásárlási forrásokat és családi szinkront **a mostani személyes adatok átírása nélkül**.

Az M1 csak a saját, elkülönült helyi Home-adatokon végezhet írást. Food, Pénzügy, YAZIO, Health Connect, Drive, víznapló és más modulok üzleti adatai változatlanok; nincs automatikus backend-/APK-kapcsolat.

## 2. A legfontosabb elv: nem mindegy, hogy mit tudunk

**KÖTELEZŐ M1:** a forrást és a bizonyosságot külön tartsuk a tételek mellett. Négy alapstátusz:

| Státusz | Mit jelent? | Készletértéket önmagában módosíthat? |
| --- | --- | --- |
| TERVEZETT | A felhasználó szándéka, pl. bevásárlólista vagy főzési terv | **Nem** |
| MEGERŐSÍTETT ESEMÉNY | Tudatosan jóváhagyott bevételezés, mennyiségkorrekció, áthelyezés vagy főzés | **Igen, a jóváhagyott esemény szerinti mértékben** |
| BECSÜLT | Korlátozott adatokból következtetett mennyiség, lejáratkockázat, készletigény | **Nem, további jóváhagyás nélkül** |
| ISMERETLEN | Nincs adat, hiányos vagy elavult | **Nem** |

**A „múltkor biztosan vásároltunk tejet” nem egyenlő azzal, hogy most biztosan van otthon tej.** Még a korábban megerősített bevételezéshez tartozó aktuális készlet is elavulhat és lehet pontatlan. A készlet mennyiségének állapota (megerősített / becsült / ismeretlen), a bekerülés forrása, az esemény ideje és a pillanatnyi megbízhatóság **külön tulajdonságok**, nem egyetlen mindent elfedő jelző.

**KÖTELEZŐ M1:** minden mennyiséget teljes mértékegységgel, nem negatív számmal tárolunk; ismeretlen soha nem lesz automatikusan 0. A „megerősített” állapot a felhasználó által megerősített **akkori megfigyelést** jelenti, nem általános élelmiszer-biztonsági vagy valós idejű garanciát.

**KÖTELEZŐ JÖVŐBELI:** a külső adatforrásból származó becslés sem írhat automatikusan felül megerősített adatot. Javaslatot tehet, de annak hatását és forrását meg kell jeleníteni.

## 3. Alap entitások — logikai modell, nem kötelező ORM/séma

| Entitás | Tartalom | Határ / indok |
| --- | --- | --- |
| Household | householdId, név, tulajdonos/actor-azonosító (ha van), adatverzió | M1-ben egy helyi háztartás; később bővíthető több szereplőre |
| Ingredient | canonicalIngredientId, név, megengedett egységdimenzió, aliasok | A receptek összevethetősége miatt; nincs erőltetett kézi katalógus |
| Product | productId, egyedi bolti név, EAN? , csomagméret? , ingredientMapping? | Nem kötelező, nem azonos az alapanyaggal; változó termékadatok |
| InventoryLot | lotId, householdId, név/ingredientId?, originEventId, quantityBase, dimension, displayUnit, location, status, source, observedAt, createdAt, updatedAt, expiryDate?, expiryKind?, openedAt?, frozenAt?, thawedAt? | **KÖTELEZŐ M1** minimális mezőkkel; megerősítetlen dátum legyen üres |
| ShoppingListItem | itemId, householdId, név, quantity?, unit?, status, source, updatedAt | Terv. Soha nem ugyanaz, mint az InventoryLot |
| HouseholdEvent | eventId, householdId, type, timestamp, actorId?, sourceType, sourceId?, payload, confirmation, reversalOf?, resultingRevision | Visszakövethető változás, későbbi szinkron/idempotencia alapja |
| CookingEvent | eventId, recipeRef?, consumedLotIds + mennyiségek, outputYield?, confirmation, reversalOf? | **M2**; a nyers tételek csak itt fogynak főzéstől |
| PreparedFoodLot | preparedLotId, cookingEventId, meal/recipeRef?, portionsRemaining, location, confirmedAt | **M2**; nem ugyanaz, mint a nyers alapanyag |
| PersonalConsumption | profileId, recipe/mealRef?, servingCount, linkedPreparedLotId?, consent | **M2/M3**, személyes Food napló; csak engedéllyel |
| SourceEvidence | sourceType, sourceId?, capturedAt, sourceReliability, confidence? | **M2**; Pénzügy blokk, Food esemény, kézi igazolás |

**KÖTELEZŐ M1 adatmodell-felület:** legyen rekord- és eseményazonosító, stabil verzió, mennyiség-dimenzió, tárolási hely, keletkezés/megfigyelés időpontja, bizonyosság, forrás és egy bővíthető háztartás-azonosító. Az M2/M3 entitások típusait nem kell már most külön táblaként vagy UI-ként elkészíteni.

**Folyamatosan megkülönböztetendő:** élelmiszer-alapanyag ≠ márkás bolti termék ≠ konkrét készlettétel ≠ bevásárlási terv ≠ főzésből létrejött készétel ≠ személyesen naplózott elfogyasztott adag.

## 4. Egységek, mennyiségek, készletmegőrzés

### 4.1. KÖTELEZŐ M1 egységszabály

- Tömeg: **g** mint bázis, **dkg, kg** kontrollált átváltással. Térfogat: **ml** mint bázis, **dl, l** kontrollált átváltással.
- **Darab**, **csomag**, **adag**, **szelet** önálló dimenzió, amíg hiteles termékspecifikus átváltás nincs. „1 liter tej = 1000 gramm” nem általános igazság; sűrűséget ne találjunk ki.
- Beviteli/konverziós kerekítés ne hozzon létre elvesző vagy keletkező készletet. Válassz determinisztikus pontossági szabályt (javasolt egész bázis-mennyiség vagy egzakt skálázott egész szám), a tizedes maradékot kezelve. Egyszerű „lebegőpontos közel egyenlő” önmagában nem elegendő összeadáskor.
- Valós `0` mennyiség lehet megerősített kifogyás eredménye, de hiányzó szám, `null`, üres mező vagy `NaN` nem.
- Ismeretlen mennyiségű tétel létrehozásakor azt ne ábrázoljuk „0 g”-ként. Ha az M1 csak ismert mennyiséget tud készletként kezelni, jelöljük expliciten az adathiányt, ne fabrikáljunk mennyiséget.

### 4.2. Tároláselosztás

Kiválasztott meglévő tétel: **1 kg csirkemell**. Megerősített művelet után:
- hűtő: **600 g**,
- fagyasztó: **400 g**,
- összesen **1000 g**, nem 2000 g.

**KÖTELEZŐ M1:** a felület gyorsválasztókat és pontos értékbevitelt ad: „Mind hűtő”, „Fele-fele”, „Mind fagyasztó”, valamint 600/400 módosítás. Az előnézet nem ír adatot; a megerősítés **egyetlen atomikus változás**, így nem lehetséges köztes, részben elveszett/duplázott készlet. Forrás-lot részben vagy teljesen módosítható, és pontosan követhető, mely új lot(ok) keletkeztek.

Alapértelmezett tiltás: két inkompatibilis egység összeadása, mínuszérték, az eredeti készletnél nagyobb elosztás, zero-total duplikált lot. **Nem** szükséges először megosztani, ha csak egyszerű áthelyezés történik.

**KÖTELEZŐ M1:** a visszavonás ugyanarra a műveletre pontosan egyszer érvényesíthető, logikailag inverz módosítással; ha azóta az érintett lot változott, ne alkalmazz vak visszagörgetést — jelezz konfliktust, kérj biztonságos javítást.

**KÖTELEZŐ JÖVŐBELI:** tárolóhely-váltás nem bizonyít új vásárlást vagy elfogyasztást. Fagyasztás tényéhez legyen valódi jóváhagyás; fagyasztási/kiolvasztási időbélyeget ne következtessünk ki régi vásárlási blokkból.

## 5. Események: a Home igazi „könyvelése”

A cél nem napi leltározás, hanem egy **visszajátszható és követhető változássorozat**. Az eseménytörténet lehet M1-ben egyszerű, de ne úgy épüljön a rendszer, hogy később ne lehessen visszafejteni, honnan lett egy mennyiség.

| Esemény | Mikor keletkezik? | Készletváltozás? | Idempotencia |
| --- | --- | --- | --- |
| ItemAdded / StockCountConfirmed | Felhasználó megerősít egy valós mennyiséget | **Igen**, a megerősített értékig | Egy eventId csak egyszer |
| LotEdited / QuantityCorrected | Felhasználó korrigál | **Igen**, auditálva | Egyszer |
| StockSplit / StockMoved | Megerősített tároláselosztás | **Csak áthelyezés**, összesen változatlan | Egyszer |
| ItemDeleted / StockRemoved | Felhasználó eltávolítja/kidobja | **Igen**, naplózott okkal, ha ismert | Egyszer |
| ShoppingItemAdded / Checked | Vásárlási terv változik | **Nem** | Egyszer |
| PurchaseObserved | Bevásárlásra utaló blokk vagy jel | **Nem automatikusan** | sourceType + sourceId |
| PurchaseConfirmed / StockReceived | A felhasználó megerősíti a konkrét bekerülést | **Igen**, a konkrét tételeknél | Forrásazonosító + esemény |
| CookingPlanned / RecipeSaved | Recept megnyitás / mentés / menü | **Nem** | Egyszer |
| CookingConfirmed | Valóban elkészítve, jóváhagyott hozzávaló-mennyiség | **Igen**, nyers lot csökken; készétel-lot nő | Egyszer |
| MealLogged | Valaki személyesen fogyasztást naplóz | **Nem** nyers alapanyagra; készétel-lot csak külön megerősített kapcsolattal változik | Naplóforrásazonosító + személy |

**KÖTELEZŐ M1:** StockCount, LotEdited, StockSplit, Shopping* eseményeknek legyen stabil műveletazonosítójuk és visszavonási/szerkesztési történetük. Tényleges implementációként eseménynapló + materializált aktuális állapot, vagy egyenértékű tranzakciós rendszer elfogadható, ha mindkét rész atomikus és sérülés esetén helyreállítható.

**KÖTELEZŐ JÖVŐBELI:** ugyanarra a külső forrásra, vagy már jóváhagyott főzésre nem jöhet létre második készletváltozás pusztán újraimportálás, szinkronismétlés vagy dupla kattintás miatt. Az idempotenciakulcsot tartósan őrizzük, ne csak a jelenlegi böngészőmemóriában.

### 5.1. Parancs és esemény különválasztása

A gombnyomás vagy import **szándék/parancs**. A készletmódosító esemény csak sikeres ellenőrzés és felhasználói megerősítés után létezik. Hibás mentés esetén ne jelenjen meg „Sikeresen mentve”. Kettős kattintás/timeout/retry nem jelenthet kettős végrehajtást.

### 5.2. Visszavonás és törlés

- A megerősített művelet **visszavonó eseményt** kap, ne felejtsük el a forrását.
- A UI kínáljon egyértelmű „Visszavonás” lehetőséget legalább a legutóbbi kompatibilis készletmozgásnál.
- Ha az elosztott tételeket már részben felhasználták vagy áthelyezték, a visszavonás legyen blokkolt/konfliktusos, ne teremtsen készletet a semmiből.
- Személyes adat vagy napló törlése külön életciklus; későbbi többfelhasználós/törlés-politika nem igazolhatatlan „minden örökre megmarad” állítás.

## 6. Bevásárlás → készlet: végigkövethető forgatókönyvek

### 6.1. M1 — kézi alapfolyamat

1. Bevásárlólista: „Csirkemell, 1 kg” → **TERVEZETT**. Készlet nincs feltöltve.
2. „Megvettem” vagy lista kipipálva → ha csak listastátusz: **továbbra sem készlet**.
3. A felhasználó **külön** megerősíti a valóban bekerült 1 kg csirkemellet, amely új InventoryLot-ként jelenik meg a megadott helyen.
4. 600/400 elosztás előnézete → megerősítés → **600 g hűtő + 400 g fagyasztó**.
5. Téves mennyiség korrigálható és a módosítás egyértelműen visszavonható.

### 6.2. M2 — blokk / Pénzügy, külön engedéllyel

1. A Pénzügyben megjelenik egy OCR-rel olvasott blokk. A nyugta **vásárlási bizonyíték lehet**, de sem mennyisége, sem szövege nem feltétlenül megbízható; a Pénzügy-modul eredeti rekordja nem módosul.
2. A Home egy csak olvasható, felhasználó által engedélyezett adapteren kér **tételes** jelölteket: például „Tej 2 × 1 l”. Ha csak összeg, dátum vagy üzletnév ismert, **nem** lesz belőle élelmiszer-azonosítás.
3. Az OCR tételeket és egységeket előnézet mutatja: ismert termék vagy be nem azonosított sor, forrás és felismerési bizonytalanság.
4. A felhasználó kijavítja és megerősíti a Home-ba bekerülő élelmiszer/tároló-mennyiséget. A `receiptId + lineId` tartós idempotenciakulcs lehet; hiányzó sorazonosítónál biztonságos, stabil kulcsképzést kell tervezni — **nem** egyszerű „név+dátum” véletlenszerű deduplikációt.
5. Megerősítés után bekerül; ismételt import csak már feldolgozottként jelzi, **nem duplázza**. Az egyedi Food/Pénzügy projektek és profilok nem olvadnak össze.

### 6.3. M2 — „Vegyünk tejet?” javaslat

Példa: a Grapes látja, hogy korábban gyakran vásároltak tejet, de a friss készlet nem megerősített. Helyes mondat: **„Lehet, hogy hamarosan szükség lesz tejre”**, jelzés: **Becslés / ellenőrizendő**.

Gombok: „Elfogyott”, „Van még”, „Listához adom”, „Nem most”.
- „Elfogyott”: valós kifogyási tény csak az adott tételre/mennyiségre és explicit megerősítéssel; ismeretlen teljes állományt nem lehet 0-ra írni.
- „Van még”: készlet létezésének megerősítése lehet, de mennyiséget nem állít be automatikusan.
- „Listához adom”: bevásárlási **terv**, nincs készletváltozás.
- „Nem most”: elutasítás, nincs bűntudatkeltő vagy azonnal ismétlődő értesítés.

**Nem következtetünk Food-étkezésből automatikus otthoni tejfogyásra**, mert az lehet éttermi, munkahelyi, más családtag által vásárolt vagy importált adat.

## 7. Recept → főzés → készétel → elfogyasztás

### 7.1. Receptforrás

**KÖTELEZŐ JÖVŐBELI:** a Home **a meglévő Food receptgyűjteményét** használja. Nincs második független receptadatbázis, nincs rejtett receptklón, nincs új számított tápérték kitalált összetevőkből. Az ötfüles Food szerkesztő és a recept „Tápérték adagonként” közös összegző blokkja továbbra is külön Food-képernyő.

Az engedélyezett recipe-adapterből csak valóban meglévő név, hozzávaló, adaghozam, kép, előkészítési idő és tápérték olvasható. Ha idő/hozam/tápérték ismeretlen, azt így jelöljük; **nem írjuk be 30 percnek vagy 4 adagnak**.

### 7.2. M2/M3 „Mit főzzünk?” javaslat

- A Home megvizsgálja a Foodból hozzáférhető receptek hozzávalóit, és a készlethez **kompatibilis mértékegység és igazolt alapanyag-leképezés alapján** hasonlítja őket.
- Állapotok: **„Megerősített készlet alapján elkészíthető”**, **„Valószínűleg elkészíthető”**, **„Ellenőrizendő: …”**, **„Hiányzik: …”**; az utolsó státusz is csak megfelelően biztos hiányadatnál. A „Minden megvan” kifejezés csak friss és megbízható tényeknél engedhető meg.
- Rangsorolásnál **JAVASLAT**: először biztonságosan rendelkezésre álló összetevők és recepttel való egyezés, majd felhasználási időszerűség, a hiányzó hozzávalók száma, a választott célok, és csak ismert idő/hozam. **A pontos súlyok NYITOTTAK**, Codex ne nevezzen véletlenszerű pontszámot „AI-bizonyosságnak”.
- Látható „Miért ezt ajánlom?”: megnevezett, visszavezethető indok (például „a hűtőben lévő csirkemell felhasználása időszerű lehet”), de soha ne „biztosan fogyasztható” automatikus ígéret.
- Gombok: **„Recept megtekintése”** (meglévő Food nézet), **„Mentés a receptjeim közé”** (csak jogos és nem duplikáló Food mentéssel), később „Főzést indítok” / „Elkészítettem” (külön megerősítéssel).
- Receptmegnyitás, mentés vagy menütervezés **nem** készletlevonás.

### 7.3. Konkrét főzési példa

Kiinduló, megerősített készlet: **600 g hűtött csirkemell + 400 g fagyasztott csirkemell**. Egy recepthez 500 g csirkemell kell, és 4 adag készül.

1. A felhasználó megnyitja/menti a receptet → készlet **változatlan**.
2. Főzési előnézet: „500 g a hűtött tételből; 4 adag készétel” → még **semmi nem csökken**.
3. „Elkészítettem” (megerősített főzési esemény, idempotens) → hűtőben **100 g nyers**, fagyasztóban **400 g nyers** marad; külön **4 adag készétel** keletkezhet.
4. A felhasználó 1 adagot elfogyaszt és a saját Food-profiljába naplóz → a személyes Food **1 adag** fogyasztást rögzít, a nyers csirkemellből **nem csökkent még 500 g**.
5. Ha a személy explicit összekapcsolja az elfogyasztott adagot az otthoni készétel-lottal, akkor a készétel 4 → **3 adag**, **de** a nyers tételt ekkor már nem érintjük.
6. A Food napló utólagos törlése/visszavonása **nem** állítja vissza automatikusan a nyers 500 g-ot; az önálló főzési esemény külön, megfelelő feltételekkel javítható.

**A főzés és az étkezés külön esemény.** Ez a szabály minden későbbi adatszinkronnál elsőbbséget élvez.

### 7.4. Megosztott főzés több személy számára

A háztartás egy közös főzési eseményt tart nyilván. A személyes Food naplóba **minden profil külön, engedélyezett akcióval** adhatja át a saját adagját (például 1 adag a 4-ből), és a jogosultság/adag-eltérés látható. Sem egy közös családi recept, sem a főzés ténye nem bizonyítja, hogy minden családtag fogyasztott.

## 8. Lejárat, fagyasztás, élelmiszerbiztonság

**KÖTELEZŐ M1:** külön rögzíthető a tényleges címkéről/használati adatból származó
- **fogyaszthatósági idő** (use by),
- **minőségmegőrzési idő** (best before),
- és később külön a **becsült felhasználási prioritás**.

Ne legyen egyetlen univerzális „lejárt = romlott” címke. A hiányzó dátum **ismeretlen**, nem mai dátum vagy tetszőleges 7 nap.

**KÖTELEZŐ JÖVŐBELI:** fagyasztás / kiolvasztás / felbontás ténylegesen jelölt események; az ebből adódó, forrás nélküli tárolhatósági jóslat nem bizonyítja a biztonságos fogyaszthatóságot. Nem adunk olyan tanácsot, hogy egy kockázatos, kétséges frissességű ételt feltétlenül fogyasszanak el. A használati prioritás nem helyettesíti a csomagolás előírásait, a megfelelő hőmérsékletet és a józan élelmiszerbiztonsági ellenőrzést.

Megjelenítési szöveg: „Érdemes ellenőrizni”, „Dátum megadva: …”, „Becsült prioritás”; nem „Biztosan jó még 3 napig”.

## 9. Bizonytalanság és idő — állapotgép

**KÖTELEZŐ M1:** tároljuk `observedAt`, `updatedAt`, `sourceType`, `evidenceStatus` és a legutóbbi igazolás azonosítóját, hogy később meg lehessen állapítani egy adat életkorát. Az M1 kézzel megerősített készletét ne degradáljuk láthatatlanul automatikus időalapú számítással.

**KÖTELEZŐ JÖVŐBELI:** javasolt bizalmi időmodell:

- **Friss, megerősített:** utolsó pontos megfigyelés után és hitelesített eseményekkel követve.
- **Elavult megerősített:** a korábbi tény megmarad, de a jelenlegi készletbizonyosság csökken; utolsó ismert értékként megjelenhet, megfelelő figyelmeztetéssel.
- **Becsült:** fogyásról/szükségletről valószínűsítés; nem írja felül a megerősített készletet.
- **Ismeretlen:** nincs hiteles megfigyelés vagy az adat túl hiányos az adott döntéshez.

**A lejárási/időküszöb termékenként és eseménytípusonként eltérhet; pontos napok és valószínűségi százalékok NYITOTTAK.** Ne vezess be tetszőleges „7 nap után biztosan elfogyott” szabályt. Az alkalmazás magyarázza, milyen forrásokból milyen következtetésre jutott.

**Minta:** egy tejvásárlás két hete biztosan megtörtént; ma tejmennyiség nincs megerősítve. Helyes: „Tej: utolsó vásárlás két hete, otthoni készlet ellenőrizendő”, nem „Tej: 2 liter biztosan van”.

## 10. Kevés interakció, kérdés csak szükség esetén

- A Home **nem kér kötelező napi készletellenőrzést**. Felesleges játékos sorozatok, büntetés, gyűjtögetési kényszer és indokolatlan push értesítések tiltottak.
- Egy döntést segítő időpontban kérdezhet: receptválasztás, bevásárlólista-összeállítás, főzés, tényleges készleteltérés korrekciója.
- Egyérintéses pozitív/negatív lehetőségek, szükség esetén „Pontosítás” / „Később”; a számokhoz legyen opcionális részletes szerkesztés.
- Elutasítás után ne kérdezze ugyanazt rögtön újra. **A pontos emlékeztetési ütemezés NYITOTT**, javasolható későbbi review-ra. Felhasználó képes legyen kikapcsolni a javaslatokat.
- Nincs megalapozatlan személyes következtetés egészségi célból vagy pénzügyi helyzetből. A Food egyéni céljai és személyes adatai nem válnak közös háztartási adattá.

## 11. Jogosultságok, család, offline és szinkron — előkészítés, nem ígéret

**M1:** helyi, önálló Home-adatbázis; UI: „Ezen az eszközön tárolva”. A felhasználó manuálisan kezelhet közösnek szánt ételt, de nincs valódi többkészülékes, biztonságos családi megosztás.

**M2/M3 jövőbeli jogosultsági alapok (KÖTELEZŐ JÖVŐBELI):**
- Household tagság és szerepkörök (tulajdonos, szerkesztő, megtekintő például, végleges szereplistára külön döntés).
- Közös Home-készletadatok csak megfelelő jogosultsággal; **személyes Food, egészség- és pénzügyi rekordok külön, alapértelmezetten privát**.
- Személyes naplóátvételhez célprofil explicit hozzájárulása és adag megerősítése. A háztartásba belépés nem teljes profil-hozzáférés.
- A tárolásbackend (Drive, Supabase vagy más) **NYITOTT**; nem integrálható hallgatólagosan a jelenlegi rendszerbe. Nincs nyers token a repóban / kliensoldali kódban.
- Offline parancsok, konkurens változtatások és szinkronütközések feloldása esemény-azonosítóval és revízióval; nem „utolsó írás felülír mindent” személyes adatvesztéssel.
- Egy családtag törlése, szerepkörváltozás, megszűnő jogosultság, exportálás és helyreállítás külön adatvédelmi elfogadást igényel.

## 12. Perzisztencia / integritás / migráció

**KÖTELEZŐ M1:**
- Namespaced Home tárolás, saját schemaVersion, householdId, revision és eventId. Nem írunk Food/Finance/Water/Drive meglévő kulcsaira.
- Megkezdett tároláskor csak teljes, valid rekord-együttes legyen sikeres (inventory + shopping + esemény és idempotenciakulcs együtt); részleges sérült állapot után ne jelentse, hogy sikerült.
- Olvasáskor érvénytelen JSON, nem támogatott verzió, negatív mennyiség, hiányzó ID, ismétlődő eventId vagy össze nem egyeztethető egység esetén ne írja felül automatikusan a hibás állományt üresre: hibát jelezzen és őrizze meg a helyreállítható eredetit.
- Nem elég a `setItem` hiba nélküli visszatérése annak bizonyítására, hogy Androidon valódi exportfájl keletkezett; ezt csak natív mentésválasztós vagy megfelelően ellenőrzött exporttal állítsuk.
- **JAVASLAT:** write-ahead / staged snapshot + ellenőrzött visszaolvasás, revíziós újratöltés, testekben hibainjektálás; pontos fizikai mechanizmust Codex választhat, az adatvesztés-tilalom viszont kötelező.
- Törlés/alkalmazás újratelepítés nem kezelhető úgy, mintha biztosan volna backup; még nincs Home cloud sync vagy garantált helyreállítás.
- Későbbi backend-migráció külön, adatbázis-szintű és családi jogosultsági review.

## 13. Konkrét tesztforgatókönyvek (M1 unit + későbbi integrációk)

| ID | Történet | Elvárt kimenet | Ütem |
| --- | --- | --- | --- |
| H-01 | Új listaelem: „Csirkemell, 1 kg” | TERVEZETT, készlet változatlan | M1 |
| H-02 | Listaelem kipipálása | Készlet változatlan | M1 |
| H-03 | Megerősített készletbevételezés 1 kg | Egyetlen 1000 g-os lot, naplózott esemény | M1 |
| H-04 | 1000 g megosztása 600/400 arányra | Megerősítésig nincs írás; utána pontosan 1000 g | M1 |
| H-05 | Split duplán kattintva / hálózati újrapróbálkozás | Nem lesz 2000 g vagy két esemény | M1 |
| H-06 | Fél-fél, minden hűtő, minden fagyasztó | Bázisegység szerinti összeg változatlan | M1 |
| H-07 | Split negatív, NaN, inkompatibilis darab→kg | Blokkolt, állapot változatlan, érthető hiba | M1 |
| H-08 | Split visszavonása, majd ismételt undo | Legfeljebb egyszer; utólagos módosításnál konfliktus | M1 |
| H-09 | Mentés után újraindítás | Ugyanaz az adat, bizonyosság, revízió és listastátusz | M1 |
| H-10 | Sérült JSON vagy sikertelen írás | Nincs csendes üresítés / sikeresnek mondott mentés | M1 |
| H-11 | Hiányzó mennyiség | Nem lesz 0 g / 0 ml | M1 |
| H-12 | Friss termék, nincs lejárati dátum | „Ismeretlen”, nincs kitalált lejárat | M1 |
| H-13 | OCR blokk, csak végösszeggel | Nincs automatikus élelmiszer-készlet | M2 |
| H-14 | Ugyanazon blokk ugyanazon sora kétszer importálva | Egy megerősített bevételezésnél többször nincs levonás/hozzáadás | M2 |
| H-15 | Food ételnaplóban 1 adag csirkés tészta | Nem vonunk nyers készletet puszta étkezésből | M2 |
| H-16 | 600+400 g csirke, főzésnél 500 g | 100 g hűtő + 400 g fagyasztó, 4 adag készétel | M2 |
| H-17 | Ebből 1 adag saját Food naplóba kerül | 3 adag készétel csak megerősített hozzárendelés esetén; nyers mennyiség változatlan | M2 |
| H-18 | Recept csak megnyitva vagy mentve | Nincs készletmozgás | M2 |
| H-19 | Receptanyag nincs beazonosítva vagy hiányos | „Ellenőrizendő”, nem „Minden megvan” | M2 |
| H-20 | Családtag másik profilja étkezik | Saját naplóhoz külön engedély/adag; nincs automatikus megosztás | M3 |
| H-21 | Két eszköz ugyanazt az eseményt szinkronizálja | Idempotencia és konfliktuskezelés; készlet nem duplázódik | M3 |
| H-22 | Ismeretlen/múltbeli tejvásárlás alapján ajánlás | Becsült készlethiányt jelez, nem állít jelenlegi tényt | M2/M3 |

**M1 tesztek H-01–H-12 kötelezőek.** H-13–H-22 a jövőbeli adapterek szerződéses regressziós esetei, még nem működő funkciók. Minden képernyő 320/360/390/412 px, hosszú magyar név, billentyűzet, Android safe-area, offline és akadálymentesség tekintetében ellenőrzendő.

## 14. Implementációs döntéskapuk Codexnek

**MOST LEHET:** Home lokális elérési pont, saját változásnapló és snapshot, készletlot CRUD, elosztás, tárolási hely, bevásárlólista, kitöltetlen/hibás állapot, UI és M1 tesztek. Minden átmenet legyen tranzakciós, idempotens és visszavonható, amennyiben a szerződés szerint helyreállítható.

**MOST NEM LEHET:**
- automatikus blokkfeldolgozásból készletírás,
- személyes Food-napló vagy receptek módosítása,
- automatikus alapanyaglevonás étkezési napló alapján,
- kitalált készlet, ismeretlen mértékegység vagy lejárat automatikus megerősítése,
- családi szinkron vagy személyes profilmegosztás,
- Home miatt meglévő kezdőlap / Food felépítésének átalakítása,
- éles Android release, TEST merge, Supabase vagy Drive-integráció jóváhagyás nélkül.

**NYITOTT, külön UX/termék review kell hozzá:** tényleges családi jogosultságmodell; képzetlen termékazonosítás megbízhatósági küszöbei; megengedett háttérértesítési gyakoriság; felhasználási időszerűség termékenként; ajánlási pontszám súlyai; „Mit főzzünk?” teljes UI-flow; backend és migráció; áramellátás nélküli többeszközös konfliktusfeloldás.

## 15. Készre jelentés feltétele

Codex az M1-et csak akkor nevezheti megvalósítottnak, ha a H-01–H-12 ellenőrzésekhez tényleges tesztbizonyíték tartozik, a mobil UI használható, a tárolás hibakezelése működik, és a jelenlegi Food/Finance rendszer regresszióját ellenőrizte. A dokumentum létrehozása **nem** indít automatikusan Codex-futtatást, nem buildel APK-t és nem engedélyez merge-et.

**Egy mondatban:** a Home előbb a bizonyított változásokat kezelje biztonságosan, csak azután következtessen — és soha ne alakítsa a felhasználó terveit vagy becsléseit észrevétlenül ténnyé.
