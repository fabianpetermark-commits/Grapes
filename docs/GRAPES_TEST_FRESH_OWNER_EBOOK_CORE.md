# Grapes TEST – E-book friss, fiókonkénti helyi tárhely (alap)

**Állapot: Draft, #148-ra épül; nincs kiadás, merge vagy APK.**

## Mi készült el?

- A `src/ebook/grapes-test-fresh-ebook.js` natív Grapes TEST Auth subjectből nyit kizárólag saját, új helyi E-book könyvtárat a korábbi, A/B/A-n bizonyított `grapes-test-local-owner-v1-<subject>` IndexedDB partícióban.
- Az explicit helyi fájlválasztóval később megadott **új** EPUB, PDF, TXT, FB2, MOBI, AZW, AZW3, CBZ, CBR fájlokra van felkészítve (legfeljebb 80 MiB/fájl). A könyvbájtok külön, véletlen azonosítójú, felhasználóhoz tartozó helyi rekordban maradnak. A katalogizált metaadat és olvasási haladás külön `ebook-library-current` CAS-revíziós dokumentumban van.
- Egy könyv fájltartalmát csak akkor lehet visszaolvasni, ha a saját, ellenőrzött könyvtár katalógusa is hivatkozik rá; idegen fájlazonosító és Drive-azonosító nem szolgálhat bemenetként.
- Késleltetett műveletnél, fiókváltásnál, kijelentkezésnél és elavult CAS-revíziónál az adatút lezár. Nincs automatikus konfliktus-felülírás.
- A korábbi E-book Drive-fájlok, az `ebook-mobile-library.js`, a Drive account, az olvasási haladás közös localStorage-kulcsa, a pairing/transfer és a legacy indexek változatlanok. A régi adatok **nem** kapnak új tulajdonost, az alap nem mozgat és nem töröl fájlt.
- Külön letiltott állapotot jelent: cloudSyncEnabled=false, legacyImportEnabled=false, driveAccessEnabled=false.

## Amit NEM jelent

A **normál E-book/Olvasó/Átvitel UI még szándékosan zárolt** a fresh-owner TEST kapcsoló mellett: a régi E-book kizárólag Drive-ra épülő adatutat használ, amely nincs kötve a Grapes natív fiókellenőrzéséhez. Ez a PR **csak a helyi tároló, új könyvbájtok és olvasási pozíció alapja**, nem új mobil képernyő. A fájlimport API kizárólag a későbbi, ellenőrzött natív helyi fájlkiválasztós UI számára készült; nem tud Drive/legacy rekordot importálni.

Egy fájl rögzítésekor először a fájl önálló owner-partíciós rekordja íródik, majd a katalógus CAS-mentése. Ha ez utóbbi ütközik, átmenetileg elérhetetlen, de **ugyanazon fiókban maradó** bájtrekord keletkezhet. A későbbi helyi karbantartásnak ezt takarítania kell; automatikus törlést most nem indítunk. Az IndexedDB fiókelkülönítés alkalmazásbeli váltási hibák ellen véd, nem titkosítás ellenséges, azonos originű JavaScript ellen.

## Ellenőrzések

A `tests/grapes-test-fresh-owner-ebook.browser.mjs` valódi Chromium IndexedDB-ben:

- A tiszta fiók üres könyvtárából helyi EPUB-bájtokat és olvasási pozíciót ment, B üresen indul, B saját TXT-fájlt ment, A visszakapja az eredeti fájlt/haladást.
- Más fiók fájlazonosítója/haladása, régi Drive-fájlazonosító, elavult session, kijelentkezés, kikapcsolt gate és nem Android hozzáférés elutasítva.
- Két független fiókazonos munkamenet ütköző CAS-mentése fail-closed. A korábbi közös E-book localStorage-bájtok változatlanok.

A CI emellett lefuttatja a teljes Node unit csomagot, Android WebView buildet, #148 valós Food képernyő, Food háttértár, #145 Finance UI és #144 Water A/B/A regresszióit. A böngészőtesztben a natív Auth helyettesített; **valódi telefonos E-book A/B/A még nincs**.

**Nincs Supabase/Drive távoli írás, nincs PROD módosítás, nincs migráció és nincs aláírt APK. A felhasználónál lévő TEST v28 változatlan.**

## Következő elkülönített PR

Normál Android mobil E-book + Olvasó UI-t az új tárhelyre kötni kizárólag **helyi könyvválasztás / offline olvasás** funkcióval, képernyő nullázásával fiókváltáskor; az összes Drive-megnyitás/feltöltés, QR-os nyilvános megosztás, e-olvasó párosítás és régi olvasási pozíció felhasználása továbbra is tiltva marad az új TEST-módban. Csak a készülékes regresszió után jöhet valódi többfiókos jelölt.
