# Grapes TEST – normál mobil E-book + EPUB Olvasó fiókonként (Draft)

**Ez a #149 E-book storage core és #148 Food mobil PR-ra épül.**
**Nincs merge, APK, PROD/TEST távoli írás vagy kiadás. A telepített TEST v28 változatlan.**

## Elkészült bekötés

- Az opt-in `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED=true` kizárólag Android TEST csatornán, natív Grapes Auth mellett a valódi Android E-book polcot és az EPUB Olvasót a #149 új helyi fióktárhelyre köti.
- A mobilos **Könyv hozzáadása** fájlválasztója a kiválasztott **új helyi könyvfájlt** a saját partícióban menti; a borító/polc kizárólag az aktuális Grapes-fiók könyveit mutatja.
- Az EPUB Olvasó a fióktárolóból ellenőrzötten kiolvasott Blobot dolgozza fel a meglévő EPUB parserrel; olvasási pozíciója helyi, owner-CAS mentésre kerül.
- B-hez kapcsolódáskor a régi E-book/Olvasó DOM az új natív Auth ellenőrzés előtt láthatatlan és inert, a polc/olvasó memóriakontrollere és a könyvlista kiürül. Fiókváltás/visszatérés során a dokumentum újból ellenőrzi az új subjectet. A korábbi kontrollert a #149 tárhely elutasítja.
- **Régi Drive-könyvtár, Drive-feltöltés, közös localStorage progress, könyvmegosztás, QR-hozzáférés létrehozás, e-olvasó párosítás/átvitel, régi index és automatikus import nem kap engedélyt.** A `transfer` képernyő továbbra is lezárt; a normál web/PROD E-book változatlan.

## Korlátok

Az Olvasó ebben a körben csak EPUB fájlt képes megjeleníteni (a polc a #149 által engedélyezett további fájlformátumokat is tudja tárolni). A fiókonkénti helyi tároló nem felhőszinkron és nem hardveres titkosítás. Az új könyvállományokat nem mozgatja, nem osztja meg külső szolgáltatóval, és nem tekinti tulajdonnak a régi Drive-ból származó fájlokat.

A régi E-book közös Drive-adatai nem migrálódnak; ettől a TEST elkülönített módban a régi könyvek nem lesznek láthatók. Ezt a felhasználó korábban jóváhagyta az üres app miatt, de a tényleges Drive-állományt ez a PR semmilyen módon nem módosítja.

## CI

`tests/grapes-test-fresh-owner-ebook-mobile.browser.mjs` **valódi mobil UI-elemekkel** megnyitja a polcot, a fájlkiválasztóba EPUB-fájlt ad, az Olvasóban tartalmat nyit és pozíciót ment, átvált B-re, B saját fájlt rögzít, majd A könyvét és haladását visszaellenőrzi. A teszt asserteli, hogy **nulla Google Drive API kérés** történt, a régi olvasási pozíció helyben maradt, a Transfer panel tiltott. A böngésző natív Auth-válaszai szimuláltak.

A workflow ezen felül ismétli a #149 helyi E-book adat A/B/A tesztjét és a Food, Finance, Water, owner-store regressziókat, valamint npm test + Android WebView buildet. **Telefonos készülékellenőrzés és aláírt új TEST-jelölt csak a további Home/Health/Drive/adatút audit után jön.**
