# Grapes AI Advisor – modulokon átívelő, személyre szabott tanácsadó

**Státusz:** termékkoncepció / későbbi fejlesztési ötlet. Nem megvalósított funkció, nem elfogadott implementációs specifikáció. A stabilizáció és a meglévő modulok befejezése után vizsgálandó.

## 1. Alapötlet

A Grapes AI Advisor ne egy általános chatbot legyen, hanem a Grapes moduljainak adataira támaszkodó, konkrét és végrehajtható javaslatokat adó személyes tanácsadó.

A tanácsadó elsődleges felülete ne beszélgetés legyen. A rendszer önállóan elemezze az engedélyezett adatokat, és releváns helyzetekben rövid, érthető, konkrét javaslatokat jelenítsen meg. A felhasználó ezeket elfogadhassa, elutasíthassa, elhalaszthassa vagy részletesebben megnyithassa. A chat legfeljebb későbbi, opcionális kiegészítés.

A legnagyobb érték a modulok közötti összefonódásból származhat. A Food, Home és Finance ne elszigetelt funkcióként működjön: megfelelő felhasználói engedéllyel közösen segíthetnek hétköznapi döntésekben.

**Alapelv: a Grapes saját ajánlórendszere legyen az alap, a generatív AI pedig opcionális kiegészítés.** A rendszer alapvető ajánlásai működjenek külső AI API, Ollama vagy más nyelvi modell nélkül is.

## 2. AI nélküli alapmotor – Grapes Recommendation Engine

A Grapes egy saját, determinisztikus ajánlómotort építhet, amely hagyományos programlogikával, adatbázis-lekérdezésekkel, statisztikával és előrejelzési módszerekkel készít javaslatokat. Ehhez nem szükséges generatív AI-modell vagy fizetős AI API.

A motor feladatai:

- **Szabályalapú elemzés:** célok, korlátok, készletállapotok és felhasználói beállítások ellenőrzése.
- **Előzmények elemzése:** visszatérő étkezési, fogyasztási és vásárlási szokások felismerése.
- **Trendek:** napi, heti és hosszabb távú változások követése.
- **Előrejelzés:** például a napi tápanyagcél várható teljesülése, készletfogyás vagy havi költési keret várható alakulása.
- **Rangsorolás:** a lehetséges javaslatok relevancia, hasznosság, sürgősség, költség és felhasználói preferenciák szerinti sorba rendezése.
- **Személyre szabás:** a korábban elfogadott, elutasított vagy elhalasztott javaslatok figyelembevétele.
- **Magyarázhatóság:** minden javaslatnál legyen visszakereshető, milyen adatok, szabályok és feltételezések vezettek az eredményhez.

A modulok maradjanak az adatok és a szakmai számítások elsődleges forrásai. Például a tápértékeket a Food, a készletmennyiségeket a Home, a pénzügyi egyenlegeket pedig a Finance számítsa és hitelesítse. Az ajánlómotor ezeket használja fel, ne találjon ki helyettük adatokat.

### Javaslatok megjelenítése és életciklusa

A rendszer ne árassza el a felhasználót értesítésekkel. Csak releváns, kellően megalapozott javaslatokat mutasson, prioritás és megjelenítési korlát alapján.

Egy javaslat lehetséges állapotai:

- új;
- megtekintve;
- elfogadva;
- elutasítva;
- későbbre halasztva;
- lejárt vagy már nem releváns.

A visszajelzések javíthatják a rangsorolást, de az elutasítás okát nem szabad automatikusan biztos preferenciának tekinteni. A felhasználó bármikor módosíthassa a tanácsadó beállításait, és kikapcsolhassa az egyes javaslattípusokat.

### Eseményalapú és proaktív működés

A motor ne csak akkor dolgozzon, amikor a felhasználó megnyit egy modult. Meghatározott események vagy ütemezett ellenőrzések alapján a háttérben is készíthessen javaslatokat.

Példák:

- napi étkezési előrejelzés frissítése új naplóbejegyzés után;
- bevásárlási javaslat készítése a heti menü és a tényleges készlet összevetésekor;
- lejárathoz közeledő termék jelzése;
- szokatlan költés vagy várható kerettúllépés észlelése;
- reggeli vagy heti összefoglaló, ha van valóban hasznos teendő.

A háttérfolyamatok legyenek takarékosak: ne indítsanak minden adatváltozásra teljes elemzést, használjanak esemény-összevonást, gyorsítótárazást, időablakokat és duplikációvédelmet. Az ajánlás elkészítése önmagában ne módosítsa a felhasználó nyilvántartásait.

## 3. Food + Home: készletből célhoz illő étel

Ez az egyik legerősebb, jól érthető felhasználási eset.

### Példa folyamat

1. A felhasználó vezeti a Food modulban az étkezéseit és a személyes táplálkozási céljait.
2. A Home modulban kezeli a háztartási készletet és a bevásárlólistát.
3. A Food jelzi, hogy a napi fehérjebevitel várhatóan elmarad a céltól.
4. Az ajánlómotor figyelembe veszi a háztartásban elérhetőnek jelölt alapanyagokat, a felhasználó étkezési preferenciáit és a még hátralévő étkezéseket.
5. Konkrét receptet vagy étel-/snackötletet ajánl, becsült adaggal és tápértékkel, megmutatva, hogyan segíti a napi cél elérését.
6. Ha egy szükséges alapanyag hiányzik, felajánlja annak hozzáadását a bevásárlólistához.

Például nem pusztán azt mondja, hogy „egyél több fehérjét”, hanem: „A naplózott étkezéseid alapján a napi fehérjecélod várhatóan nem fog teljesülni. A nyilvántartott készlet szerint tojás és túró is rendelkezésre állhat; ezekből készíthetsz egy gyors vacsorát.”

A javaslat a Grapes által számított adatokra és recepttápértékekre épüljön. Ha az adag vagy a készlet bizonytalan, ezt egyértelműen jelezze.

### Bevásárlás közbeni személyre szabás

A vásárlási javaslat ne csak az aktuális listát és készletet vegye figyelembe, hanem – engedélyezett adatkapcsolat esetén – a Food előzményeit, céljait és visszatérő étkezési mintáit is.

Példák:

- olyan termék ajánlása, amely segíthet egy gyakran elmaradó tápanyagcél teljesítésében;
- a megszokott termékhez táplálkozási vagy ár szempontból megfelelő alternatíva ajánlása;
- annak jelzése, hogy egy termékből még van otthon, ezért nem feltétlenül szükséges újra megvenni;
- olyan alapanyagok ajánlása, amelyek több tervezett ételhez is felhasználhatók;
- a heti menü, a bevásárlólista, a készlet és a költségkeret együttes optimalizálása.

A rendszer ne ösztönözzön indokolatlan vásárlásra. Ha a felhasználó célja meglévő készlet felhasználása vagy költségcsökkentés, ezt a rangsorolás vegye figyelembe.

### Készlet- és bevásárlólista-logika

A rendszer különböztesse meg az alábbi állapotokat:

- **Otthoni készlet:** ténylegesen nyilvántartott, elérhető mennyiség.
- **Bevásárlólistán szerepel:** még beszerzendő tétel; önmagában nem tekinthető otthon elérhetőnek.
- **Megvásárolva / készletbe véve:** a felhasználó visszaigazolta, hogy a termék már rendelkezésre áll.
- **Bizonytalan készlet:** becsült vagy régen frissített mennyiség, amelyet a rendszer csak óvatosan kezelhet.

A rendszer soha ne állítsa biztosan, hogy van otthon egy termék, ha az adat csak bizonytalan. Jelezze a feltételezést, és szükség esetén kérdezzen vissza: „Ebből még van otthon?”

A javaslatoknál vegye figyelembe a mennyiséget, a lejáratot vagy fogyaszthatósági időt, az adagokat, valamint azt is, ha egy alapanyagot más tervezett ételhez már lefoglaltak.

### Kétirányú kapcsolat

- Food → Home: hiányzó recept-összetevő hozzáadása a bevásárlólistához.
- Home → Food: a meglévő vagy hamarosan lejáró készletből receptajánlás.
- Közös optimalizálás: célhoz illő étel kiválasztása úgy, hogy lehetőleg a már meglévő készlet fogyjon, és kevesebb felesleges vásárlás történjen.

A bevásárlólista módosítása, a készlet csökkentése vagy egy étkezés naplózása előtt a felhasználó kapjon egyértelmű megerősítési lehetőséget. Egy receptajánlás önmagában ne módosítsa automatikusan a készletet vagy az étkezési naplót.


### Tanult vásárlási ritmus és vásárlás előtti személyre szabott terv

A motor a korábbi bevásárlások dátumaiból és időpontjaiból felismerheti a felhasználó visszatérő vásárlási ritmusát. Például észlelheti, ha a vásárlások jellemzően keddenként vagy csütörtökönként történnek, és megbecsülheti a következő vásárlás várható időpontját.

Ez ne merev heti emlékeztető legyen, hanem tanult, folyamatosan frissülő becslés:
- több hét vásárlási előzménye alapján keressen ismétlődő napokat és időablakokat;
- vegye figyelembe a ritmus változását, kihagyott heteket és rendkívüli vásárlásokat;
- jelezze a becslés bizonytalanságát, és ne tekintse biztosnak a vásárlás napját;
- a felhasználó bármikor felülbírálhassa vagy kikapcsolhassa a tanult vásárlási mintát.

Ha a rendszer kellő bizonyossággal előre jelzi a következő vásárlást, előző nap automatikusan készíthessen személyre szabott bevásárlási tervet. Ehhez – kizárólag engedélyezett adatkapcsolatokkal – összegezze:
- a közelmúlt étkezési naplóit, a makrók és egyéb követett táplálkozási célok alakulását;
- a visszatérő étkezési mintákat és a következő napokra tervezett ételeket;
- a Home tényleges, bizonytalan és hamarosan lejáró készletét, valamint a már meglévő bevásárlólistát;
- a korábbi vásárlások gyakoriságát, termékeit, kiszereléseit és árait;
- a Finance által elérhető, erre a célra engedélyezett élelmiszer-költéseket és költségkeretet.

Az eredmény ne pusztán egy hiánylista legyen, hanem indokolt, rangsorolt vásárlási javaslat:
- mely termékek segíthetnek a táplálkozási célok teljesítésében;
- mely termékeket érdemes újravásárolni a korábbi fogyás és a jelenlegi készlet alapján;
- milyen olcsóbb vagy táplálkozási szempontból megfelelőbb alternatívák léteznek;
- mely ételek készíthetők el több, már otthon lévő alapanyag felhasználásával;
- mennyi lehet a lista várható költsége, és hogyan illeszkedik a korábbi költési mintához vagy a megadott kerethez.

A rendszer mutassa meg, hogy az egyes javaslatokat mely adatok támasztják alá, különítse el a tényeket a becslésektől, és jelezze, ha kevés vagy elavult adatból dolgozik. A termékárak csak friss, ellenőrizhető árforrásból jelenjenek meg aktuális árként; a korábbi vásárlási ár legfeljebb korábbi árként vagy becslési alapként használható.

A bevásárlási terv elkészítése nem adhat le rendelést, nem módosíthatja automatikusan a készletet vagy a naplót. A lista elfogadása és minden további módosítása a felhasználó jóváhagyásával történjen.


## 4. További modulkapcsolatok

### Food + Finance + Home

- Élelmiszer-költések és étkezési tervek összevetése.
- Olcsóbb, de táplálkozási célokhoz illeszkedő receptalternatívák.
- Heti menü és bevásárlólista becsült költsége.
- Élelmiszer-pazarlás és impulzusvásárlás csökkentését segítő javaslatok.

### Home Advisor

- Készletfogyás előrejelzése korábbi fogyás és aktuális mennyiségek alapján.
- Bevásárlási javaslatok összeállítása a tényleges hiányok és a tervezett menü alapján.
- Lejárathoz közeledő termékek felhasználási ötletei.
- Háztartási fogyasztási minták és ismétlődő kiadások felismerése.

### Finance Advisor

- Havi költések és várható hó végi egyenleg elemzése.
- Szokatlan kiadások jelzése.
- Megtakarítási forgatókönyvek és költségkerethez igazított javaslatok.
- Érthető magyarázat a számok mögött; a pénzügyi nyilvántartás és kalkuláció továbbra is a Finance modul feladata.

## 5. Opcionális generatív AI-réteg

A generatív AI nem feltétele az ajánlórendszer működésének. Később opcionális kiegészítésként használható például:

- a már kiszámított ajánlások természetesebb, változatosabb megfogalmazására;
- összetettebb, szabad szöveges kérdések értelmezésére;
- több javaslat közérthető összehasonlítására;
- összetettebb tervezési feladatok támogatására.

Lehetséges futtatási módok:

1. **AI nélkül:** a teljes alapfunkció szabályokkal, statisztikával és előrejelzésekkel működik. Nincs modellhasználati díj.
2. **Helyi modell, például Ollama:** a modell saját gépen vagy szerveren fut. Nincs tokenenkénti külső API-díj, de hardver-, energia- és üzemeltetési költség van.
3. **Külső AI API:** opcionális szolgáltatóadapteren keresztül, használatalapú költséggel és külön adatvédelmi mérlegeléssel.

A helyi vagy külső modell kiesése nem akadályozhatja a szabályalapú ajánlásokat. A szolgáltatófüggetlen adapter lehetővé teszi a későbbi váltást, de az alapmotor ne függjön egyetlen modelltől sem.

## 6. Működési és architekturális alapelvek

- **Közös ajánlómotor, modulonkénti szakértői logikával:** Food Advisor, Home Advisor, Finance Advisor, később keresztmodulos tanácsok.
- **A számítás nem az LLM feladata:** tápérték, készletmennyiség, költség, egyenleg és előrejelzési alapadatok megbízható modul-logikából érkezzenek.
- **AI nélküli alapműködés:** a fontos ajánlások generatív modell nélkül is készüljenek el.
- **Minimális szükséges adathozzáférés:** egy Food-javaslathoz csak a szükséges táplálkozási célok és engedélyezett készletadatok kerüljenek felhasználásra.
- **Explicit adatmegosztás:** a családi háztartás közös készlete nem jelenti azt, hogy a tagok személyes Food- vagy Finance-adatai is közösek. A személyes adatok alapértelmezetten maradjanak privátak.
- **Biztonság:** API-kulcsok és szolgáltatói hitelesítő adatok kizárólag szerveroldalon legyenek; a kliens ne kapjon közvetlen modellkulcsot.
- **Szolgáltatófüggetlenség:** adapteres felépítés, hogy később más AI-modell vagy szolgáltató is használható legyen.
- **Költségkontroll:** ne fusson teljes elemzés minden képernyőnyitáskor; legyen gyorsítótárazás, eseményalapú feldolgozás és erőforráskorlát.
- **Átláthatóság:** a javaslat mutassa meg, milyen adatokból és feltételezésekből indult ki, és jelezze a bizonytalanságot.
- **Felhasználói kontroll:** a tanácsadás különüljön el az automatikus adatváltoztatástól. Minden érdemi művelet legyen előnézhető, jóváhagyható és ahol lehetséges, visszavonható.
- **Nem chatbot-központú UX:** a fő élmény a releváns, kártyákon megjelenő javaslat és annak egyszerű kezelése legyen; a beszélgetés nem követelmény.

## 7. Kereskedelmi lehetőségek

Hosszabb távon a tanácsadó termékajánlásokat is megjeleníthet, például egy adott táplálkozási célhoz kapcsolódó termékeket.

Lehetséges bevételi modellek:
- partneri vagy affiliate jutalék;
- egyértelműen jelölt szponzorált ajánlatok;
- később opcionális, fizetős AI-funkciók.

A kereskedelmi ajánlat soha ne keveredjen össze az objektív, organikus tanáccsal:
- a szponzorált tartalom legyen jól láthatóan megjelölve;
- a fizetett partner ne vásárolhassa meg a legjobb találat helyét;
- a termék ne kapjon valótlan „legjobb” vagy „legegészségesebb” minősítést;
- a felhasználó érdeke és bizalma elsőbbséget élvezzen.

## 8. Javasolt bevezetési sorrend

1. **Ajánlómotor alapjai:** adatforrások, szabályok, javaslat-életciklus, prioritás, visszajelzés és tesztelhetőség.
2. **Food + Home közös, készletalapú recept- és bevásárlási javaslatok:** jól körülhatárolható és mérhető első használati eset.
3. **Eseményalapú proaktív javaslatok:** csak releváns helyzetekben, értesítési zaj nélkül.
4. **Home készlet- és bevásárlási tanácsadó.**
5. **Finance tanácsadó, szigorú személyes adatkezeléssel.**
6. **Keresztmodulos elemzések, kizárólag engedélyezett adatkapcsolatokkal.**
7. **Opcionális helyi vagy külső generatív AI.**
8. **Opcionális partneri és szponzorált termékajánlások.**

## 9. Nyitott kérdések a későbbi tervezéshez

- Mennyire részletes és naprakész készletnyilvántartás szükséges ahhoz, hogy az ajánlások megbízhatóak legyenek?
- Hogyan kezeljük a családi készletet, ha egy alapanyag csak egy adott személy számára vagy étkezéshez van fenntartva?
- Mely táplálkozási célokat és korlátozásokat használhatja a tanácsadó, és milyen forrásból származhatnak?
- Mely műveletekhez kell mindig külön jóváhagyás?
- Milyen események indítsanak háttérelemzést, és milyen gyakran fusson ütemezett ellenőrzés?
- Hogyan kerüljük el az ismétlődő, irreleváns vagy túl gyakori javaslatokat?
- Mely előrejelzésekhez elegendő a szabályalapú/statistikai megközelítés, és hol lenne valódi hozzáadott értéke egy modellnek?
- Milyen helyi modell és hardver adhat később elfogadható minőséget és adatvédelmet?

## 10. Prioritás és státusz

Ez hosszú távú, stratégiai koncepció. A megvalósítás csak a Grapes meglévő moduljainak stabilizálása, az adatmodell és jogosultságok tisztázása, valamint a szükséges adatminőség biztosítása után kerüljön napirendre.

A legfontosabb termékdöntés: **a Grapes ajánlórendszerének alapvető értéke ne függjön fizetős AI-tól.** Először a saját, ellenőrizhető ajánlómotor készüljön el; a generatív AI később választható képesség legyen.
