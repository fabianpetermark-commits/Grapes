# Grapes – Concept UI Reference / Visual Component Contract

> **v0.2 – TARGET / koncepciós referencia, 2026-10-19.**  
> Kiegészíti a [Brand Guide](./GRAPES_BRAND_GUIDE.md) megjelenési szabványát és a [Product Vision](./GRAPES_PRODUCT_VISION_AND_UX_PRINCIPLES.md) UX-alapelveit.  
> **[Megnyitható, statikus HTML-mintalap](./GRAPES_CONCEPT_UI_KIT.html)** – az öt mintát ugyanazon a lapon mutatja. A korábbi ChatGPT-tervezési példák **újraalkotott referenciája**, nem eredeti screenshot, nem alkalmazáskód.

## A minták célja

A korábbi beszélgetésben a célválasztó, „Mit főzzünk?”, hűtő/fagyasztó mennyiségelosztó és bevásárlási javaslat aratott pozitív fogadtatást. A meglévő Food-receptadatlapot is ugyanezzel a vizuális nyelvvel egységesítjük. Ezeket most egyetlen vizuális nyelvbe foglaljuk: **sötét, levegős kártyák; rövid magyarázó szöveg; egy elsődleges művelet; állapot és forrás egyértelmű elkülönítése**.

A vizuális mintalap nem használ valós felhasználói adatot, jelenlévő termékfotót vagy működő műveleti vezérlőt. A végleges alkalmazásban a receptképek lehetnek valódi, forrással kezelt ételfotók, az egyszerű folyamatsémák maradjanak vektorosak.

## 1. Goal Selection – „Miben segíthetünk?”

**Referenciája:** beszélgetésben kipróbált, több cél kiválasztását lehetővé tevő kártya; korábbi felhasználói képernyőkép.

**Feladat:** a cél alapján már az elején értéket adni anélkül, hogy kötelező, hosszú onboardingba kényszerítenénk.

**Tartalom:** „Mit szeretnél elérni?” + rövid egyértelmű előny, 4 példa: fogyni; egészségesebben étkezni; kevesebbet költeni; kevesebb ételt kidobni.

**Kötelező viselkedés / finomítás:**
- Több cél kiválasztható, és legyen **Kihagyom / Később** lehetőség.
- Minden opció legalább 48 px érintési cél, a teljes kártya érinthető.
- A kiválasztás ikon + szöveg + egyértelmű „kiválasztva” jelzés; nem csak cián keret.
- Nem állítunk be automatikusan egészségcélt, kalóriakeretet vagy adatmegosztást pusztán célválasztásra.
- A cél bármikor szerkeszthető; az első értékhez elég egy releváns javaslat.

**Elkerülendő:** egyszerre túl sok opció, bűntudatkeltő címkék, fölösleges többoldalas regisztráció.

## 2. Recipe Recommendation – „Mit főzzünk?”

**Referenciája:** „Tejszínes csirkés tészta” / készleten jelzés, kép, 30 perc, 4 adag és rövid indoklás; később a „Mentés a receptjeim közé” kéréssel kibővítve.

**Tartalomhierarchia:**
1. Étel neve, egy releváns kép vagy közérthető helyőrző.
2. Feltételes alapanyagállapot: **„Megerősített készlet alapján”**, **„Valószínűleg elkészíthető”**, **„Ellenőrzendő: csirkemell”**. A „Minden megvan” csak megfelelően friss, megbízható készletnél használható.
3. Idő, adag, esetleg személyes energiacélhoz illeszkedő adagjavaslat – ha az adat rendelkezésre áll és az illetékes profil beleegyezett.
4. **Miért ezt?**: pl. a hűtött hús felhasználása indokolt; az alkalmazás nem tudhatja biztosan a felhasználhatóságot puszta becslésből.
5. Elsődleges CTA: „Recept megnyitása”. Másodlagos: „Mentés a receptjeim közé”; opcionális: „Heti menühöz”.

**Adat- és műveletszabály:** mentés a meglévő Food receptkönyvbe, szerkeszthető példányként; mentés **nem** fogyaszt készletet. „Elkészítettem” az elkészített adagokba helyezi a nyers alapanyagok felhasználását; a személyes elfogyasztás külön Food-bejegyzés, kettős levonás nélkül.

## 3. Storage Split – „Hová került?”

**Referenciája:** 1 kg csirkemell elosztása két tároló között. **❄️ Hűtő** és **🧊 Fagyasztó** a közös beszélgetésben kialakított, könnyen felismerhető megkülönböztetés; mindenhol maradjon mellette szöveges címke.

**Tartalom:** termék + teljes mennyiség + két külön számérték, a teljes mennyiség állandó. 1 kg = Hűtő 600 g + Fagyasztó 400 g.

**Közvetlen műveletek:** teljesen hűtő, fele-fele, teljesen fagyasztó; az összetett arányhoz csúszka **és** pontos számbemenet vagy léptető gomb. Ne csak finommotorikával lehessen beállítani. Darab / g / ml / adag egységek megfelelő átváltással.

**Biztonság és adat:** fagyasztást kizárólag megerősített választásként kezelünk, nem a korábbi szokás alapján biztosként. A hűtött és fagyasztott készlettétel külön tárolási és felhasználási prioritást kap. A részarány változtatása nem egyenlő a készlet elfogyasztásával. „Megerősítés” előtt csak előnézet.

**Kiegészítés:** ugyanígy működhet főtt étel 6 adagjának 2 hűtött + 4 fagyasztott szétosztása.

## 4. Shopping Suggestion – „Vegyünk tejet?”

**Referenciája:** felhasználásból becsült tejpótlási javaslat, egyérintéses „Elfogyott” / „Van még” visszajelzéssel.

**Tartalom:** terméknév, javasolt mennyiség, rövid indoklás, **becslés** státusz, döntést segítő gyorsválasz.

**Kötelező viselkedés:**
- „Hozzáadás a listához” vásárlási **tervet** hoz létre, nem készletfeltöltést.
- „Elfogyott” megerősített kifogyási jelzés lehet; „Van még” nem bizonyít pontos mennyiséget.
- „Nem most”/elutasítás ne generáljon hibát, figyelmeztető spirált vagy ismétlődő kérdést.
- Hiányzó blokk és lista esetén a Food-étkezést nem értelmezzük automatikusan otthoni termékfelhasználásként.
- Egy régi blokk nem szolgálhat bizonyítékul arra, hogy még mindig van készleten tej.


## 5. Recipe Detail – a jelenlegi Food-receptadatlap új megjelenési célja

**Referenciája:** a Recipe Recommendation kártya megerősített vizuális iránya, **alkalmazva a már létrehozott / importált, saját Food-receptek megtekintő nézetére is**.

**Jelenlegi kód ellenőrizve:** éles `codex/android-app` és TEST `integration/grapes-test-food-20261017` ág, `src/food/food-mobile.js` `openRecipe()`. A meglévő részletnézet a recept nevét és kategóriáját, opcionális képet, hozzávalók listáját és elkészítést jelenít meg. A meglévő szerkesztő összetettebb, füles folyamat; ezt a látványfrissítés **nem helyettesíti**.

**Koncepció szerinti olvasó nézet:**
1. **Nagy receptfotó** 16:9 képarányban, ha a recepthez tartozik; fotó nélkül semleges, egységes grafikus helyőrző – soha ne tegyünk véletlenszerű stockételt a felhasználó receptjéhez.
2. **Recept neve és rövid metaadatok**: kategória, elkészített adagok / darabok / szeletek (csak ha ismert), esetleges idő (csak ha rögzített vagy megbízható forrásból elérhető). Ne találjunk ki főzési időt.
3. **Tápérték összefoglaló** külön, jól olvasható sávban csak ismert / kiszámítható értékekből; legyen explicit „Nincs adat” a hiányzó értékekhez. Az alapérték / adag megnevezés legyen egyértelmű; meglévő kalória- és makró-számítási logika újrahasználata.
4. **Összetevők** kipipálható, olvasható lista **csak olvasói állapotként**, nem készletmozgásként; mértékegységekkel. Ha a Home később kapcsolódik, a készlet-jelölés külön, bizonyosságának megfelelően jelenik meg.
5. **Elkészítés** a már meglévő sortöréses, formázott instrukciók megtartásával; ha van értelmezhető strukturált lépés, lehessen lépésenként követni, de nem veszhet el a szabad szöveg.
6. **Műveletek:** egyértelmű `Étkezéshez adom` / `Naplózom` ott, ahol a jelenlegi műveleti logika támogatja; `Szerkesztés` jól látható, de másodlagos gombbal nyissa a **meglévő ötfüles receptszerkesztőt**. A Home-specifikus `Elkészítettem` és `Bevásárlólistához` funkció csak későbbi, külön implementációs lépcső, nem színlelt kész funkció.
7. **Megosztás, mentés, másolás** csak a meglévő jogosultságokkal és recepteredet-figyeléssel működjön; a saját, szerkeszthető recept és a csak olvasható YAZIO-/megosztott tartalom nem kaphat megtévesztő „Szerkesztés” gombot.

**Alapelv:** a Home receptajánlójának kártyája és a Food receptadatlapja egy közös Grapes-vizuális rendszer két különböző nézete: a Home megmutatja, **miért érdemes ezt választani**, a Food megmutatja, **hogyan kell elkészíteni és naplózni**. Nem építünk második receptadatbázist.

**Megvalósítási védelem:** kizárólag későbbi célzott UI-PR a PROD és TEST elkülönítésével; a jelenlegi receptverziózás, tápérték, kép, importálás, összetevők, elkészítés, öt fül, mentések és Food-napló integritása regressziótesztet kapjon. A jelen dokumentációs PR ezt **nem implementálja**.

## 6. Közös komponensrendszer

| Elem | Standard | Megjegyzés |
| --- | --- | --- |
| Alap háttér | `#090E14` | Brand Guide mobil cél |
| Kártya | `#101821` | Finom `#243343` keret |
| Emelt panel | `#17222E` | Nem versenyezhet fő CTA-val |
| Interaktív akcentus | `#3BDCF2` | Teljes kitöltés esetén sötét szöveg |
| Másodlagos szöveg | `#94A5B8` | 13–14 px lehetőleg, ne essen túl alacsonyra |
| Jelentések | success `#47D89B`, warning `#F2B84B`, danger `#FF7083` | Nem minden pozitív állítás megerősített; a szín önmagában kevés |
| Gomb / touch | elsődleges 48×48 px minimum | Kézben, egy kézzel kezelhető |
| Kártya / fotó | 16 px körüli sarok; 16:9 kép vagy kompakt 1:1 thumb | Egy kártyán egy fő döntés |
| Ikonok | meglévő mobil stroke ikonrendszer, 24×24, 1.8 stroke | ❄️/🧊 helyettesíthető végleges vektorokkal |
| Fény/glow | csak indokolt aktív rész, visszafogott | Ne legyen neon minden panelen |

**Hitelességi nyelv:** az „Ellenőrizd”, „Valószínű”, „Megerősítve” szavak nem cserélhetők fel. Elavult és hiányos adat külön is jelezhető. A figyelmeztetés legyen közérthető és cselekvéshez kötött.

**Írásmód:** „Hűtő”, „Fagyasztó”, „Mentés a receptjeim közé”, „Hozzáadás a bevásárlólistához”, „Elkészítettem”, „Elfogyott”, „Van még”; magyar, rövid, közvetlen, nem számonkérő.

## 7. Elfogadási ellenőrzőlista a későbbi UI implementációhoz

- **320/360/390/412 px:** mobil szélességeken nincs vízszintes túlcsordulás, magyar felirat nem vágódik le.
- **Kontraszt és szövegméret:** normál szövegre legalább 4,5:1 cél, nagy szövegre és lényeges grafikai elemre 3:1 cél; változó betűméret és TalkBack.
- **Vezérlés:** aktív, disabled, loading, hiba, visszavonás; nem színtől függő állapot.
- **Adathiány:** nincs blokk, nincs vonalkód, nem ismert tárolás, ismeretlen lejárat, hiányzó recept-fotó; minden esetben használható marad.
- **Váratlan események:** már kétszer rögzített blokk, azonos étel két Food-fiókban, offline vagy szinkronütközés; nincs kettős levonás.
- **Élelmiszerbiztonság:** felbontás, fagyasztás, kiolvasztás, tény vs becsült lejárat szétválasztása.
- **Nem összekeverendő:** TERVEZETT vs MEGERŐSÍTETT ESEMÉNY vs BECSÜLT vs ISMERETLEN.
- **Cél és monetizáció:** ingyenes alapfolyamat legyen hasznos; a prémium ne kötelező UX-korrekció legyen.

## 8. Nyitott csiszolási pontok (review)

1. A Goal Card legyen inkább célcsoportokon belüli 1–2 soros választó, vagy egyszerre négy teljes kártya?
2. Receptkártyán az elsődleges gomb „Recept megnyitása” vagy „Főzzük meg”? A mentés másodlagos ikon vagy szöveges gomb?
3. A Storage Split csúszkához milyen finom léptetés kell: 50 g, 100 g, darab, illetve pontos mező?
4. A Shopping Suggestion csak bevásárlási pillanatban kérdezzen, vagy fogadjon minimális, ritka háttérértesítést is?
5. Milyen szöveges bizonyossági jelölések a legérthetőbbek: „Biztos”, „Becslés”, „Ellenőrizendő” vagy hosszabb magyarázat?

6. A Food receptadatlapján melyik legyen az elsődleges művelet: „Étkezéshez adom”, „Elkészítem”, vagy a meglévő elérhető művelet?\n7. Mutassunk-e recept-metaadatot (pl. idő), ha az hiányzik az eredeti receptből? Alapelv: ne találjunk ki értéket.\n\nEzek **nem jóváhagyott** döntések, hanem a következő közös UX-review témái.

## 9. Mi nem változik ettől?

A forrásoldali Brand Guide v1.0-rc1 továbbra is külön, nem végleges arculati dokumentáció. Ez a referencia **nem** módosítja a Food / Finance / Home implementációt, a PROD / TEST kiadásokat, Drive adatokat, telepített APK-kat és semmilyen felhasználói naplót.
