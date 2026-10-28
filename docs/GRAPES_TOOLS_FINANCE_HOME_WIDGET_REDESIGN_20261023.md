# Grapes – Tools, Finance és Home újratervezési terv (2026-10-23)

> **Státusz: felhasználói irány elfogadva, részletes UI-terv / modulgyorssávok javaslatok.** A 2026-10-23-án elfogadott Grapes Health minimal, neon-peremszegélyes megjelenés és Samsung Health-szerű navigáció alapján. **Az Android/PROD/TEST kódja, adatai és kiadásai változatlanok.** Kapcsolódó [Grapes Brand Guide v1.1](./GRAPES_BRAND_GUIDE.md).

## Navigációs szerződés

1. Az eddigi **Utility** főmodul látható neve mostantól **Tools** legyen. A 2026-10-23-i designterveken már ez szerepeljen; belső régi `utility` azonosító, Drive-mappák, adatbázis- és module-key azonosítók nem nevezhetők át automatikusan, mert migrációs kockázatot jelentenek.
2. Felső, gördíthető főmodul-ikonsor: **Kezdő / Home / Health / Tools / Finance**, majd minden új főmodul. A Kezdő a felhasználó kedvenc és leggyakrabban használt **valódi widgetjeiből** szerkeszthető, nem puszta navigációs kártyákból. Az első képernyő a Kezdő.
3. A **modul tabra érkezéskor az adott modul widgetjei azonnal láthatók** – nincs fölösleges külön `Könyvtár vagy QR?`, `Pénzügyi napló`, `Bevásárlás vagy Készlet?` választóképernyő.
4. A felső globális főmodulváltás és az alsó **kontextuális gyorsműveleti dock** egymástól eltérő; a dock menüpontonként vált. Health jóváhagyott: Fotó / Étel / Víz + külön Vonalkód. Home/Tools/Finance gyorsműveletei alább javasoltak, még külön vizuális jóváhagyást igényelnek.
5. A fejléc minimal: modul neve balra, modul saját beállítása jobbra; jóváhagyott `#090E14`, `#101821`, `#17222E`, `#3BDCF2`, rövid, diszkrét szegély-neon. Tartalom görgethető, alsó dock Android safe-area fölött marad; nem takarhatja az utolsó widgetet.
6. A teljes képernyős részletes szerkesztők és olvasók megőrzik a valódi navigációt, billentyűzetet és elmentett állapotot; a globális főmenü vagy gyorssáv szükség szerint kontextuálisan elrejthető, majd visszaállítható.

## Tools (korábbi: Utility)

**Meglévő tényleges források:** `design/android-mobile-preview.html` `hub-utility`; mobil E-book: `ebook` / `reader` / `transfer` aloldalak, `src/ebook-mobile-library.js` és olvasó; QR: `src/qr-studio.js`, `index.html#qr-app`. A QR mobil shellből egy külön webes szerkesztőképernyőre navigál; nem elég csak a hubot átfesteni.

**Tools áttekintés widgetjei:**
- **E-book / Folytatás:** legutóbbi támogatott könyv borítója/címe, folytatható haladás csak akkor, ha valódi könyv/progress adat létezik; könyvtár megnyitása, esetleg könyvimport. Támogatott könyvtípus/olvasó funkcióknál a meglévő különbségeket tiszteletben kell tartani. Mintaértékből nem generálunk felhasználói adatot.
- **QR Stúdió:** közvetlen új QR-kód generálási indítás (URL/adattípus), meglévő mentett munkamenet folytatása, ha van. A HTML/CSS widget nem helyettesíti a meglévő `qr-studio` funkciót.
- **További Tools:** ha később új eszköz kerül ide, új saját widget jelenhet meg – nincs hardcoded két-alkalmazásos maximum.

**Javasolt alsó gyorssáv (PROPOSED):** Könyv hozzáadása / Új QR / Átvitel. Ha a felhasználónak nincs hozzáférése az adott funkcióhoz, ne legyen inaktívnak tűnő ál-gomb; mindig valós funkciót indítson.

**Belső képernyők:** könyvtár, olvasó, átadás/párosítás és QR beviteli/preview/szín/adattípus/PNG letöltés mind ugyanazon Grapes design tokenekkel. A könyv **olvasási tartalmának** saját betűtípusa/témája beállítható marad; a generált QR-**canvas** fekete-fehér vagy a felhasználó által választott kontrasztos színű marad (nem kötelező ciánra váltani).

## Finance

**Meglévő forrás:** `src/finance-tracker.js`, `src/finance-import*.js`, `src/styles/screens/finance-tracker.css`; tényleges nézetek: `overview`, `transaction`, `savings`, `forecast`, `import`. A Finance jelenleg többnyire külön webes képernyő/azonosítókör; érdemi mobil widgetintegrációhoz új, olvasó- és művelet-API kellhet, nem adathozzáférési hack.

**Finance áttekintés widgetjei:**
- **Havi bevételek és kiadások:** valós aktív hónap szerint, jelenlegi adatokból, pénznemmel és pozitív/negatív tételek helyes kezelésével; kattintható részletek.
- **Kiadások / kategóriák:** grafikon és kategóriaösszegzés, a már meglévő statisztika-adatokra építve.
- **Megtakarítási célok:** célok és előrehaladás az élő `savings` adatokból; hiányzó célnál tiszta üres állapot.
- **Legutóbbi tranzakciók:** valós dátummal és értékkel; előrejelzés/import belépési pontok külön részletes nézeten.

**Javasolt alsó gyorssáv (PROPOSED):** Kiadás / Bevétel / Megtakarítás (és szükség esetén további művelet pl. Import, de nem túlzsúfolva).

**Biztonság:** csak a már meglévő Finance adatmodellről renderelünk; nem számolunk hamis összeget, nem módosítjuk a tárolt tranzakciókat, pénznemet, import mappinget, automatizált mentést vagy Drive-szinkront egy UI-frissítés részeként. A szemantikus grafikon/kategóriaszínek megmaradnak.

## Home

**Meglévő forrás:** `src/home/home-mobile.js`, `home-store.js`, `home-data.js`, `home-mobile.css`. A Háztartás jelenleg `inventory` és `shopping` tabokra osztott, mennyiség/tárolás/lejárat és lista szerkesztéssel, valamint visszavonási eseménnyel. A Növények **külön TEST-terv**, WeatherAPI háttérrel; nem kész, valós saját növényadat-szinkron.

**Home áttekintés widgetjei:**
- **Bevásárlólista:** jelenlegi nyitott tételek közvetlen kipipálással, további lista megnyitással.
- **Készletkezelő:** tárolók, összesítés, közeli lejáratok *csak valós lejárati dátum alapján*, közvetlen tételkeresés/hozzáadás.
- **Növények:** saját példányok és aktuális teendők az elfogadott Növények-terv szerint. Amíg nincs valódi példányadat és ápolási logika, **nincs kitalált teendő**, a rész mintával jelölt/elérhetőségi állapotban marad. A WeatherAPI külön, szerveroldali TEST cache-ből olvasható majd.

**Javasolt alsó gyorssáv (PROPOSED):** Listaelem / Készlethez adás / Új növény. A Növények még nem elkészült műveletét nem szabad funkcionálisnak tettetni éles kiadásban.

**Biztonság:** a jelenlegi Home adatok helyi, különálló tárolóban vannak; ne ígérjünk családi szinkront, amíg nincs kész. A készletmozgás és a bevásárlólistán kipipálás továbbra sem automatikusan ugyanaz. A növénynapló és a Food/Víz adatokat nem keverjük.

## Megvalósítási terv (külön, kis lépésekben)

1. **Jóváhagyni a modulonkénti widgetek tartalmát és az alsó gyorssávok műveleteit** az elfogadott Health stílusban, különálló interaktív HTML-terveken.
2. Közös minimal fejléc, widgetkeret/neon, ikonok, átmeneti állapotok, felső rail és kontextuális dock **újrahasznosítható komponensszabályai**; az új név a felhasználói UI-ban Tools.
3. **TEST-only implementáció**, modulonként izolált lépések: első körben a Tools hub + E-book/QR, majd Home, Finance – sorrend a felhasználó következő döntése szerint. A belső oldalak/canvasok/műveletek nem sérülhetnek.
4. `npm test`, `npm run build:android-web`, releváns Playwright browser/regressziók, meglévő adatokkal migráció/backup-ellenőrzések, auth/PIN/Drive-állapot, 320/360/390/412 px, TalkBack/fókusz, Android telefonos TEST próbák.
5. PROD csak külön, eredmények alapján adott felhasználói jóváhagyás után, saját ággal és release-kapuval; az általános Brand Guide elfogadása **nem egyenlő** az alkalmazáskód automatikus átírásával.

**Állapot:** auditált újratervezési brief. Sem új APK, sem alkalmazáskód változás nem történt.
