# Grapes UI és éles kiadási felmérés — 2026-10-28

## Rövid döntés

**Jelen állapot: NO-GO éles kiadásra.** A forráskód egyes moduljai már működnek, de az elfogadott UI és a ténylegesen telepített APK közötti egyezés nincs bizonyítva, és több elfogadott képernyő még csak részben van átvezetve.

Ez a lista a forráskód állapotát, a jóváhagyott UI-specifikációkat és a még hiányzó telefonos bizonyítékokat külön kezeli. A forrásban megtalálható modul nem tekinthető késznek pusztán attól, hogy egy JavaScript-fájl létezik.

## Modulonkénti állapot

| Terület | Forrásban lévő működés | Elfogadott UI-hoz képesti hiány / kapu |
|---|---|---|
| Kezdő | Valódi widgetekre épülő kezdőképernyő és gyorsműveletek | A tényleges APK-n 320/360/390/412 px vizuális egyezés és a kedvencek tartóssága újraellenőrzendő. |
| Home / Egységes Otthon | Bevásárlás, Készlet, Javaslatok egy képernyőn; helyi v1 eseménynapló | A helyi működés nem jelent családi felhőszinkront. Az elfogadott vizuális prototípussal összehasonlított telefonos PASS még hiányzik. |
| Health / Food / Víz | Valós Food/Víz vezérlők és Health áttekintő; meglévő Health Connect importútvonalak | A Health belső hatikonos navigációt a globális sáv helyett kell használni. Samsung Health engedélyezés és tényleges készülékes adatszinkron külön bizonyítandó. |
| Tools | E-book könyvtár/olvasó és QR-szerkesztő már létezik | A régi E-book/QR választócsempék nem felelnek meg a jóváhagyott Tools főoldalnak. A PR #219 a közvetlen E-book-folytatást és QR-widgetet vezeti át. |
| Outdoor / Növények | Helyi növénypéldányok, fotó, katalóguskeresés, napló, teendő, Open-Meteo előrejelzés | A modul korábbi UI-ja nem egyezett a jóváhagyott hatikonos nézetekkel. PR #219 hozzáadja a saját navigációt, külön Napló/Beállítások nézetet és növényenkénti időjárási ellenőrzéseket. A Feladat/Hely bővíthető választékok és háztartás-szintű szinkron még hiányzik. |
| Finance | Valós Tranzakciók, Megtakarítások, Előrejelzés, Import nézetek; az ötikonos navigáció megőrizve | A főmodul régi köztes csempéje felesleges. PR #219 közvetlenül a valódi Finance nézetre navigál, és browser teszteli a korábban jelzett fehér képernyős útvonalat. Telefonos bizonyíték még nincs. |
| Beállítások | A jóváhagyott vizuális irány részben átvezetve; Drive állapotnál valós ellenőrzés | A képernyő megjelenése önmagában nem bizonyítja a PIN, fiók, adatkapcsolatok, export/restore és jogosultság működését. Funkciónkénti teszt szükséges. |

## Navigációs szabály

- A globális hatikonos sáv a főképernyőkön marad.
- A Health és Outdoor saját, hatikonos modulnavigációja átveszi a helyét az adott modulon belül.
- Az E-book könyvtár/olvasó/átvitel részletes képernyőin a globális sáv nem ismétlődik.
- A Tools főoldalon nincs külön E-book/QR választómenü: a két tényleges widget azonnal látszik.
- A Finance főmodul közvetlenül a valódi Finance képernyőre nyit, nem egy egycsempés köztes oldalra.

## Biztonsági és adatmegőrzési korlátok

- A Home helyi v1 eseménynaplója és Finance tranzakciói UI-átvezetés miatt nem törölhetők, nem migrálhatók automatikusan és nem írhatók felül.
- A „Megvettem” nem válhat automatikus készletbevétellé; ismeretlen mennyiség nem jelent bizonyított hiányt.
- A növények, Food, Health és Finance személyes adatai nem keverhetők az Otthon megosztott állapotába.
- A TEST Supabase projekt nem használható PROD-kiadáshoz. PROD séma módosítása vagy valódi adatírás külön jóváhagyás nélkül tilos.
- Az időjárásból származó teendő csak ellenőrzött előrejelzésből jöhet; automatikus locsolás vagy kitalált növényigény nincs.

## Éles kiadás előtti kötelező kapuk

1. [ ] A PR #219 és az összes releváns unit/browser/Android build ellenőrzés PASS.
2. [ ] A Kezdő, Home, Health, Tools, Finance, Outdoor és Beállítások végleges forrásának 320/360/390/412 px ellenőrzése.
3. [ ] A régi kétadatteres Home és a régi Tools/Finance csempék nem érhetők el a normál fő navigációból.
4. [ ] Az új, aláírt TEST APK pontos csomagazonosítója, verziókódja, SHA-256 hash-e és aláíró tanúsítványa ellenőrizve.
5. [ ] A TEST APK meglévő telepítés fölé telepítve adattörlés nélkül; az alkalmazás indulása és bejelentkezése telefonon igazolva.
6. [ ] A Home, Tools, Finance és Outdoor valós műveletei telefonon ellenőrizve; a helyi mentések megmaradnak.
7. [ ] A Samsung Health/Health Connect engedélyek és adatszinkron valós készülékes eredménnyel igazolva.
8. [ ] A Supabase családi A/B hozzáférés, offline outbox, konfliktus és fiókváltás a cél-APK-val ellenőrizve; PROD adatbázis változatlan.
9. [ ] Backup/export/restore, PIN/Auth, Google Drive és adatkezelési regressziók PASS.
10. [ ] A felhasználó a telefonos ellenőrzés után külön kiadási GO-t ad.

## Amit ez a PR nem állít

- Nem állítja, hogy a jelenlegi telefonra telepített APK tartalmazza a legfrissebb forráskódot.
- Nem állít valós telefonos PASS-t.
- Nem állít kész, teljes Outdoor-háztartásszinkront vagy kész Samsung Health PROD-integrációt.
- Nem hoz létre PROD kiadást, nem változtat PROD Supabase-sémát és nem végez éles adatírást.

**Következő munkasorrend:** elfogadott UI-kód és navigáció → zöld regresszió → friss aláírt TEST APK → tényleges telefonos próba → csak ezután éles kiadási döntés.