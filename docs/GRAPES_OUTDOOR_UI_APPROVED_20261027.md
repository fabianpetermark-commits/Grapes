# Grapes Outdoor / Növények – elfogadott UI és testreszabható listák (2026-10-27)

**Státusz: APPROVED DESIGN / INTERAKTÍV UI-MINTA.** A felhasználó a 2026-10-26/27-i Outdoor interaktív képernyő és a két új bővíthető űrlapmező bemutatása után: **„Teljesen jó. Mehetünk tovább”**. Az elfogadás **nem** jelenti Android/TEST/PROD implementálást vagy éles időjárás-integrációt.

## Korábbi elfogadott Outdoor-elv
- Grapes v1.2 sötét/finom cyan keret, egy képernyőcím a hat egyforma, felirat nélküli navigációs ikon alatt: **Növényeim / Növénykatalógus / Aktuális teendők / Napló / Új növény / Beállítások**, egységes Health-fogaskerékkel.
- Növényeim és Növénykatalógus közvetlenül elérhető, ugyanazon fajhoz (pl. több csilipaprika) **külön-külön saját növénypéldány** rögzíthető saját névvel, hellyel, fotóval, locsolási és megfigyelési naplóval.
- Magyar/angol (és ahol van latin) név szerinti, végül nyílt és jogtisztán felhasznált képekkel támogatott növénykatalógus.
- Az időjárás fagy/hőség/eső hatásai **az egyes növények konkrét teendőiként és veszélyjelzéseiként** jelennek meg az Outdoor főoldalán, nem külön, domináns időjáráskártyában. Valódi időjárásadat elérésének ellenőrzése későbbi integrációs feladat.
- Aktuális teendők növényenként és időszakonként: veszélyjelzés, locsolás, teleltetés, szüret, ellenőrzés stb. Megjelölés teljesítettként, **1/3/7 napos halasztás** és újraaktiválás; fontos eseményeknél értesítés csak engedéllyel és helyes ütemezéssel.
- Locsolási/megfigyelési napló, személyes növényfotók; egyetlen Otthon fogalmához igazodó családi közös adatok. Quick Action: Locsolás / Teendő / Napló + kiemelt Új növény.

## Felhasználó által kért utolsó kötelező módosítás
A szabad szöveges két űrlapmezőt **bővíthető legördülő mezőre** cseréljük:
1. **Teendő létrehozása: Feladat** mező = ismét használható feladattípusok listája (példák: Locsolás, Metszés, Átültetés, Tápoldatozás, Teleltetés, Szüret, Ellenőrzés) + **kis + gomb a mező mellett**, saját feladattípus megadására.
2. **Új növénypéldány és szerkesztés: Hely** mező = ismét használható helylista (példák: Terasz, Erkély, Kert, Magaságyás, Padlás) + **kis + gomb a mező mellett**, saját hely felvételére.
3. Új opció felvétele után **azonnal listába kerül és automatikusan kijelölődik**; legközelebb is választható, duplikátumellenőrzés név/ékezet/whitespace alapján. Üres elemet ne vegyen fel; bezárás/Mégse legyen. A felhasználó által létrehozott opciókat az **aktív Otthonhoz** kapcsolva kell tartósan menteni, nem csak az űrlap aktuális példányához vagy eszközhöz; szerepek és jogosultságok szerint szinkronizálni. A demó ezt memóriában valósította meg.
4. A **nagy, alsó külön + gomb Új növény** funkciója változatlan; a kis mező melletti + nem indít új növényt, hanem új listaválasztékot ad.
5. Feladattípus és adott növény külön mező; szabad megjegyzés továbbra is lehetséges.

## Élesítési határ
Jóváhagyás csak UI/UX-ra vonatkozik: valódi katalógus, időjárás, évszakos és locsolási döntési logika, értesítések, személyes képtárolás, Supabase/háztartás RLS, adatok migrációja és események tartóssága külön ellenőrzést igényel. A régebbi `design/references/approved/plants-widget.html` referenciát a részletekkel hozzá kell igazítani, mert a chatben elfogadott prototípus önálló. Nincs automatikus merge vagy APK-kiadás.

**Következő áttekintés:** központi Grapes Beállítások.
