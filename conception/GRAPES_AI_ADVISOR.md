# Grapes AI Advisor – modulokon átívelő, személyre szabott tanácsadó

**Státusz:** termékkoncepció / későbbi fejlesztési ötlet. Nem megvalósított funkció, nem elfogadott implementációs specifikáció. A stabilizáció és a meglévő modulok befejezése után vizsgálandó.

## 1. Alapötlet

A Grapes AI Advisor ne egy általános chatbot legyen, hanem a Grapes moduljainak adataira támaszkodó, konkrét és végrehajtható javaslatokat adó tanácsadó.

A legnagyobb érték a modulok közötti összefonódásból származhat. A Food, Home és Finance ne elszigetelt funkcióként működjön: megfelelő felhasználói engedéllyel közösen segíthetnek hétköznapi döntésekben.

Az AI feladata az összefüggések felismerése, a lehetőségek rangsorolása, a magyarázat és a személyre szabott javaslat. A modulok determinisztikus számításai és nyilvántartásai maradjanak az elsődleges igazságforrások.

## 2. Food + Home: készletből célhoz illő étel

Ez az egyik legerősebb, jól érthető felhasználási eset.

### Példa folyamat

1. A felhasználó vezeti a Food modulban az étkezéseit és a személyes táplálkozási céljait.
2. A Home modulban kezeli a háztartási készletet és a bevásárlólistát.
3. A Food jelzi, hogy a napi fehérjebevitel várhatóan elmarad a céltól.
4. Az AI figyelembe veszi a háztartásban valószínűleg elérhető alapanyagokat, a felhasználó étkezési preferenciáit és a még hátralévő étkezéseket.
5. Konkrét receptet vagy étel-/snackötletet ajánl, becsült adaggal és tápértékkel, megmutatva, hogyan segíti a napi cél elérését.
6. Ha egy szükséges alapanyag hiányzik, felajánlja annak hozzáadását a bevásárlólistához.

Például nem pusztán azt mondja, hogy „egyél több fehérjét”, hanem: „A nyilvántartott készlet alapján tojás, túró és paradicsom is rendelkezésre állhat. Ezekből készíthetsz egy gyors, fehérjedús vacsorát; ez várhatóan közelebb visz a napi célodhoz.”

### Készlet- és bevásárlólista-logika

A rendszer különböztesse meg az alábbi állapotokat:

- **Otthoni készlet:** ténylegesen nyilvántartott, elérhető mennyiség.
- **Bevásárlólistán szerepel:** még beszerzendő tétel; önmagában nem tekinthető otthon elérhetőnek.
- **Megvásárolva / készletbe véve:** a felhasználó visszaigazolta, hogy a termék már rendelkezésre áll.
- **Bizonytalan készlet:** becsült vagy régen frissített mennyiség, amelyet az AI csak óvatosan kezelhet.

Az AI soha ne állítsa biztosan, hogy van otthon egy termék, ha az adat csak bizonytalan. Jelezze a feltételezést, és szükség esetén kérdezzen vissza: „Ebből még van otthon?”

A javaslatoknál vegye figyelembe a mennyiséget, a lejáratot vagy fogyaszthatósági időt, az adagokat, valamint azt is, ha egy alapanyagot más tervezett ételhez már lefoglaltak.

### Kétirányú kapcsolat

- Food → Home: hiányzó recept-összetevő hozzáadása a bevásárlólistához.
- Home → Food: a meglévő vagy hamarosan lejáró készletből receptajánlás.
- Közös optimalizálás: célhoz illő étel kiválasztása úgy, hogy lehetőleg a már meglévő készlet fogyjon, és kevesebb felesleges vásárlás történjen.

A bevásárlólista módosítása, a készlet csökkentése vagy egy étkezés naplózása előtt a felhasználó kapjon egyértelmű megerősítési lehetőséget. Egy receptajánlás önmagában ne módosítsa automatikusan a készletet vagy az étkezési naplót.

## 3. További modulkapcsolatok

### Food + Finance + Home

- Élelmiszer-költések és étkezési tervek összevetése.
- Olcsóbb, de táplálkozási célokhoz illeszkedő receptalternatívák.
- Heti menü és bevásárlólista becsült költsége.
- Élelmiszer-pazarlás és impulzusvásárlás csökkentését segítő javaslatok.

### Home AI

- Készletfogyás előrejelzése korábbi fogyás és aktuális mennyiségek alapján.
- Bevásárlási javaslatok összeállítása a tényleges hiányok és a tervezett menü alapján.
- Lejárathoz közeledő termékek felhasználási ötletei.
- Háztartási fogyasztási minták és ismétlődő kiadások felismerése.

### Finance AI

- Havi költések és várható hó végi egyenleg elemzése.
- Szokatlan kiadások jelzése.
- Megtakarítási forgatókönyvek és költségkerethez igazított javaslatok.
- Érthető magyarázat a számok mögött; a pénzügyi nyilvántartás és kalkuláció továbbra is a Finance modul feladata.

## 4. Működési és architekturális alapelvek

- **Egy közös AI-szolgáltatás, modulonkénti szakértői logikával:** Food Advisor, Home Advisor, Finance Advisor, később keresztmodulos tanácsok.
- **A számítás nem az LLM feladata:** tápérték, készletmennyiség, költség, egyenleg és előrejelzési alapadatok megbízható modul-logikából érkezzenek. Az AI ezeket értelmezze és magyarázza.
- **Minimális szükséges adathozzáférés:** egy Food-javaslathoz csak a szükséges táplálkozási célok és engedélyezett készletadatok kerüljenek átadásra.
- **Explicit adatmegosztás:** a családi háztartás közös készlete nem jelenti azt, hogy a tagok személyes Food- vagy Finance-adatai is közösek. A személyes adatok alapértelmezetten maradjanak privátak.
- **Biztonság:** API-kulcsok és szolgáltatói hitelesítő adatok kizárólag szerveroldalon legyenek; a kliens ne kapjon közvetlen modellkulcsot.
- **Szolgáltatófüggetlenség:** adapteres felépítés, hogy később más AI-modell vagy szolgáltató is használható legyen.
- **Költségkontroll:** ne fusson modellhívás minden képernyőnyitáskor; legyen gyorsítótárazás, eseményalapú vagy felhasználó által indított tanácsadás, valamint költségkeret.
- **Átláthatóság:** a javaslat mutassa meg, milyen adatokból és feltételezésekből indult ki, és jelezze a bizonytalanságot.
- **Felhasználói kontroll:** a tanácsadás különüljön el az automatikus adatváltoztatástól. Minden érdemi művelet legyen előnézhető, jóváhagyható és ahol lehetséges, visszavonható.

## 5. Kereskedelmi lehetőségek

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

## 6. Javasolt bevezetési sorrend

1. Food + Home közös, készletalapú receptajánló – jól körülhatárolható és könnyen mérhető első használati eset.
2. Home készlet- és bevásárlási tanácsadó.
3. Finance tanácsadó, szigorú személyes adatkezeléssel.
4. Keresztmodulos elemzések, kizárólag engedélyezett adatkapcsolatokkal.
5. Opcionális partneri és szponzorált termékajánlások.

## 7. Nyitott kérdések a későbbi tervezéshez

- Mennyire részletes és naprakész készletnyilvántartás szükséges ahhoz, hogy az ajánlások megbízhatóak legyenek?
- Hogyan kezeljük a családi készletet, ha egy alapanyag csak egy adott személy számára vagy étkezéshez van fenntartva?
- Mely táplálkozási célokat és korlátozásokat használhatja a tanácsadó, és milyen forrásból származhatnak?
- Mely műveletekhez kell mindig külön jóváhagyás?
- Milyen modell- és adatfeldolgozási megoldás biztosít elfogadható költséget és adatvédelmet?

## 8. Prioritás és státusz

Ez hosszú távú, stratégiai koncepció. A megvalósítás csak a Grapes meglévő moduljainak stabilizálása, az adatmodell és jogosultságok tisztázása, valamint a szükséges adatminőség biztosítása után kerüljön napirendre.
