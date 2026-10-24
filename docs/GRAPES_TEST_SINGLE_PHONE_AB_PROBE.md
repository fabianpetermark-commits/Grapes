# Grapes TEST – egytelefonos kétfiókos próba (Draft, NO-GO valódi adatokra)

A #134 az elkülönített helyi Supabase-ben két külön **valódi Auth/JWT**-vel sikeresen tesztelte a fiókok közötti szerveroldali hozzáférésvédelmet. Az egytelefonos próba célja ugyanez a **távoli Grapes TEST** projektben, saját TEST Google-bejelentkezéssel és kizárólag mesterséges Food-adatokkal.

## Kritikus határ: helyi Food-adatok

A Grapes jelenlegi normál Food, Water, Finance és E-book tárolóit **nem** tekintjük fiókonként elkülönítettnek csak azért, mert a Supabase-fiók megváltozik. A WebView egyazon helyi tárolóját másik TEST Auth-fiók is elérheti. Ezért **a fiókváltás még nem általános többfelhasználós mód** és nem bizonyítja a helyi Food adatok adatvédelmét. A szintetikus QA-próbán kívül a második fiókkal ne nyisd meg és ne módosítsd a normál Food/Water/E-book adatokat.

## Előkészület

1. A jelenlegi TEST v25 telepítést és appadatokat őrizd meg. **Ne távolítsd el az alkalmazást, ne ürítsd az adatait és ne jelentkezz ki az első, ellenőrzött mentések előtt.**
2. Készíts külön, visszaolvasható helyi mentést a TEST Food, Water, Finance és E-book adataidról, lehetőleg az alkalmazástól független helyre; az ellenőrző visszaolvasást is végezd el.
3. Legyen második, önállóan kezelhető Google-/Supabase TEST-fiók. Jelszót, OAuth-kódot vagy access tokent ne küldj ChatGPT-ben, PR-ben vagy logban.
4. Az új negyedik QA-gomb **még nincs telepítve**: csak külön ellenőrzött és TEST aláírt jelöltből tehető majd elérhetővé. A #135 Draft PR önmagában nem frissíti a telefont.

## Felhasználói próba – csak ellenőrzött következő QA APK-val

1. **A fiók** – az eredeti fiókban ellenőrizd a korábbi 3. „Külön visszaolvasás” PASS rev. 1 eredményét; az A szintetikus pointer már megvan.
2. Ellenőrzött helyi mentések után lépj ki **csak a Grapes TEST-fiókból**. A külön Google Drive-fiókot ne bontsd.
3. Ugyanazon a telefonon jelentkezz be **B fiókkal**. Ne használd a normál Food-tartalmakat. A rejtett Beállítások / Food TEST panelen indítsd el egymás után: 1. Előkészítés; 2. Mentés; 3. Külön visszaolvasás. Mindegyik kizárólag a B-nek létrehozott mesterséges tesztprofilban dolgozik.
4. **B fiókban** nyomd meg a 4. „Másik TEST-fiók adatvédelmi próbája (csak olvasás)” gombot. A teszt a korábbi A próba-profilját keresi; az idegen `read_attempt` null, az idegen `read_document` és `read_revision` konkrét **HTTP 401/403** elutasítást kell adjon. A hálózati timeout és más hiba **nem** lehet PASS.
5. Lépj vissza **A fiókba**; ismét ellenőrizd a 3. külön visszaolvasást. Az A rekordnak továbbra is rev. 1-nek kell lennie. A 4. gombnak A-ból a B próbaadatait is el kell utasítania.
6. A távoli TEST szerveren a QA-rekordok számát és tartalmát külön, **csak olvasással** ellenőrizhetjük. A régi A és az új B tesztprofilok nem kerülnek automatikusan törlésre.

## Mit bizonyít a 4. gomb?

- A fiókhoz kötött natív, igazolt TEST kliens működik.
- A másik fiók *mesterséges* profilja nem szerepel a saját listában.
- A másik fiók szintetikus mentési előzménye nem olvasható.
- A másik fiók dokumentuma és 1. revíziója a **valódi szerver által** elutasított.
- A két ellenőrző kör közötti, sikeres saját profillista-visszaolvasás biztosítja, hogy egyszerű offline hiba ne adjon hamis PASS-t.

A gomb **nem ír** és **nem töröl** szerveroldali adatot. Nem bizonyít idegen írás tiltást, az összes adattípust, vagy a helyi tárolók fiókonkénti szétválasztását; ezek külön mérföldkövek.

## Kiadási szabály

A #135 Draft / CI próba nem bocsát ki aláírt APK-t, nem kapcsol be normál Food-szinkronizálást, nem módosít PROD-ot, és nem hajt végre automatikus fiókváltást. Telepítésre kizárólag a külön ellenőrzött, történelmi TEST aláírású későbbi jelölt alkalmas.
