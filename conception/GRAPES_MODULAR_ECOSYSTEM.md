# Grapes – különálló alkalmazások termékkoncepciója

## Cél és státusz

Ez a dokumentum a Grapes hosszabb távú termék- és alkalmazásfelosztásának elméleti koncepcióját rögzíti. A cél, hogy az egyes alkalmazások önálló, érthető feladatkört kapjanak, miközben a köztük lévő együttműködés a felhasználó számára természetes marad.

**Státusz:** termékkoncepció, nem implementációs terv és nem fejlesztési vállalás. Az itt felsorolt funkciók nem tekinthetők automatikusan megvalósultnak vagy véglegesítettnek. A technikai architektúra, az alkalmazások közötti kommunikáció módja és a megvalósítási sorrend későbbi külön döntés tárgya.

## Alapelv

- Egy alkalmazásnak legyen világos, önmagában is érthető célja.
- Ne hozzunk létre külön alkalmazást pusztán azért, mert egy funkció nem illik máshová.
- Az egymáshoz szorosan kapcsolódó funkciók maradjanak egy termékben, ha ez nem teszi túlterheltté a felhasználói élményt.
- Az alkalmazások közötti együttműködés fontos termékélmény, de a felhasználó számára ne jelentsen bonyolult vagy széttöredezett használatot.
- A családi kapcsolatok és jogosultságok közös, alkalmazásokon átívelő képességet jelentenek; a Family nem önálló alkalmazás.
- A személyes adatok alapértelmezetten privátak. A családi tagság önmagában nem ad automatikus hozzáférést más tagok személyes egészségügyi, étkezési vagy pénzügyi adataihoz.

## Tervezett alkalmazások és határaik

### Grapes LifeHub

A mindennapi élethez kapcsolódó személyes egészség- és életmódközpont.

Tervezett funkcionális területek:
- Food / étkezési napló és táplálkozás
- Víznapló
- Receptek
- Health / egészségügyi adatok
- Activity / aktivitás és mozgás
- Étkezéstervezés

A Food és Health egy alkalmazásban való kezelése jelenleg elfogadott termékirány, mert a táplálkozás, az egészségi állapot és az aktivitás szorosan összefügg. A LifeHub központi termékígérete: **mindennapi élet**.

A családi étkezéstervezésnél a személyes adagok és tápértékek a LifeHub területéhez tartoznak; a közös háztartási bevásárlólista és készlet a Grapes Home-hoz kapcsolódik. Ennek pontos felhasználói határát később kell kidolgozni.

### Grapes Home

Önálló háztartási alkalmazás.

Tervezett funkcionális területek:
- Bevásárlólista
- Háztartási készlet és leltár
- Háztartás működéséhez kapcsolódó feladatok

A bevásárlólista és a készlet ugyanannak a háztartási működésnek két összefüggő része; jelenleg nem indokolt külön alkalmazásba választani őket.

### Grapes Finance

A Grapes Finance önálló termékterület. A meglévő Finance-koncepció változatlan marad; ez a dokumentum nem nyitja újra és nem módosítja a Finance hatókörét.

### Grapes Books

Az általános „Tools” elnevezés helyett az e-könyvekhez kapcsolódó önálló termékirány neve **Grapes Books**.

Tervezett funkcionális területek:
- E-könyvtár és könyvrendszerezés
- Olvasási élmény és könyvkezelés
- PDF-ek feldolgozása és mobilon kényelmesebb formátumba, elsősorban EPUB-ba konvertálása

A Books nem általános segédeszköz-gyűjtemény. A QR-kód funkció nem tartozik ide.

### Grapes Design

Önálló kreatív eszköztár vizuális tartalmak létrehozására és szerkesztésére.

Tervezett funkcionális területek:
- **QR Studio:** QR-kódok generálása és vizuális testreszabása, például színek, logó és megjelenés beállítása.
- **Social Studio:** közösségimédia-posztok, grafikák és sablonok készítése.
- **Design Studio:** bannerek, plakátok, szórólapok és más egyszerű grafikai anyagok létrehozása.
- **Egyszerű képszerkesztés:** alapvető vizuális módosítások és szerkesztési lehetőségek.
- **Sablonok:** újra felhasználható kiindulópontok a gyakori kreatív feladatokhoz.

A Grapes Design jelenlegi termékhatára a kreatív tartalmak elkészítése és szerkesztése. Nem célja, hogy teljes marketingplatform legyen: kampánykezelés, marketingautomatizálás és hírlevél-kampányok kezelése egyelőre nem része a koncepciónak.

A QR-kód itt azért kap helyet, mert a vizuálisan testreszabható QR-anyagok a kreatív tartalomkészítés részei. A QR-kód egyszerű beolvasása önmagában általános segédfunkció, és nem indokol külön alkalmazást.

### Grapes Outdoor

A Grapes Outdoor különálló alkalmazásként felmerült termékirány, de a végleges önálló termékhatára és indokoltsága még nincs lezárva. A növények és kültéri teendők jelenlegi koncepciója külön dokumentumban található; az alkalmazássá választásról később, a teljes termékpaletta áttekintésekor kell dönteni.

## Közös, alkalmazásokon átívelő képességek

### Family / családi adat- és jogosultságkezelés

A Family nem külön alkalmazás. A családtagok, profilok, meghívások, kapcsolatok, jogosultságok és adatmegosztási beállítások közös funkcióként jelennek meg, várhatóan a Beállításokban vagy egy globális fiókfunkció részeként.

A családi kapcsolat nem jelent automatikus adatmegosztást. Minden érzékeny adattípusnál külön, egyértelmű jogosultság szükséges.

### Alkalmazások közötti együttműködés

A különálló Grapes alkalmazások közötti együttműködés kiemelt termékigény. A felhasználó számára a kapcsolódó adatok és műveletek akkor is összefüggő élményt adjanak, ha azok külön alkalmazások funkcionális területéhez tartoznak.

Ez a dokumentum a kívánt termékélményt és funkcionális határokat rögzíti; a kommunikáció technikai megvalósítását nem határozza meg.

## Nyitott termékdöntések

- A LifeHub családi étkezéstervezésének és a Home bevásárlólistájának pontos felhasználói határa.
- A Grapes Outdoor önálló alkalmazásként való indokoltsága és végleges funkcióköre.
- A Grapes Design első verziójának tényleges funkcióprioritásai és szerkesztési mélysége.
- Az egyes alkalmazások közös fiók-, családi és adatmegosztási élményének részletes termékviselkedése.

## Nem cél

- Nem jelent azonnali fejlesztési feladatot vagy kiadási ütemtervet.
- Nem írja elő a jelenlegi működő alkalmazás vagy modulok átalakítását.
- Nem módosítja a Grapes Finance meglévő koncepcióját.
- Nem rögzít technikai architektúrát, backend-megoldást vagy konkrét alkalmazások közötti kommunikációs protokollt.


## Home – a korábbi modulmodell továbbvitele

A különálló alkalmazásokra bontás nem írja felül a korábban kialakított Home működési alapelveket. A Home önálló háztartási alkalmazás marad, a bevásárlólista és a készletkezelés pedig ugyanannak a háztartási folyamatnak két összekapcsolt része.

### A Home alapvető működési területei

- **Egyetlen közös háztartásnézet:** ne legyen párhuzamos „Saját otthon” és „Közös otthon” felület vagy közöttük váltó mód, ha ugyanazt a háztartást duplikálnák. A háztartás tagjai ugyanahhoz a közös háztartási térhez kapcsolódnak.
- **Bevásárlólista:** több jogosult háztartástag által közösen kezelhető lista, mennyiségekkel, kategóriákkal és állapotokkal.
- **Háztartási készlet:** az otthon ténylegesen rendelkezésre álló élelmiszerek és termékek nyilvántartása, amennyire a felhasználó által megadott adatok ezt lehetővé teszik.
- **Háztartási feladatok:** a háztartás működéséhez kapcsolódó teendők lehetséges területe; részletes funkcióköre később pontosítandó.
- **Automatikus beszerzési javaslatok:** a készlet, a tervezett étkezések és a felhasználói visszajelzések alapján javaslatokat tehet, de nem módosíthat észrevétlenül adatot vagy listát.

### A készlet és a bevásárlólista közötti fontos különbség

A rendszernek külön kell kezelnie legalább az alábbi állapotokat:

1. **Otthoni készlet:** a felhasználó szerint ténylegesen otthon található termék vagy alapanyag.
2. **Bevásárlólistán szereplő tétel:** beszerzendő termék; ettől még nem tekinthető otthon elérhetőnek.
3. **Megvásárolt, de még nem készletként visszaigazolt tétel:** a vásárlás megtörtént, de a készletbe kerülés külön megerősítést vagy egyértelmű folyamatot igényelhet.
4. **Bizonytalan vagy régi készletadat:** nem kezelhető biztos mennyiségként vagy biztos hiányként.

A recept hozzávalói és a háztartás tényleges készlete szintén külön fogalom. Attól, hogy egy recepthez szükség van valamire, az még nem jelenti azt, hogy az otthon rendelkezésre áll.

A készletből származó automatikus javaslat legyen magyarázható és kezelhető: elfogadható, módosítható, elhalasztható vagy elutasítható. A „most nem” jelzés a javaslatot kezelje, ne törölje a mögöttes készletadatot.

## Részletes alkalmazásközi felhasználói folyamatok

Az alábbiak a kívánt termékélményt írják le. Ahol a korábbi döntés nem volt egyértelmű, ott ez javasolt együttműködési modell, nem végleges üzleti szabály.

### LifeHub ↔ Home: étkezés, készlet és bevásárlás

1. A felhasználó a LifeHubban heti étkezési tervet készít. Nem kötelező minden étkezést kitölteni.
2. A LifeHub a megfelelő jogosultság mellett lekérdezheti a Home háztartási készletének releváns tételeit.
3. A rendelkezésre álló, kellő bizonyosságú alapanyagok alapján recepteket vagy étkezési ötleteket ajánlhat.
4. A hiányzó hozzávalókat felajánlhatja a Home bevásárlólistájára.
5. A felhasználó jóváhagyása szükséges a közös lista módosításához.
6. A családi menü közös lehet, de az adagok és a tápértékek személyenként eltérhetnek, és a LifeHub személyes naplójában maradnak.
7. A megtervezett étkezés nem válik automatikusan elfogyasztott étellé. A tényleges fogyasztást külön kell naplózni.
8. A bevásárlólistára felvett tétel nem jelenhet meg automatikusan otthoni készletként.

A cél egy folytonos felhasználói folyamat: étkezéstervezés → készletellenőrzés → hiányzó hozzávalók felajánlása → közös bevásárlás. A felhasználó végső döntése minden adatot módosító lépésnél megmarad.

### Home ↔ Finance: háztartási vásárlás és pénzügyi áttekintés

A Home bevásárlási és háztartási folyamatai kapcsolódhatnak a Finance meglévő pénzügyi funkcióihoz, például a háztartási kiadások áttekintéséhez vagy a költségkeretekhez. Ez nem jelenti a Finance jelenlegi koncepciójának újratervezését.

A termékhatár alapelvei:
- A Home a háztartási listák, készlet és beszerzési folyamatok helye.
- A Finance marad a pénzügyi adatok és pénzügyi műveletek saját területe.
- Egy vásárlás pénzügyi adatként való megjelenítése csak megfelelő adatforrás és felhasználói engedély mellett történhet.
- A háztartási tagság nem ad automatikus hozzáférést a családtagok személyes pénzügyi adataihoz.
- A közös háztartási kiadás és a személyes pénzügyi tranzakció nem azonos fogalom; a pontos kezelés a meglévő Finance szabályainak megőrzésével történjen.

### Home ↔ Outdoor: háztartási növények és gondozási kellékek

A közös háztartáshoz tartozó növények, gondozási feladatok és emlékeztetők kapcsolódhatnak a Home háztartási teendőihez. A növényápoláshoz szükséges kellékek beszerzése felajánlható a Home bevásárlólistájára. Az Outdoor önálló alkalmazásként való véglegesítése továbbra is nyitott termékdöntés.

### LifeHub ↔ Books: tudás és olvasmányok

A Books könyvtárában lévő, táplálkozáshoz, egészséghez vagy mozgáshoz kapcsolódó könyvek releváns LifeHub-témákhoz kapcsolhatók. Ez opcionális tartalmi kapcsolat; a könyvtár és az olvasási funkciók a Books alkalmazásban maradnak.

### Design ↔ többi alkalmazás: kreatív tartalmak

A Designban létrehozott QR-kódok és grafikai anyagok más Grapes alkalmazásokban is felhasználhatók. Például egy megosztható lista vagy könyvadatlap kaphat QR-kódot, de az adott alkalmazás saját adatainak és megosztási jogosultságainak szabályai érvényesek.

## Közös ökoszisztéma-képességek

Az alábbiak nem feltétlenül önálló alkalmazások; több Grapes termékben egységesen használható közös képességek lehetnek. A részletes megvalósításuk és prioritásuk későbbi döntés tárgya.

- **Egységes Grapes-fiók és profil:** az alkalmazások közötti következetes azonosítás és profilkezelés.
- **Family / családi kapcsolatok és jogosultságok:** tagok, profilok, meghívások, szerepek és célhoz kötött adatmegosztás. A kezelés várható helye a Beállítások vagy egy globális fiókfelület; nem külön Family app.
- **Egységes keresés:** jogosultság szerint keresés több alkalmazás tartalmában.
- **Közös értesítési központ:** több alkalmazás releváns értesítéseinek egységes megjelenítése, a felhasználó által szabályozható módon.
- **Megosztás:** receptek, listák, könyvek, dokumentumok vagy kreatív anyagok megosztása az adott tartalom jogosultságainak megtartásával.
- **Aktivitási és változási előzmények:** fontos, felhasználó számára hasznos műveletek visszakereshetősége.
- **Keresztalkalmazásos automatizmusok:** több alkalmazást érintő, átlátható szabályok és javaslatok. Az automatikus adatváltoztatás helyett alapértelmezésben előnézet és jóváhagyás szükséges.
- **Egységes navigációs és megjelenési alapelvek:** az appok önálló feladatköre mellett következetes Grapes-élmény.

### Keresztalkalmazásos működés alapelvei

- Az adatnak legyen egyértelmű elsődleges gazdája: az a termék, amelyik az adott adatot létrehozza és kezeli.
- Más alkalmazás csak a feladatához szükséges adatot használja fel.
- A felhasználó értse, melyik alkalmazás milyen adatot használ és miért.
- A jogosultságok és megosztások legyenek átláthatók és visszavonhatók.
- A javaslat nem azonos a végrehajtással: lista, készlet, napló vagy pénzügyi adat módosítása előtt a megfelelő jóváhagyás szükséges.
- Egy alkalmazás alapfunkciói lehetőség szerint maradjanak használhatók akkor is, ha egy másik alkalmazás vagy integráció éppen nem érhető el.

## Korábbi Home-alapelvek és jelenlegi termékfelosztás kapcsolata

A korábbi Home-koncepció részletesebb működési leírása továbbra is a [GRAPES_HOME.md](./GRAPES_HOME.md) dokumentumban található. Ez a dokumentum az alkalmazások közötti termékhatárokat és a közös felhasználói folyamatokat foglalja össze. A két dokumentumot együtt kell értelmezni; a mostani alkalmazásfelosztás nem törli a Home korábbi elfogadott működési alapelveit.
