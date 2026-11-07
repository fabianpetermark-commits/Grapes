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
