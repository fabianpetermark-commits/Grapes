# Grapes – Product Vision & UX Principles

> **Verzió:** v0.2, 2026-10-19. **Státusz:** TARGET / közös tervezet; nem éles funkcióleírás és nem végleges szlogenjóváhagyás.  
> **Kapcsolódik:** [Grapes Brand Guide](./GRAPES_BRAND_GUIDE.md), [Concept UI Reference](./GRAPES_CONCEPT_UI_REFERENCE.md), [vizuális mintalap](./GRAPES_CONCEPT_UI_KIT.html).

## 1. Miért létezik a Grapes?

**Javasolt márkaígéret: Kevesebb adminisztráció. Okosabb mindennapok.**

**Belső vezérelv: Ne a felhasználó dolgozzon az alkalmazásért. Az alkalmazás dolgozzon a felhasználóért.**

A Grapes nem pusztán naplózó, tároló vagy különálló eszközök gyűjteménye. A felhasználó céljaihoz igazodva, az általa engedélyezett és már rendelkezésre álló információkból igyekszik kézzelfoghatóan jobb döntéseket, kevesebb ismétlést és gyorsabb ügyintézést kínálni.

Eredete az E-book modul; az alapelv fokozatosan alkalmazható Food, Pénzügy, Home és más modulok esetében is. **Nem minden modulnak kell mesterséges intelligenciát használnia.** Az egyszerű, pontos, automatizált összeköttetés sokszor hasznosabb.

## 2. Felhasználói ígéret

- Már kevés adattal legyen használható, és minél előbb mutasson fel egy konkrét eredményt.
- A modulok között ne kelljen ugyanazt az információt újra megadni; megosztás csak engedéllyel.
- A felhasználó rendszeres adminisztráció nélkül is kaphasson segítséget, megfelelő bizonytalanságjelzéssel.
- A Grapes javasoljon és magyarázzon; ne büntessen kihagyott napokért, ne követeljen naplózási sorozatot.
- Az eszköz kézben tartása ne legyen fontosabb, mint a megoldott élethelyzet.

**A nulla kötelező napi interakció érvényes használati mód.** A nullainterakciós működés nem jogosít fel kitalált vagy engedély nélküli automatikus adatváltoztatásokra.

## 3. UX-szerződés minden modulhoz

### 3.1. Cél az adatbevitel előtt

A használat első kérdése – ahol releváns – ne csupán az legyen, hogy „mit szeretnél rögzíteni?”, hanem hogy **„miben szeretnél segítséget?”**. Példa: fogyás, tudatosabb étkezés, kevesebb kiadás, kevesebb pazarlás, olvasás és tanulás.

A cél legyen módosítható; a rendszer ne erőltessen egyetlen életvitelt vagy normatív ítéletet.

### 3.2. Progresszív részletesség

Alapfolyamat: egyértelmű javaslat és lehetőleg 1–2 érintés. A részletes mértékegység, mennyiség, forrás és korrekció csak indokoltan jelenjen meg. Összetett esetekre legyen „Részletek” vagy „Pontosítás”, de ne kelljen mindig végigmenni rajta.

Minden lényeges művelet legyen visszavonható vagy korrigálható.

### 3.3. Egy adatból több haszon

A közös étkezésből származó recept egyszer álljon elő; személyes Food-naplóba mindenki **külön beleegyezéssel** és saját adaggal vegye át. Ugyanazt a főzési eseményt ne vonjuk le kétszer a háztartási készletből.

A blokk pénzügyi bizonylat; az élelmiszer-tételek helyes felismerés után készletinformációk is lehetnek. A bevásárlólista viszont csak szándék, nem vásárlási bizonyíték.

### 3.4. Őszinte becslés

A Grapes külön tárolja és kommunikálja a **TERVEZETT**, **MEGERŐSÍTETT ESEMÉNY**, **BECSÜLT** és **ISMERETLEN** adatokat.

A megerősített blokk egy vásárlást bizonyíthat, **de nem garantálja a jelenlegi fizikai készletet**. A Food-naplóban szereplő étel nem bizonyítja, hogy otthonról származott. A lejárati becslés nem egyenértékű a csomagolás tényleges fogyaszthatósági dátumával.

A becslés ne könyvelődjön észrevétlenül tényként, bizonytalansága idővel nőhet; hiányzó forrás esetén ne mutassunk hamis precizitást.

### 3.5. A megfelelő pillanatban segítsen

Nincs kötelező napi készletkérdőív. Kérdést akkor tegyünk fel, ha egy konkrét döntést tesz jobbá: receptválasztás, vásárlási javaslat, főzés vagy készletkorrekció. Egyérintéses lehetőségek: „Elfogyott”, „Van még”, „Elkészítettem”, „Hűtő”, „Fagyasztó”.

A figyelmeztetés ne legyen sűrű, ne szégyenítsen, ne használjon hamis sürgetést.

### 3.6. Biztonság és kontroll

Felhasználói engedély és megfelelő szerepkör nélkül nincs személyes napló-, egészség- vagy pénzügyi adatmegosztás. A közös Home készlet- és főzési eseményei elkülönülnek a személyes Food-adatoktól.

Élelmiszerbiztonság: a tárolási állapot, a felbontás, a fagyasztás és a kiolvasztás számít. A fogyaszthatósági idő és a minőségmegőrzés nem keverhető; a becsült dátum nem garancia. A fagyasztást nem feltételezzük pusztán a vásárlás idejéből.

### 3.7. Akadálymentes, következetes élmény

A vizuális szabvány a [Brand Guide](./GRAPES_BRAND_GUIDE.md): Grapes-cián `#3BDCF2`, sötét, nyugodt felületek, olvasható méretek, világos hierarchia, visszafogott glow. Állapotot ne csak szín vagy ikon jelezzen; legyen szöveges jelentése is. A tap targetek és kontraszt megfelelősége nem opcionális.

## 4. A Home példa, nem kizárólagos termékirány

A jövőbeli Home-ban az élelmiszerkészlet nem öncélú napló. A bevásárlólista, a Pénzügy és a Food visszafogott összekapcsolása alapján a rendszer segíthet: „Mit főzzünk?”, „Mit vegyünk?”, „Mit használjunk fel előbb?”.

Külön kezelendő: alapanyag, konkrét bolti termék, vásárlási/készlettétel, készétel és személyes elfogyasztott adag. Nyers alapanyag **főzéskor** használódhat fel; a később elfogyasztott adag már a készételből csökken. A hűtő/fagyasztó megosztás gyors és ellenőrizhető legyen. Mindez koncepció, nem jelenlegi éles képesség.

## 5. Monetizációs elvek

Az alapélmény önmagában is megbízható, használható és kényelmes legyen. Prémiumként további tényleges érték – mélyebb személyre szabás, fejlettebb tervezés vagy időmegtakarítás – adható, **nem** mesterségesen létrehozott akadály megszüntetése.

Az érzékeny személyes, étkezési és egészségügyi adatok reklámcélú értékesítése nem része a tervezett üzleti modellnek. Fizetési és hozzáférési döntéseket külön termék- és adatvédelmi review előzze meg.

## 6. A siker mércéje

Az adatbevitel darabszáma és a képernyőidő nem elsődleges sikerindikátor. Fontosabb:

- **Első érték ideje:** hány lépés és mennyi idő az első hasznos receptig / listáig / elemzésig?
- **Megspórolt munka:** hány ismételt mezőt és fölösleges érintést váltottunk ki?
- **Javaslat haszna:** a felhasználó elfogadja, módosítja vagy figyelmen kívül hagyja az ajánlást, és miért?
- **Bizalom:** mekkora a hibásan biztosnak feltüntetett becslések aránya?
- **Elmaradó naplózás tűrése:** használható-e a funkció részleges adatok mellett?
- **Felhasználói kontroll:** sikerült-e az adatok és becslések javítása, exportálása, leválasztása?

Mérés csak megfelelő hozzájárulás és adatminimalizálás mellett; a mérés nem írhatja felül az UX-célokat.

## 7. Fejlesztési kapu – 7 kérdés

1. Melyik valós problémát oldja meg?
2. Mit nyer a felhasználó már az első alkalommal?
3. Mennyi manuális munkát kér, és csökkenthető-e?
4. Elérhető-e az eredmény meglévő, engedélyezett információkból?
5. Használható-e hiányos, elavult vagy bizonytalan adatokkal?
6. Magyarázható és javítható-e a kimenet, biztonságos-e a változtatás?
7. Mérhető-e a felhasználói haszon képernyőidő és adatbeviteli mennyiség helyett?

Ha az erőfeszítés meghaladja az érzékelhető hasznot, újratervezés szükséges.

## 8. Referenciák és státusz

A [Concept UI Reference](./GRAPES_CONCEPT_UI_REFERENCE.md) öt korábbi közös beszélgetésből származó mintát rögzít: **Goal Card, Recipe Recommendation, Storage Split, Shopping Suggestion, Food Recipe Detail**; a [statikus HTML-mintalap](./GRAPES_CONCEPT_UI_KIT.html) közvetlenül megnyitható vizuális referencia.

A minták **újrarajzolt koncepciók** a chatben kialakított komponensek alapján; nem az eredeti chat UI exportjai, és nem működő Grapes-képernyők. A szövegek, dátumok, mennyiségek illusztratívak.

**CURRENT** = meglévő forrás; **TARGET** = tervezett szerződés; **VERIFIED** = tesztelt; **APPROVED** = külön jóváhagyott. Ez a dokumentum egészében **TARGET**.
