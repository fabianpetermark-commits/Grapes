# Grapes Home — EGYSÉGES OTTHON — elfogadott koncepció (2026-10-26)

**Státusz: FELHASZNÁLÓ ÁLTAL JÓVÁHAGYOTT UX / BRAND CÉLÁLLAPOT.**
A 2026-10-26-i beszélgetésben a felhasználó a chatben kipróbált **„Grapes Home – Egységes Otthon”** interaktív prototípusra kimondta: **„Na ez, ez már az amit kitaláltunk közös dizájn alatt. Tökéletes!”**

Ez az irány **felülírja** az ugyanaznap korábban készült kétadatteres `Saját / Közös családi` és az egymást kizáró `Bevásárlás / Készlet / Javaslatok` nézetválasztós Home UX-et. A `design/references/candidates/home.html` korábbi dual-scope prototípus **NEM az elfogadott végleges Home-képernyő**. Át kell rajzolni az ebben a dokumentumban rögzített jóváhagyott chat-prototípushoz; addig történeti / lecserélendő jelölt.

## 1. Elsődleges felhasználói modell

**Egy otthon, egy készlet, egy bevásárlólista, egy javaslatforrás.** A Home-ban nincs „Saját” és „Közös családi” mód, kapcsoló vagy külön adattár.

- A Grapes Home használója egy **aktív Otthont** kezel. Első használatkor legyen egy alapértelmezett saját tulajdonú Otthona. Nem szükséges kötelezően családot létrehoznia ahhoz, hogy a listát/készletet használja.
- Az Otthon **opcionálisan megosztható** meghívással, jogosultságokkal. A meghívottak ugyanazon Otthonazonosítóhoz rendelt adatot olvassák/módosítják, nem szinkronizált „másolatot” vagy két külön listát.
- **A megosztás beállítás / jogosultság, nem második adatmodell vagy képernyő.** A jobb felső, résztvevőszámot mutató gomb az Otthon megosztását, meghívását és szerepeit kezeli; a főoldalon csak tömör státusz (például `2 fő`) látható.
- Egy fiók személyes Food/Water/Health/Finance/E-book adatai nem válnak ettől közössé. Az Otthon közös adatai kizárólag a Home határain belül kezelendők, és csak meghívott jogosult felhasználó férhet hozzá.
- Meghívás, kilépés, szerepváltozás, fiókváltás, offline visszajátszás és tulajdonosváltás adat- és jogosultság-ellenőrzött legyen. Másik fiók tartalma ne maradjon a régi DOM-ban, memóriában vagy cache-ben.

## 2. Jóváhagyott kezdeti képernyő — **NINCS főoldali tabváltás**

A felhasználó a Home főmodul ikonjára nyomva **azonnal** egy görgethető, adatsűrű, widgetes áttekintőt kap:

1. **Felső navigáció:** közös Grapes Brand Guide **v1.2**: 6 egyforma, felirat nélküli ikon egy sötét kapszulában; Home aktív. Egyetlen jól olvasható `Otthonunk` (szabadon átnevezhető) cím; mellette rövid megosztás/családtaglétszám gomb. Nem új globális shell, hanem az összes modulban közösen használt.
2. **Tömör állapotsor:** valós **bevásárolandó tételszám**, **készletben lévő termékszám**, **aktív javaslatszám** egy sorban. Nincs marketingmondat, ismétlődő hero vagy magyarázó kártya.
3. **Bevásárlás widget:** azonnal látható, soronként konkrét név/mennyiség és nagy, működő `Megvettem` gomb; `+ Listaelem` gyorsfelvétel; a már megvett tételek alapból összecsukva, szükség esetén visszavonhatók.
4. **Készlet widget:** konkrét élelmiszer/mennyiség adatok kompakt, legfeljebb kétoszlopos kártyákon; `+ Készlet` gyorsfelvétel. Nincs előtte „Készlet” választóképernyő. Nem lehet tesztszámokkal helyettesíteni a valós készletet.
5. **Javaslatok widget:** igazolt hiány és csak becsült utánpótlási igény vizuálisan elkülönítve; `+` manuális listára vétel, `×` elvetés. Nem automatikus vásárlás vagy tetszőleges kitalált ajánlás.
6. **Alsó Home Quick Action:** három, valódi kontextuális műveletet/jumpot adó feliratos ikon ugyanabban a kapszulában, plusz külön kerek főakció (az elfogadott prototípus: Bevásárlás / Készlet / Megosztás, külön `+` listaelem). A quick action nem globális navigáció és nem takarja az utolsó widgetet.

Nincs **Saját/Közös választó**, nincs **Bevásárlás/Készlet/Javaslatok** második navigációs csík, nincs két nagy, azonos aloldalra vezető hub-csempe, nincs folyamatosan kinyitott csatlakozás/létrehozás űrlap, és nincs fölösleges `Home / Háztartás` ismétlés.

A teljes felület a Health/Finance/Tools/E-book közös Grapes arculatát használja: `#090E14` háttér, `#101821` kártya, `#3BDCF2` csak diszkrét aktivitás/ikon/peremfény; ~19px kártyasugár, 22–24px főcím, értelmes 14–16px tartalom, finom és csak rövid neonperem, nagy érintési felületek. 320/360/390/412 px-en vizuális kontroll.

## 3. Jóváhagyandó / védendő üzleti szemantika

**A vizuális prototípus elfogadása nem automatikus jóváhagyás minden mögöttes eseményszemantikára.**

- Bevásárlóelem `Megvettem`: megvásárlás külön esemény, amelyet meg lehet erősíteni. A korábbi M2 Home eseményszerződés szerint a sima pipa **nem** írhat automatikusan készletet. A prototípus opcionális `Készlet növelése` jelölőjét valódi UI-ban **külön kifejezett készletbevétel / ellenőrzött mennyiség / deduplikáció** alapján kell implementálni. Bizonytalan mennyiségnél nincs készletnövelés. A megvásárlás visszavonása nem törölhet visszamenőleg jóváhagyott készletet.
- Javaslat elfogadása manuális; a becslés csak egyértelmű `Becslés` jelöléssel, az `×` elvetés/archiválás (nem a felhasználói vásárlás vagy készlet törlése).
- Védett, fiókhoz hitelesített Home-írások, jogosultság szerinti szerepek, idempotens/ütközésbiztos CAS és offline outbox kötelező. Soha nincs csendes last-write-wins és idegen személyes profilból való adatbeolvasás.

## 4. Adatmodell-átállás: KÜLÖN fejlesztés

A korábbi [Home v42 #175](https://github.com/fabianpetermark-commits/Grapes/pull/175) a `Saját/Közös` kétadatteres képernyőt javította — **a kiválasztott UX szempontjából meghaladott állapot**. A PR technikai javításai (aszinkron route, natív Auth, owner-határok, tesztek) újrahasznosíthatók, de a kapcsolós UI **nem** minősül elfogadott célállapotnak. **Nem szabad csupán CSS-sel elrejteni a két tárolót.**

A végleges működéshez:
- A natív Grapes Auth felhasználóhoz rendelt, megosztható, egyedi `home_id` / `household_id` határon kell a közös Home készlet/lista/javaslat állapotának megmaradnia.
- A jelenleg elkülönített saját Home és családi Home TEST adatokat **előbb felderíteni, menteni, ütközések és átfedő elemek esetén felülvizsgálható, explicit átvezetési tervvel egyesíteni** kell. Két irányból érkező adatot tilos csendben összeadni vagy felülírni; régi adat törlése nélkül, idempotens, rollback-képes migráció.
- A PROD v33 fölötti kiadásnál nem használható a TEST backend, signing, OAuth callback vagy csomagazonosító. A céldizájn jóváhagyása **nem PROD GO**.

## 5. Elfogadási kritériumok

- [ ] Belépéskor **egyetlen otthon** azonnal megjeleníti mindhárom valós widgetet és a számlálókat, Saját/Közös és második tab nélkül.
- [ ] Termékfelvétel, Megvettem, egyedi készlet-bevétel, undo, javaslat-elfogadás/elvetés és nyitható történet működik, megfelelő jogosultsággal.
- [ ] Egy kezdetben egyszemélyes Otthon megosztásakor másik Grapes-fiók ugyanazt látja; A→B→A, frissítés, offline, CAS-konfliktus, role/viewer, távoli RLS PASS.
- [ ] A személyes Food/Health/Water/Finance/E-book változatlanul saját; se automatikus Food napló/Finance bizonylat átírás, se felhasználói adatvesztés.
- [ ] Hatikonos v1.2 shell + kompakt valós Home widgetek + Quick Action tényleges Androidon; 320/360/390/412px, Android Back, TalkBack, safe-area ellenőrzés.
- [ ] A meglévő PROD APK fölé azonos hiteles signing certtel, csak alapos regresszió után telepíthető; külön felhasználói készülékes jóváhagyás, explicit release-döntés.

**Állapot e dokumentum létrehozásakor:** Design APPROVED; valódi alkalmazásba átvezetés, adatmodell migráció, tesztek és PROD kiadás **még nem történt meg**.
