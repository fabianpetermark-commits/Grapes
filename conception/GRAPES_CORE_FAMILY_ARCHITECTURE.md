# Grapes Core & Family – közös platform- és jogosultsági architektúra

**Verzió:** 1.0 – tervezési specifikáció  
**Dátum:** 2026-11-08  
**Státusz:** javasolt architekturális irány; felülvizsgálatra és jóváhagyásra vár  
**Hatókör:** termék- és architekturális alapelvek, domainhatárok, adatmegosztás, jogosultságok, offline működés, UI-konzisztencia és bevezetési elvek.

> **Fontos:** ez a dokumentum nem állítja, hogy az itt leírt architektúra vagy funkciók már megvalósultak. Nem engedélyez automatikus adatbázis-migrációt, kódátalakítást vagy élesítést. A tényleges implementációs állapotot a kódbázis, a migrációk, a tesztek és a TEST/PROD környezetek külön auditjával kell megállapítani.

## 1. Vezetői összefoglaló

A Grapes elsődleges termékstratégiája egyetlen, egységes Grapes alkalmazás, amelyen belül a funkcionális területek szigorúan elkülönített modulokként működnek. A modulok saját üzleti felelősséggel, adatmodellel és felhasználói folyamattal rendelkeznek, miközben közös platformképességeket használnak. Külön alkalmazás kiadása nem induló cél; csak későbbi, bizonyított termék-, biztonsági vagy üzemeltetési indok alapján vizsgálható.

A javasolt alapmodell:

- **Modular Monolith** mint elsődleges architekturális forma: egy közösen kiadható és üzemeltethető rendszer, világos modulhatárokkal és belső szerződésekkel.
- **Domain-Driven Design (DDD)** a felelősségek, domainmodellek és integrációs határok kialakításához.
- **Grapes Core** a közös identitás-, háztartás-, konfigurációs és platformképességek számára.
- **Family Capability** mint alkalmazásokon és modulokon átívelő képességcsomag, nem önálló Family alkalmazás.
- **Központi Authorization és Sharing szolgáltatás**, amely egységes szabályok szerint értékeli az erőforrás-hozzáférést, miközben az üzleti döntések a tulajdonos moduloknál maradnak.
- **Egységes Grapes Design System**, közös vizuális és interakciós alapokkal, visszafogott modulspecifikus akcentusokkal.
- **Offline-first, de szerver által hitelesített jogosultságkezelés**: a helyi adatbázis gyorsítótár és offline munkatér, nem a hozzáférési igazság végső forrása.

A cél nem egy minden lehetséges jövőbeli esetet előre kezelő általános keretrendszer. A cél a jelenlegi termékigényeket lefedő, tesztelhető és fokozatosan bővíthető alap.

## 2. Kapcsolat a meglévő koncepciókkal

Ez a dokumentum a következő meglévő dokumentumokkal együtt értelmezendő:

- [ARCHITECTURE.md](./ARCHITECTURE.md) – közös architektúra és modulkapcsolatok.
- [GRAPES_MODULAR_ECOSYSTEM.md](./GRAPES_MODULAR_ECOSYSTEM.md) – alkalmazások és funkcionális határaik.
- [GRAPES_HOME.md](./GRAPES_HOME.md) – háztartási és családi központ.
- [GRAPES_AI_ADVISOR.md](./GRAPES_AI_ADVISOR.md) – modulokon átívelő ajánlórendszer.

Ez a dokumentum **pontosítja és részletezi** a közös platform, Family, jogosultság és UI architekturális elveit. Nem írja felül a meglévő modulok termékhatárait, és nem módosítja a Finance, Home, LifeHub, Books, Design vagy más modulok elfogadott üzleti működését.

A dokumentumok közötti esetleges ellentmondást felülvizsgálat során kell feloldani; implementáció előtt egyértelmű, jóváhagyott döntés szükséges.

## 3. Alapvető architekturális döntések

### 3.1 Modular Monolith az elsődleges kiindulópont

A Grapes elsődlegesen moduláris monolitként épüljön, ne korai mikroszolgáltatás-rendszerként.

Ennek következményei:

- A modulok külön domainfelelősséggel és jól meghatározott belső interfészekkel rendelkeznek.
- Egy modul nem férhet hozzá közvetlenül egy másik modul belső adattábláihoz vagy privát üzleti logikájához.
- A modulok közötti kommunikáció dokumentált alkalmazási szolgáltatásokon, domain-eseményeken vagy verziózott szerződéseken keresztül történik.
- A közös adatbázis használata önmagában nem jelent közös domain-tulajdonjogot.
- A közös telepítés és kiadás egyszerűsíti a tranzakciókat, tesztelést és üzemeltetést.
- Későbbi önálló alkalmazássá vagy szolgáltatássá választás csak valós skálázási, biztonsági, üzemeltetési vagy termékigény alapján történjen.

A Modular Monolith nem jelent korlátlan közös kódbázist. A modulhatárokat automatizált tesztekkel és kódszerkezeti szabályokkal is védeni kell.

### 3.2 DDD és domainhatárok

A modulok üzleti adatainak elsődleges gazdája az a domain, amelynek a feladata az adott adat létrehozása, validálása és módosítása.

Példák:

- Food/LifeHub: étkezési napló, receptek, tápértékek és étkezéstervezés.
- Home: háztartási készlet, bevásárlólista és háztartási működés.
- Garage: járművek és karbantartási előzmények.
- Vault: dokumentumok és dokumentum-metaadatok.
- Finance: pénzügyi nyilvántartás és pénzügyi műveletek.
- Core: identitás, háztartási tagság, platformszintű jogosultság- és megosztási képességek.

Egy másik modul csak a szükséges adatot és műveletet érheti el a tulajdonos modul által közzétett szerződésen keresztül. A modulok ne írják közvetlenül egymás domainadatait.

### 3.3 Family nem önálló alkalmazás

A Family nem különálló app és nem egy újabb adatgyűjtő modul.

A Family a Grapes közös, keresztfunkcionális képességeinek neve: háztartási kontextus, tagkapcsolatok, megosztási folyamatok, családi szerepkörök és az ezekhez tartozó felhasználói felületi elemek.

A Family képességei ott jelenjenek meg, ahol a felhasználó ténylegesen használja őket:

- Home: közös háztartási lista, készlet és feladatok.
- Food/LifeHub: megosztott étkezési terv vagy családi menü, a személyes napló elkülönítésével.
- Garage: közösen használt jármű vagy kiosztott karbantartási feladat.
- Vault: kifejezetten megosztott családi dokumentum.
- Naptár/értesítések: megosztott események és emlékeztetők.

A családi tagság nem ad automatikus hozzáférést a tagok összes személyes adatához.

## 4. Grapes Core és a közös képességek

A Grapes Core a közös platformszolgáltatások gyűjtőrétege. Nem válhat minden üzleti logika központi helyévé.

### 4.1 Javasolt felelősségi területek

| Terület | Felelősség |
|---|---|
| Identity | Felhasználó-azonosítás, fiók és hitelesítési kapcsolat |
| Profile | Felhasználói profil és platformszintű beállítások |
| Household | Háztartások, tagságok, meghívások és tagsági szerepek |
| Authorization | Hozzáférési döntések és engedélyek egységes értékelése |
| Sharing | Erőforrások megosztása, megosztási életciklus és visszavonás |
| Sync | Eszközök közötti adat- és változásszinkronizáció |
| Notifications | Egységes értesítési kézbesítés és preferenciák |
| Audit | Kritikus biztonsági és jogosultsági események minimális, védett naplózása |
| Design System | Közös komponensek, tokenek és interakciós szabályok |

Ezek logikai felelősségek. Nem követelmény, hogy mindegyik külön adatbázisba, futó szolgáltatásba vagy deployolható egységbe kerüljön.

### 4.2 Household modell

A Household a közös háztartási kontextus. A felhasználó egy vagy több háztartáshoz tartozhat, ha ezt a termék szabályai lehetővé teszik. Az egy háztartásra korlátozó szabályt nem szabad véletlenül az adatmodellbe kódolni, ha a termékdöntés még nem zárta le.

A háztartási tagság és a személyes profil két külön fogalom.

Javasolt logikai entitások:

- **Household:** azonosító, név, létrehozás és életciklus-állapot.
- **HouseholdMembership:** household, user, szerepkör, tagsági állapot, csatlakozás és kilépés időpontja.
- **HouseholdInvitation:** meghívó, célzott címzett vagy meghívási mód, lejárat, állapot és létrehozó.
- **HouseholdPolicy:** háztartási szintű, explicit termékbeállítások, ahol szükséges.

A tagság állapota ne csak a rekord létezéséből legyen kikövetkeztethető. A meghívott, aktív, felfüggesztett és kilépett állapotok kezelése legyen egyértelmű.

A háztartás törlése ne okozzon automatikus, visszafordíthatatlan törlést a tagok személyes domainadataiban. A tagság, megosztások és háztartási erőforrások életciklusát külön kell kezelni.

### 4.3 Háztartási szerepkörök

Kiinduló szerepkörök:

| Szerep | Háztartási felelősség |
|---|---|
| OWNER | Háztartás alapvető kezelése, tulajdonosi műveletek és adminisztrátorok kinevezése |
| ADMIN | Meghívások és tagság kezelése a ráruházott határok között |
| MEMBER | Normál háztartási tagság és engedélyezett közös műveletek |
| RESTRICTED | Korlátozott háztartási élmény, csak kifejezetten engedélyezett funkciók |

Ezek a szerepek a háztartás kezelésére vonatkoznak. **Nem jelentenek automatikus hozzáférést minden erőforráshoz vagy érzékeny adathoz.**

Az ADMIN nem válik automatikusan a tagok személyes Health, Food, Finance vagy Vault adatainak olvasójává. A RESTRICTED szerepkör önmagában nem teljes gyermekvédelmi vagy gondviselői modell; a gyermekfiókok, életkorhoz kötött korlátozások és gondviselői jogok külön termék- és jogi felülvizsgálatot igényelnek.

## 5. Erőforrás-tulajdonjog, láthatóság és engedélyek

### 5.1 Az adat tulajdonosa és létrehozója különbözhet

A `created_by_user_id` csak azt jelöli, ki hozta létre a rekordot. Nem feltétlenül jelenti azt, hogy a létrehozó a jelenlegi tulajdonos vagy az egyetlen jogosult kezelő.

A domainnek kell meghatároznia, hogy egy entitás:

- személyes tulajdonú;
- háztartási tulajdonú vagy közös kontextusú;
- más személy által kezelt, de megosztott;
- külső forrásból származó vagy importált adat.

Nem kötelező minden modul minden táblájába univerzális `owner_user_id` mezőt tenni. A tulajdonjog jelentése domainenként eltérhet. A közös jogosultsági réteg számára viszont egyértelmű, dokumentált erőforrás-azonosítási és tulajdonosi szerződés szükséges.

### 5.2 Láthatóság és műveleti jogosultság különválasztása

A láthatóság azt határozza meg, hogy milyen körben lehet az erőforrás hozzáférhető. Az engedély azt határozza meg, hogy az adott jogosult mit tehet vele.

Javasolt kiinduló láthatósági szintek:

- **PRIVATE:** csak a tulajdonos és az explicit módon felhatalmazott rendszerszereplők férhetnek hozzá.
- **HOUSEHOLD:** az adott háztartás megfelelő tagsággal rendelkező tagjai számára elérhető, de csak az erőforrásra vonatkozó engedélyek szerint.
- **EXPLICIT:** csak a konkrétan megnevezett felhasználók vagy háztartások férhetnek hozzá.

A láthatósági szint nem helyettesíti a jogosultságellenőrzést. A HOUSEHOLD láthatóság sem jelenti automatikusan, hogy minden tag szerkeszthet.

Javasolt műveleti engedélyek:

- VIEW – olvasás.
- CREATE – új kapcsolódó elem létrehozása, ha az adott domainben értelmezett.
- EDIT – módosítás.
- DELETE – törlés vagy archiválás.
- SHARE – további megosztás kezelése.
- ADMIN – az adott erőforrás megosztási és jogosultsági beállításainak kezelése.

A tényleges engedélyek modulspecifikusak lehetnek. A fenti lista nem követelmény arra, hogy minden modul minden műveletet támogasson.

### 5.3 Hibrid RBAC + ACL modell

A jogosultsági döntés több információt használhat:

1. hitelesített felhasználó és fiókállapot;
2. háztartási tagság és háztartási szerepkör;
3. erőforrás tulajdonosi és láthatósági szabályai;
4. erőforrásra vagy célcsoportra adott explicit engedély;
5. domain-specifikus korlátozások;
6. aktuális megosztási és visszavonási állapot.

A RBAC a háztartási és platformszerepek alapját adja. Az ACL a konkrét erőforrásokhoz és címzettekhez kapcsolódó finomhangolást biztosítja.

A döntés legyen **alapértelmezetten tiltó**: ha a jogosultság nem állapítható meg egyértelműen, a hozzáférés nem engedélyezhető.

### 5.4 Megosztási modell és referenciális integritás

A megosztásnak támogatnia kell:
- felhasználóval történő megosztást;
- háztartással történő megosztást;
- engedélyszint megadását;
- lejáratot vagy visszavonást, ha releváns;
- megosztó és létrehozási idő rögzítését;
- auditálható jogosultságváltozást.

A következő jellegű általános kapcsolat önmagában nem elégséges integritási garancia:

```sql
resource_type VARCHAR(50),
resource_id UUID
```

Egy ilyen polimorfikus hivatkozásra az adatbázis rendszerint nem tud hagyományos idegen kulcsot érvényesíteni minden lehetséges modultáblára. Ezért a megosztási rekord árván maradhat, ha a cél-erőforrást törlik.

Lehetséges megoldások, amelyeket a részletes technikai tervezés során kell összevetni:

- közös, stabil Resource Registry, amely a domain-erőforrások külső azonosítóit és típusát regisztrálja;
- modulonkénti, típusos megosztási kapcsolótáblák;
- központi Share-grant táblák domain által garantált tranzakciós törlési és archiválási szerződésekkel.

A választásnál az adatbázis-integritás, a lekérdezhetőség, a migrálhatóság és a modularitás egyensúlya a döntő. Nem szabad pusztán kényelmi okból gyenge referenciális integritást választani.

A megosztási rekordok létrehozása, módosítása és visszavonása ellenőrzött alkalmazási műveleten keresztül történjen, ne tetszőleges kliensoldali adatbázis-írással.

## 6. Jogosultsági döntés és adatbázis-védelem

### 6.1 Szerveroldali ellenőrzés

A szerveroldali jogosultságellenőrzés kötelező. A kliensoldali UI-elrejtés vagy SQLite-szűrés önmagában nem biztonsági határ.

PostgreSQL esetén a Row-Level Security (RLS) megfelelő eszköz lehet a rekordokhoz való hozzáférés korlátozására. Az RLS-szabályoknak a tényleges üzleti jogosultságot kell kifejezniük, és tesztekkel kell igazolni őket.

A RLS nem helyettesíti:
- a hitelesítést;
- a biztonságos szolgáltatási réteget;
- az engedélyezett mezők és műveletek ellenőrzését;
- a fájltároló és objektumhozzáférések védelmét;
- a szolgáltatói/adminisztrátori jogosultságok korlátozását.

A jogosultsági ellenőrzés ne bízzon meg a kliens által küldött `user_id`, `role`, `household_id` vagy `visibility` értékben. Ezeket a szerver a hitelesített kontextusból és ellenőrzött adatból határozza meg.

### 6.2 Helyi SQLite / Room

A helyi adatbázisban ugyanazt a felhasználói élményt és lehetőség szerint azonos hozzáférési szabályokat kell leképezni, de a helyi szűrés nem adhat szerveroldali jogosultságot.

A helyi adatmodellnek kezelnie kell:
- az aktuális fiókot és aktív háztartási kontextust;
- a szinkronizált megosztási állapotot;
- a jogosultság verzióját vagy frissítési állapotát;
- a függőben lévő offline módosításokat;
- a visszavont vagy már nem elérhető rekordokat.

A helyi gyorsítótár csak olyan adatot tároljon, amelyre az adott eszköznek és felhasználónak szüksége van.

### 6.3 Hozzáférés-visszavonás

A megosztás visszavonása után:
- a szerver a következő kéréstől tagadja meg a hozzáférést;
- a szinkronizáció továbbítsa a visszavonási állapotot az eszközökre;
- a kliens jelölje elérhetetlennek, majd a szabályok szerint törölje vagy ürítse a helyi gyorsítótárból az érintett adatot;
- a függőben lévő offline módosításokat a szerver újraértékelje, és szükség esetén elutasítsa;
- a visszavonás és a kapcsolódó állapotváltozás naplózható legyen.

Fontos korlát: egy hosszabb ideig offline eszközön a visszavonás nem érvényesíthető azonnal. A már letöltött vagy a felhasználó által exportált adatok technikailag nem hívhatók vissza biztosan. Ezt a terméknek és a biztonsági dokumentációnak őszintén kezelnie kell. Érzékeny adatoknál korlátozott offline tárolás, helyi titkosítás és újrahitelesítés lehet indokolt.

## 7. Offline-first és szinkronizáció

### 7.1 Alapelv

Az offline működés a felhasználó számára fontos képesség, de nem írhatja felül a szerveroldali jogosultságot.

- A helyi adatbázis az eszközön elérhető, engedélyezett adatok gyorsítótára és offline munkatere.
- Az offline módosítások függőben lévő műveletekként kerülnek sorba.
- Visszakapcsolódáskor a szerver újra ellenőrzi a felhasználót, a tagságot, a jogosultságot és az üzleti szabályokat.
- A már visszavont jogosultsággal létrejött offline művelet nem fogadható el automatikusan.
- A konfliktuskezelés domainenként eltérhet; nem minden adatnál helyes a „last write wins”.

### 7.2 Szinkronizációs minimumkövetelmények

- stabil rekordazonosítók;
- monoton vagy egyértelmű változásverziók;
- idempotens szinkronműveletek;
- konfliktusfelismerés és dokumentált feloldási szabály;
- törlési jelölők vagy változásnapló, hogy a törlés más eszközre is eljusson;
- jogosultság- és tagságváltozás szinkronizálása;
- újrapróbálható, de duplikációt nem okozó műveletek;
- hibás vagy elutasított offline műveletek felhasználó számára érthető kezelése.

### 7.3 Offline érzékeny adatok

A Health, Finance és Vault jellegű adatoknál külön kell meghatározni:
- letölthető-e az adat offline használatra;
- milyen ideig maradhat a helyi tárolóban;
- milyen eszközbiztonsági feltétel szükséges;
- hogyan történik a helyi titkosítás és kulcskezelés;
- mi történik kijelentkezéskor, fiókváltáskor vagy hozzáférés-visszavonáskor.

## 8. Vault és végpontok közötti titkosítás

A Vault dokumentumai érzékeny adatokat tartalmazhatnak, ezért a végpontok közötti titkosítás (E2EE) külön biztonsági tervezést igényel.

A megosztott dokumentum szimmetrikus kulcsának címzett nyilvános kulcsával történő becsomagolása lehetséges kriptográfiai minta, de önmagában nem teljes kulcskezelési rendszer.

Az E2EE megvalósítás előtt külön terv szükséges legalább az alábbiakra:
- felhasználói és eszközidentitások;
- kulcsgenerálás és biztonságos tárolás;
- eszköz hozzáadása és eltávolítása;
- kulcsrotáció és kompromittálódás;
- megosztás visszavonása;
- elveszett eszköz és fiók-helyreállítás;
- családi tagság megszűnése;
- titkosított biztonsági mentés és visszaállítás;
- metaadatok és fájlnevek adatvédelme.

A megosztás visszavonása nem teszi olvashatatlanná a korábban letöltött, már visszafejtett másolatot. A jövőbeli kulcsrotáció és hozzáféréskorlátozás csökkentheti a további hozzáférést, de nem garantálhatja a korábban megszerzett adatok visszavételét.

**Döntés:** a Vault E2EE külön biztonsági projekt. Nem a Family Core első implementációs fázisának kötelező része.

## 9. Közös Design System és moduláris felhasználói élmény

### 9.1 Közös vizuális alap

A Grapes felhasználó minden modulban ugyanannak a termékcsaládnak az élményét kapja.

Közös elemek:
- tipográfiai skála és betűhasználat;
- térköz- és elrendezési rendszer;
- alapvető színtokenek;
- kártyák, mezők, gombok, dialógusok és navigáció;
- ikonhasználat és interakciós állapotok;
- fókusz, kontraszt és hozzáférhetőségi szabályok;
- Family megosztási jelzések, avatarok és jogosultsági felületek.

A meglévő, elfogadott Grapes arculati alap – sötét felület és visszafogott neon-cyan kiemelések – maradjon az elsődleges vizuális identitás. A modulok nem hozhatnak létre egymástól független tipográfiai vagy navigációs rendszert.

### 9.2 Modulspecifikus tematikus tokenek

A modulok finom, szemantikus akcentusokat kaphatnak, de ezek nem írhatják felül a közös komponenstokeneket.

Példák:
- Food: étkezési és tápanyagadatokhoz illeszkedő másodlagos akcentusok.
- Garage: műszaki állapotokhoz és karbantartási indikátorokhoz illeszkedő akcentusok.
- Vault: biztonsági és dokumentumállapotokhoz illeszkedő akcentusok.

A színek jelentése legyen konzisztens. A hibát, figyelmeztetést, sikert és semleges állapotot ne definiálja újra minden modul.

### 9.3 Family kontextusjelzések

Ha egy rekord vagy művelet családi megosztásban van, minden modul ugyanazt a vizuális jelölési rendszert használja.

Példák:
- megosztott állapot jelvénye;
- megosztott háztartás vagy címzett avatarja;
- hozzáférési szint rövid jelzése;
- megosztási részletek és visszavonás közös mintája.

A jelvény önmagában nem jogosultsági bizonyíték. A tényleges hozzáférést mindig a szerver és a jogosultsági szolgáltatás ellenőrzi.

### 9.4 Egy alkalmazás vagy több alkalmazás

A jelenlegi, jóváhagyott termékstratégia szerint a Grapes egyetlen Android-alkalmazásként indul és működik, közös belépéssel, munkamenet-kezeléssel, helyi adattárolási és szinkronizációs infrastruktúrával, valamint egységes navigációval. A funkcionális modulok Gradle multi-module felépítésben, világos API- és domainhatárokkal különülnek el.

A több különálló alkalmazás kiadása jelenleg nem cél. Csak akkor vizsgálható újra, ha egy modul önálló piaci igényt és üzleti modellt igazol, eltérő célcsoportot szolgál ki, vagy valós biztonsági/üzemeltetési követelmény teszi indokolttá. A moduláris kódstruktúra megkönnyítheti a későbbi leválasztást, de nem garantálja annak automatikus vagy költségmentes megvalósíthatóságát.

Nem cél az sem, hogy egyetlen képernyőre minden funkciót bezsúfoljunk.

## 10. Biztonság, adatvédelem és audit

Alapelvek:

1. Alapértelmezett tiltás, ha nincs egyértelmű engedély.
2. Személyes adatok alapértelmezett privát kezelése.
3. Legkisebb szükséges jogosultság (least privilege).
4. Szerveroldali ellenőrzés minden védett műveletnél.
5. A kliens által küldött szerep- vagy tulajdonosi mező nem megbízható.
6. Megosztás célhoz és erőforráshoz kötött, átlátható és visszavonható.
7. Kritikus jogosultságváltozások auditálása adatminimalizálással.
8. A napló nem tárolhat szükségtelenül érzékeny tartalmat, dokumentumot vagy egészségügyi/pénzügyi részletet.
9. Háztartási adminisztrátor nem kap automatikusan hozzáférést a személyes adatokhoz.
10. Fiók- és háztartásmegszüntetéskor az adatmegőrzési, exportálási és törlési szabályokat külön kell kezelni.

A gyermekek, gondviselők és korlátozott profilok kezeléséhez külön termék-, adatvédelmi és szükség esetén jogi felülvizsgálat szükséges.

## 11. Integrációs szerződések

Minden modulok közötti integráció dokumentálja:

- az adat elsődleges gazdáját;
- a közzétett lekérdezési és műveleti interfészt;
- a megosztott adatok minimális körét;
- a szükséges jogosultságot;
- az események és változások jelentését;
- a hibák és elérhetetlenség kezelését;
- az offline viselkedést;
- a törlés, archiválás és hozzáférés-visszavonás következményeit;
- a verziózási és kompatibilitási szabályokat.

A modulok közötti integráció ne hozzon létre rejtett, kétirányú adatfüggőségeket. A fogyasztó modul lehetőleg olvasási modellt vagy domain által biztosított alkalmazási szolgáltatást használjon, ne közvetlenül módosítsa a forrásmodul tábláit.

## 12. Tesztelési és elfogadási követelmények

A közös platformot nem elegendő csak egységtesztekkel ellenőrizni. Szükség van domain-, integrációs, adatbázis-, biztonsági, szinkronizációs és valós eszközös tesztekre.

### 12.1 Identitás és Household

- háztartás létrehozása és meghívás;
- meghívás elfogadása, lejárata és visszavonása;
- tag csatlakozása és eltávolítása;
- OWNER/ADMIN/MEMBER/RESTRICTED határok;
- több háztartási tagság, ha támogatott;
- háztartás megszüntetése adatvesztés nélkül;
- tulajdonosváltás és adminisztrátori műveletek.

### 12.2 Jogosultság és megosztás

- privát rekord nem látható más tagnak;
- HOUSEHOLD rekord csak megfelelő tagsággal és engedéllyel látható;
- EXPLICIT megosztás csak a megnevezett címzettnek működik;
- VIEW engedély nem teszi lehetővé a szerkesztést vagy törlést;
- EDIT nem ad automatikusan SHARE vagy ADMIN jogot;
- ADMIN háztartási szerep nem kerüli meg a személyes adatvédelmet;
- megosztás visszavonása után a szerver megtagadja a további hozzáférést;
- nem létező vagy törölt erőforráshoz nem maradhat érvényes megosztás;
- másik felhasználó azonosítójának kliensoldali manipulálása nem ad hozzáférést.

### 12.3 Offline és szinkronizáció

- offline létrehozott és módosított rekordok biztonságos visszaszinkronizálása;
- párhuzamos szerkesztések és konfliktusok;
- ismételt kérésből nem keletkezik duplikált művelet;
- visszavont hozzáféréssel készült offline módosítás elutasítása;
- törlés és visszavonás minden eszközre eljut;
- fiókváltáskor nincs adatszivárgás a helyi gyorsítótárban;
- offline eszközön a korlátozások és késleltetett visszavonás érthetően jelennek meg.

### 12.4 UI és hozzáférhetőség

- közös navigáció és komponensek minden modulban;
- Family jelzések azonos jelentése;
- modulspecifikus tokenek nem bontják meg a kontrasztot és szemantikus állapotokat;
- kis képernyőn és nagyobb betűmérettel is használható;
- billentyűzetes és képernyőolvasós használat a támogatott platformokon;
- hiba-, üres-, betöltési és offline állapotok következetes kezelése.

### 12.5 Elfogadási kapu

A közös Core/Family funkció csak akkor tekinthető elfogadottnak, ha:
- a jogosultsági mátrix automatizált tesztjei sikeresek;
- a szerveroldali hozzáférés-ellenőrzés igazolt;
- a releváns meglévő Home és más modulok regressziós tesztjei sikeresek;
- TEST környezetben két vagy több külön felhasználóval végzett végponttól végpontig teszt megtörtént;
- offline és visszavonási forgatókönyvek teszteltek;
- nincs ismert kritikus adatvédelmi vagy adatvesztési hiba;
- a PROD-ra vonatkozó migráció és visszaállítás külön jóváhagyott.

## 13. Fokozatos bevezetési stratégia

A bevezetés a meglévő működő funkciók megőrzésével, kis lépésekben történjen.

### 0. fázis – Read-only audit

- aktuális repository és modulhatárok felmérése;
- meglévő Auth, Household, RLS és adatmodell ellenőrzése;
- TEST és PROD állapot külön ellenőrzése;
- jelenlegi kliensoldali és szerveroldali jogosultságok feltérképezése;
- meglévő tesztek és elfogadott folyamatok listázása;
- eltérések és kockázatok dokumentálása.

Ebben a fázisban nincs adatbázis-migráció vagy működő kódot érintő átalakítás.

### 1. fázis – Fogalmi és szerződéses véglegesítés

- domainhatárok és tulajdonosi szabályok;
- háztartási szerepkörök és jogosultsági mátrix;
- erőforrás-azonosítási és megosztási modell;
- szerveroldali Authorization szerződés;
- offline és visszavonási viselkedés;
- adatmegőrzési és exportálási szabályok.

A nyitott kérdések lezárása és jóváhagyása nélkül nem kezdődhet migráció.

### 2. fázis – Core/Family minimális képesség

Csak az audit és a véglegesített terv alapján szükséges képességek készüljenek el:
- Household tagság és meghívás;
- központi jogosultsági döntés;
- megosztás és visszavonás;
- szerveroldali védelem;
- auditálható kritikus változások.

A jelenlegi működő adatokat és egyéni funkciókat meg kell őrizni.

### 3. fázis – Egy modul kontrollált integrációja

Elsőként olyan, jól körülhatárolható, alacsonyabb érzékenységű használati eset választható, amely nem igényel Health/Finance/Vault adatmegosztást. A Home közös háztartási folyamatai alkalmas validációs alapot adhatnak.

Az integráció után teljes regressziós és kétfelhasználós teszt szükséges.

### 4. fázis – További modulok fokozatos integrációja

Food/LifeHub, Garage, Vault, Finance és más modulok külön integrációs tervvel csatlakozzanak. Minden modul saját adatgazda marad, a megosztás pedig explicit.

### 5. fázis – Platformok és fejlettebb biztonság

- Android és web közötti azonos jogosultsági viselkedés;
- offline működés és konfliktuskezelés;
- eszközszintű tárolásbiztonság;
- Vault E2EE külön projektként;
- esetleges önálló app-csomagolás vagy szolgáltatásszétválasztás csak indokolt esetben.

## 14. Migrációs és kiadási szabályok

- Minden változás külön feature branch-en készüljön.
- A koncepció és a technikai specifikáció ne módosítsa automatikusan a meglévő adatmodellt.
- Minden adatbázis-változtatás verziózott migráció legyen.
- TEST és PROD külön adatbázissal, kulcsokkal, migrációkkal és tesztadatokkal működjön.
- PROD migráció csak TEST-validáció, mentés/restore ellenőrzés és explicit jóváhagyás után történhet.
- Meglévő adatot nem szabad automatikusan törölni vagy új tulajdonoshoz rendelni bizonyíték és jóváhagyott migráció nélkül.
- Visszagörgetési vagy helyreállítási terv szükséges.
- Nincs automatikus merge vagy élesítés explicit jóváhagyás nélkül.
- A build sikeressége nem helyettesíti a funkcionális és biztonsági elfogadást.

## 15. Nem célok

Ez a specifikáció jelenleg nem írja elő:

- a Family önálló alkalmazásként történő létrehozását;
- minden modul külön telepíthető alkalmazásként történő kiadását az induló termékstratégiában;
- mikroszolgáltatások bevezetését;
- minden domainadat közös táblákba költöztetését;
- minden rekord kötelező megoszthatóvá tételét;
- automatikus hozzáférést a családtagok személyes adataihoz;
- azonnali E2EE-megvalósítást;
- minden offline eszközön azonnali visszavonást, hálózati kapcsolat nélkül;
- a meglévő működő funkciók újraírását;
- azonnali implementációt vagy kiadást.

## 16. Nyitott döntések és kockázatok

A dokumentum 1.0 verziója az irányt és a követelményeket rögzíti. Az alábbiakat technikai tervezés és audit során kell lezárni:

1. A felhasználó több Household tagja lehet-e minden termékcsomagban?
2. A háztartási tulajdonú és a személyes tulajdonú erőforrások pontos domainmodellje.
3. A Resource Registry vagy modulonkénti megosztási táblák közötti választás.
4. A végleges permission-szókészlet és az egyes modulok műveleti mátrixa.
5. A gyermekprofilok, gondviselők és RESTRICTED fiókok szabályai.
6. A helyi cache titkosítási és lejárati politikája.
7. A visszavonás és offline hozzáférés elfogadható késleltetése.
8. A törlés, archiválás, export és háztartásmegszüntetés adat-életciklusa.
9. A jelenlegi Supabase/PostgreSQL és Android Room implementáció pontos illeszkedése.
10. A modulonkénti tematikus tokenek konkrét szín- és komponensszabályai.

## 17. Döntési összefoglaló

A Grapes hosszú távú architekturális iránya:

- **Modular Monolith + DDD**, világos domainhatárokkal.
- **Grapes Core** mint közös platformréteg.
- **Family mint keresztfunkcionális képesség**, nem külön app.
- **Identity, Household, Authorization és Sharing** külön felelősségi területekkel.
- **RBAC + ACL** kombináció, alapértelmezett tiltással és szerveroldali ellenőrzéssel.
- **Domainenkénti adatgazda**, központi jogosultsági szerződéssel.
- **Offline-first kliens**, szerver által újraellenőrzött hozzáféréssel.
- **Egységes Grapes Design System**, közös komponensekkel és visszafogott modulakcentusokkal.
- **Fokozatos, TEST-first bevezetés**, regresszióvédelemmel és explicit PROD-jóváhagyással.

Ez az irány egyetlen, egységes Grapes alkalmazás közös alapját adja anélkül, hogy most előre meg kellene valósítani minden elképzelt funkciót. Az Android-specifikus Gradle multi-module, Jetpack Compose és Type-Safe Navigation szabályokat a [GRAPES_ANDROID_APP_ARCHITECTURE.md](./GRAPES_ANDROID_APP_ARCHITECTURE.md) rögzíti.
