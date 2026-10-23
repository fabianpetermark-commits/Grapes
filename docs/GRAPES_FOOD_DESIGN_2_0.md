# Grapes Food – Design 2.0 / kétlépcsős arculati és UX-terv

> **Verzió:** 0.1 – TARGET / tervezet, 2026-10-19. **Csak dokumentáció, nincs alkalmazáskód- vagy kiadásmódosítás.**  
> Kapcsolódó szabvány: [Brand Guide](./GRAPES_BRAND_GUIDE.md), [Product Vision & UX Principles](./GRAPES_PRODUCT_VISION_AND_UX_PRINCIPLES.md), [Concept UI Reference](./GRAPES_CONCEPT_UI_REFERENCE.md), [UI mintalap](./GRAPES_CONCEPT_UI_KIT.html).

## 0. Termékcél és jóváhagyott ütemezési határ

**1. ütem – MOST: kizárólag dizájnfrissítés a jelenlegi Food-felépítés megtartásával.** Nem változhat a navigáció, a képernyők/szekciók sorrendje, az ötfüles receptszerkesztő, a funkciók, az adatmodell vagy a műveleti folyamatok. Csak a megjelenést (színek, tipográfia, ikonok, kártyák, képek, finom progress, térközök és kontraszt) frissítjük, a meglévő interakciók megőrzésével.

**2. ütem – KÉSŐBB: UX és felépítés újragondolása, külön jóváhagyással.** A négy tervezett Food célterület (Ma / Ételek / Receptek / Statisztika), a navigáció esetleges átalakítása és a használati folyamatok egyszerűsítése **nem törölt ötletek**, csak nem részei az aktuális implementációs körnek. Előbb egy külön, működő prototípus és UX-review szükséges. A meglévő alkalmazás alsó navigációját a második ütem sem változtathatja meg automatikusan.

A Grapes Food ne csak kalóriát és bejegyzéseket mutasson: egy pillantással legyen értelmezhető a helyzet, egy-két érintéssel elvégezhető a gyakori feladat, és a kijelölt célokat támogassa. A jelenlegi működő Food rendszert **nem írjuk újra**; a vizuális és interakciós réteget tervezzük újra.

A friss tervezés nem jelent Home funkcióbevezetést. A „Mit főzzünk?” teljes Home-alapú ajánlója későbbi projekt. A Foodból már most elérhető saját és megosztott receptek viszont új kinézetet kaphatnak.

## 1. Forrás és környezet

- PROD Android forrás: `codex/android-app`, TEST: `integration/grapes-test-food-20261017`. A `main` nem automatikusan Android-kiadás.
- Jelenlegi mobil források: `design/android-mobile-preview.html`, `src/food/food-mobile.js`, `src/food/food-data.js`; a HTML és CSS több képernyő szerkezetét is tartalmazza.
- Ellenőrzött funkciók: napi energiasáv / makrók / célok, napválasztás, 4 étkezéstípus, vízkártya, keresés, fotós **vonalkód-**beolvasás, egyéni ételek, receptgyűjtemény, képes receptadatlap, ötfüles szerkesztő és import, megosztás, YAZIO/Health kapcsolatok, statisztika, szinkron.
- A jelenlegi `openRecipe()` elsősorban cím + opcionális kép + összetevők + leírás nézetet épít, ezért jó kiindulópont a recept-adatlap átalakítására.
- A mobil CSS-ben előfordulnak 10–12 px-es interaktív feliratok, következetlen UI-hierarchia. Nem minden rendszerkomponens ugyanazt a kanonikus szabványt követi.
- A kalóriagyűrű jelenlegi markupjában SVG track/progress található, de ez önmagában nem valós vizuális QA, és nem jelenti a #42 teljes lezárását. A ringes javítás ne keveredjen ad hoc globális CSS-szel.

## 2. Későbbi, 2. ütem: lehetséges Food-navigáció (most NEM implementáljuk)

A későbbi második ütemben a Foodon belüli használati célokat esetleg négy fő helyre rendeznénk; a Grapes teljes alkalmazásának alsó navigációját **nem** cseréljük le önkényesen. **Ez a táblázat jövőbeli UX-javaslat, nem a mostani vizuális frissítés specifikációja.**

| Food nézet | Fő felhasználói kérdés | Tartalom és elsődleges művelet |
| --- | --- | --- |
| **Ma** / Áttekintés | Hol tartok ma? | Napi energiagyűrű, makrók, egyértelmű napi célállapot, étkezések, gyors naplózás; víz kapcsolódó kártya |
| **Ételek** / Keresés | Mit rögzítsek? | Egy fókuszált kereső, Kedvencek, Vonalkód, Fotó (vonalkód a képen), Saját étel; eredmények forrással |
| **Receptek** | Mit készítettem / mit mentettem? | Képes lista/kártyák, saját/megosztott megkülönböztetés, receptadatlap, meglévő ötlapos szerkesztő |
| **Statisztika** | Hogyan alakulok a célomhoz képest? | Időszűrők, energia/makró diagramok, hiányzó adatok kezelése, célok és összehasonlítások |

**Navigációs döntés nyitott:** lehet egy kis Food-alnavigáció (4 kompakt fül), vagy egy kontextuális átváltás a meglévő navigációban. Előbb a 360/390 px mintákon validáljuk; nem erőltetünk egy új második fix alsó sávot a globális nav fölé.

## 3. Képernyőtervek – vizuális célok most, használati egyszerűsítések később

### A. Jelenlegi napi áttekintés – arculat most; átrendezés csak később

- Napválasztó és dátum egységes, jól érinthető fejléccel.
- A már felülvizsgált neon-visszafogott energiaszámláló marad a fő fókusz; a kcal szám dominál, a kitöltetlen gyűrű sötét; cél vagy energiahiánynál őszinte állapot.
- Rövid, célhoz kapcsolódó információ, nem hosszú naplózásra ösztönző üzenet. Biztató, de nem büntető stílus.
- 3 közérthető makrócsík, jól olvasható számok; fehérje/szénhidrát/zsír következetes színei.
- Az elsődleges CTA a gyors „Étel hozzáadása”; a víz megmarad gyorsan elérhető, de elkülönített egységként.
- Az étkezéseket kártyás, egyértelmű hierarchiával (Reggeli / Ebéd / Vacsora / Egyéb) mutassuk.
- Receptekről rövid, kompakt belépő lehet az áttekintésben, de ne növelje feleslegesen a görgetést.
- Teljesen üres nap, hiányzó cél, naplózott részadatok és importált naplók külön állapottal.

### B. Jelenlegi ételkereső és naplózás – megjelenés most; folyamatfrissítés csak később

- Kereső előtérben, találatok azonos méretű kártyasorokkal, élelmiszernév és forrás világos hierarchiában.
- Vonalkód, fényképen látható vonalkód, kedvencek, saját étel: rövid, valós képességet tükröző szövegek.
- Rövid adagválasztás; részletes tápérték csak szükség esetén. Ismeretlen és ellenőrizetlen tápérték nem jelenhet meg 0-ként vagy hitelesként.
- Duplikált eredmények kezelésének módja és az eredet jelzése változatlan logikán alapul.
- Ne legyen kötelező külön keresési képernyőt nyitni, ha a felhasználó az étkezésből azonnali gyorshozzáadást választ.

### C. Jelenlegi receptek – egységes új dizájn most; folyamatfrissítés csak később

- A receptlista képes, hiányzó kép esetén semleges Grapes-helyőrzős; hosszú címmel sem esik szét.
- Recept-adatlap: nagy kép, cím, mértékegység/hozam, **ismert adatokból** számított kcal/makró kártya, összetevők, jól formázott elkészítés.
- Olvasáskor nagy, jól elkülönített naplózási/megnyitási akció, „Szerkesztés” külön másodlagos művelet; törlés külön, destruktív műveletként.
- A szerkesztés megtartja a meglévő öt fület: **Alapadatok · Felvétel · Összetevők · Kép · Importálás**. A fülváltás nem teszi szükségessé a hosszú görgetést. 320 px-en akár más, egyértelmű és ugyanilyen gyors navigációs forma kell.
- Recept-import, kép, összetevő-párosítás, tápértékhiány, hozamszámítás, formázott instrukciók, variánsok és megosztás megőrzendő.
- Recept-megtekintő és szerkesztő továbbra is külön UI-folyamat. A meglévő saját és családi könyvtár az egyetlen receptforrás; Home nem vezet be második receptadatbázist.

### D. Jelenlegi statisztika – arculat most; új elemzési szerkezet csak később

- All-time és időszűrők világos, horizontálisan értelmezhető navigációval.
- Átlagok, trendek, célhoz képesti haladás és diagramok; nem minden egyszerre egy hosszú listában.
- Naplózott napok számának és hiányos tápértékeknek a jól látható jelölése.
- Fő következtetés mindig 1–2 rövid mondat; ne csak grafikon, ne minősítsen személyesen.

**Fontos:** A fenti képernyőtervek kétféle ötletet tartalmaznak. Az **1. ütemben** kizárólag a meglévő UI-komponensek megjelenését egységesítjük, funkció vagy képernyőelrendezés átszervezése nélkül. Bármilyen új fő művelet, új kártyasorrend, új navigáció, kibővített ajánlás vagy új képernyőelem a **2. ütem** külön tervezési és jóváhagyási feladata. A jelenlegi, pontosan öt füles receptszerkesztő szerkezetét mindkét ütemben csak kifejezett új döntéssel módosítjuk.

## 4. Közös vizuális komponensek

A Brand Guide szerinti mobil paletta: háttér `#090E14`, kártya `#101821`, emelt felület `#17222E`, vonal `#243343`, szöveg `#F2F7FB`, másodlagos `#94A5B8`, akcentus `#3BDCF2`; szemantikus success `#47D89B`, warning `#F2B84B`, danger `#FF7083`.

**Komponenscsalád:** Module Header, Day Selector, Energy Ring, Macro Strip, Meal Card, Food Result Row, Recipe Preview Card, Recipe Detail Hero, Nutrition Summary, Ingredient Row, Step Card, Form Field, Segmented Tabs, Empty State, Status/Source Badge, Bottom Sheet, Destructive Confirmation.

Egységes sarkok, szóközök, 48 px elsődleges érintési cél, legalább 15–16 px törzsszöveg, 13–14 px lényeges kiegészítő szöveg; számok tabular-nums; ikonok a kanonikus készletből. Mindig szöveges státusz, nem kizárólag színjelzés. A túlzott glow kerülendő.

### 5/A. Első konkrét látványterv: a jelenlegi „Mai áttekintés”

[**Food Design 2.0 – Mai áttekintés, két megjelenésű statikus HTML-referencia**](./GRAPES_FOOD_DESIGN_2_0_MA_REVIEW.html).

A terv a TEST forrásban ellenőrzött elemeket és **azonos sorrendet** tartja meg: dátumválasztó; energiaszámoló és makrók + Statisztika/Napi célok; vízkártya; két friss recept + Megnyitás/Új recept; étkezések; változatlan globális navigáció. A „Korábbi stílus” gomb a jelenlegi CSS alapján készített **sematikus közelítés**, nem eredeti képernyőkép.

A véglegesítés előtti döntési pontok:
- A kalóriakör 112 px körül maradjon; csak az aktív ív kapjon nagyon finom fényt.
- A makrófeliratok és a kcal-kijelzések olvasható méretben férjenek el a meglévő kétoszlopos kártyában.
- A víz és a receptlista nem kerülhet új helyre, a meglévő műveletek nem tűnhetnek el.
- Az étkezéssorok új megjelenést kaphatnak, de sorrendjük, a nevük és a kattintási céljuk megmarad.
- A számok, étkezések, mennyiségek csak illusztratívak; a tervezési fájl nem kapcsolódik valós Food-adathoz.

**Státusz: TARGET / felhasználói vizuális review-ra vár.** A HTML nem futó prototípus, gombjai az összehasonlító módváltáson kívül nem funkcionálisak.

## 5. Kétlépcsős review és megvalósítás

**Most, 1. ütem:** a JELENLEGI Food-nézetekre készítünk előtte/utána dizájnmintákat, a tényleges navigáció és szekciósorrend megtartásával: napi áttekintés, ételkeresés/naplózás, receptlista/adatlap, ötfüles szerkesztő, statisztika. Az azonos Brand Guide-komponensek (kártyák, ikonok, progress, gombok, képek) vizuális következetességét vizsgáljuk.

**Később, 2. ütem:** külön UX-prototípuson megvizsgálhatjuk az új Ma / Ételek / Receptek / Statisztika belső navigációt, a tartalmi hierarchiát és a folyamatok rövidítését. Ez a terv **megmarad**, de nem része a mostani dizájnfrissítésnek.

**Kizárólag az 1. ütemhez jóváhagyott, a jelenlegi felépítést megtartó képernyőtervek után**: izolált TEST UI PR és célzott regressziós tesztek, majd készülékes review, utána külön engedéllyel az éles ág arculati frissítése. A 2. ütem külön döntés, külön PR, külön teszt és release-engedély. A Product Vision / Brand Guide PR nem jelent automatikus UI merge-et.

## 6. Kötelező regressziós kapuk

- 320/360/390/412 px; növelt betűméret, Android safe-area, TalkBack és reduced-motion.
- Napi energia 0/50/100%, cél nélkül, hiányzó tápértékkel, cél fölött; részleges Food-adat.
- Ételkeresés: online/offline, kedvencek, saját, duplikátum, forrás, vonalkód, fotós vonalkód.
- Recept létrehozás/szerkesztés/mentés/törlés/variáns, képek, 5 fül, import, főzési leírás, tápérték- és hozam-számítás.
- Étkezésnapló rögzítés/szerkesztés/törlés, napi dátumváltás, megosztás.
- Health Connect, Samsung, YAZIO, víz, szinkron, Drive, backup/export (és azok hibás / hiányos adatai) funkcionálisan változatlanok.
- TEST/éles csomag, signing, frissítési csatorna és adatok teljes elkülönítése.

## 7. Nyitott, későbbi UX-döntések (2. ütem)

1. A Food négy fő funkciója hogyan navigálható legjobban egyetlen appon belül a már meglévő globális alsó navigáció mellett?
2. A `Ma` nézeten az étkezések vagy a receptek kapjanak előbbre helyet? Javaslat: étkezések; a receptek külön nézetbe is kerülnek.
3. A receptadatlap melyik elsődleges művelete mutasson főszerepet a jelenlegi kód által ténylegesen támogatott lépések mellett?
4. Mit mutassunk kiemelten a statisztikában: haladás a cél felé, tendencia vagy összehasonlító tápanyagok?

**Az aktuális munkafeladat kizárólag az 1. ütem: dizájn, változatlan Food-felépítéssel.** A 2. ütem UX-ötletei megmaradnak mint későbbi irány, de végrehajtásukhoz új, kifejezett jóváhagyás kell. A dokumentáció csak terv; nem állítja, hogy a Food UI 2.0 már működik vagy tesztelve van.
