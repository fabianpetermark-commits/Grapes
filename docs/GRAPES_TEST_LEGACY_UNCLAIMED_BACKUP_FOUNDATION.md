# Grapes TEST — örökölt helyi adatok tulajdonos nélküli mentési alapja

**Státusz: elkészült az első mentési alap; minden valódi felhasználói migráció továbbra is NO-GO.** A v27 Android telefonos A→B→A szintetikus helyi fiókpróba PASS marad. A normál projektek azonban továbbra is a régi, közös WebView-tárolókban vannak.

## Mi készült?

- `src/sync/grapes-test-legacy-unclaimed-backup.js`: a korábbi **grapes-projects/projects** IndexedDB adatbázis összes rekordját — köztük a Food mentési ütközések helyreállító rekordjait és a Finance bizonylatmezőit — eredeti JSON mezőivel olvassa. Ha még nincs adatbázis, a felfedezés nem hozza létre.
- A felismert `localStorage` adatok közül a Water v1/v2, Water recovery, Food függő mentési sor, Yazio kapcsolódó jelölők, Food beérkező osztás státusza és E-book gyorsítótár/olvasási haladás bekerül a források közé. A külön TEST QA pointerei, Drive bejelentkezési beállítások és UI állapotai **nem** kerülnek a mentési fájlba.
- Ismeretlen `grapes-*` kulcs esetén **leáll**; nem állíthatja, hogy minden adatot összegyűjtött. A nem JSON-kompatibilis IndexedDB rekordoknál is megáll, hogy Blob, fájlhandle, Date, NaN vagy egyéb nem visszaállítható adat ne vesszen el csendben.
- `prepareUnclaimedLegacyBackup()`: UTF-8 bájtszám, minden forráshoz külön SHA-256 és teljes exportfájl SHA-256 készül; minden forrás `ownership: unclaimed` állapotban marad, a teljes csomag max. 80 MB.
- `verifyUnclaimedLegacyBackup()`: külön visszaolvasott fájl bájtszám és SHA-256 bizonylatát fogadja, majd **új leolvasáskor** ismét ellenőrzi az eredeti források hashét. Válasza továbbra is `migrationAuthorized: false`: a mentés önmagában nem rendeli hozzá a régi adatot sem A, sem B fiókhoz.
- Node unit tesztek és valódi Chromium/IndexedDB-böngészős teszt **kizárólag mesterséges adatokkal**: sérült receipt, hiányzó vagy megváltozott forrás, ismeretlen kulcs, helyreállítási rekord és történeti bizonylat, E-book olvasási állapot, víznapló változatlansága.

## Fontos korlátok

1. **Még nincs Android SAF export és valódi fájl-bizonylat.** A böngészős tesztben a receipt szimulált. Az eddigi Android Health-export régi, szigorúan Health-specifikus név/formátum ellenőrzését nem kerülhetjük meg. A következő lépés egy önálló natív, ismételten visszaolvasott, SHA-val hitelesített mentési út, külön tesztekkel.
2. **Ez nem teljes készülékmentés.** A külön Drive-on lévő könyvek, az E-book olvasószinkron fájlhandle-ek, a Samsung/Health Connect provider története, a natív alkalmazás saját adatbázisai, és az ismeretlen projekttípusok helyreállítása további egyedi feldolgozást igényelnek. A jelen snapshot az ellenőrzött helyi JSON-adatokhoz készíti elő az adatsérülésmentes visszajátszást.
3. **Nincs felhasználói adatvédelmi megnyitás.** A nyers leltár API-ját a normál UI nem hívja. A régi tárhely fiókfüggetlen, ezért B-nek a régi A-adatokat *nem szabad* megmutatni egy új leltárfelületen pusztán azért, mert B bejelentkezett.
4. **Nincs migráció és nincs automatikus claim.** Sem a korábbi adatbázist, sem a Water/E-book localStorage kulcsokat nem módosítja, és nincs törlés. Megnyitási és mentési útvonalak fiókhoz rendelése külön, későbbi PR lesz. Minden valós migrációhoz a felhasználó **kifejezett jóváhagyása** szükséges.
5. **Sem PROD, sem Supabase TEST/Drive nem módosult.** Nincs APK, nincs alkalmazásfrissítés, nincs release vagy PR merge. A v27 TEST változatlan marad.

## A következő lépés

Külön TEST Draft PR: natív Android SAF-ben mentett, valóban *újranyitott* és SHA256-tal ellenőrzött, tulajdonos nélküli JSON backup; kizárólag az ellenőrzött korábbi adatok visszaállítási garanciájára. A címzett fiók kiválasztása és adatok fiókhoz rendelése ez után, külön explicit jóváhagyás és A/B regresszió mellett következhet.
