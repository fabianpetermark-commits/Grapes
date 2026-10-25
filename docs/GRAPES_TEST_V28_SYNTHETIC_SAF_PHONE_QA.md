# Grapes TEST v28 – mesterséges Android SAF fájlmentési próba

## Pontos tesztcél

**A natív Android fájlmentés, fájl-újranyitás, UTF-8 bájtszám és SHA-256 visszaolvasás ellenőrzése egy valódi telefonon.** Ez kizárólag **szintetikus** mintákkal igazolható, a normál helyi modulok adatainak vagy a régi, közös tárolóknak a megnyitása és költöztetése nélkül.

- **QA-only** `src/sync/grapes-test-synthetic-saf-trial.js`: négy kizárólag programkódból előállított szintetikus rekordforrás (Food, Finance, Water, E-book). NEM olvassa a felhasználó IndexedDB-jét, localStorage-ját, Health/Drive/Supabase adatait.
- A fájl neve `grapes-helyi-teszt-YYYY-MM-DD.json`, **nem** `grapes-helyi-adatok-YYYY-MM-DD.json`; így világos, hogy ez semmiképp sem a felhasználó valódi helyi mentése.
- Beállítások → **Fájlmentés TEST · csak mesterséges adatok** → `1. Mesterséges mentés fájlba és külön visszaolvasás`. Gomb csak akkor jelenik meg, ha TEST channel, hitelesített natív Grapes TEST Auth, valamint dedikált `VITE_GRAPES_TEST_SAF_SYNTHETIC_QA_ENABLED=true` flag együtt aktív. Az Android natív kapu külön `GRAPES_TEST_LEGACY_BACKUP_ENABLED` flaget és natív ellenőrzött app-origint igényel.
- A fájlt a felhasználó az Android Storage Access Framework fájlválasztójával menti új JSON fájlba. **Nem szabad meglévő fájlt felülírni.** Siker után a natív komponens újranyitja, összeveti az ideiglenes forrással, és csak SHA-256 plusz UTF-8 bájtszám egyezés esetén ad nyugtát. Az alkalmazás ezen felül a mentésen belüli per-forrás hash jegyzéket is újra ellenőrzi.
- A PASS csak a szintetikus fájlra vonatkozik. A kapott fájlban `ownership=unclaimed` és `migrationAuthorized=false` marad. Nem alkalmas valódi adat-helyreállításra.

## Valódi telefonos elfogadási próbák

1. Frissíteni csak ellenőrzött, korábbi TEST v27-tel **azonos történeti aláírású** TEST v28-at szabad, meglévő app fölé, törlés és adattörlés nélkül. Fontos helyi adatok független mentése előfeltétel.
2. Az eredeti TEST A fiókkal nyisd meg a Beállítások → **Fájlmentés TEST** panelt; nyomd meg az egyetlen mentésgombot.
3. Az Android fájlválasztóban ments **új néven** egy `grapes-helyi-teszt-...` JSON fájlt egy általad választott mappába.
4. A sikeres fájl-újranyitás után várt státusz: `PASS: 4 mesterséges forrás ... SHA-256 ... egyezik`; ha a fájlválasztás megszakad, `NEM IGAZOLT` eredményt várunk. Külön QA-hibateszteknél sem szabad PASS-t hamisítani.
5. **Nem szükséges B fiókra váltani.** Ez nem kétfiókos adatvédelmi teszt, hanem natív fájlmentés-próba. B fiókkal továbbra se használd a normál helyi Food/Finance/Water/E-book adatokat.

## Korlátok / NO-GO

- A valódi Food/Water/Finance/E-book helyi rekordok, Health és Samsung Health külső adatai, távoli TEST/PROD Supabase, illetve Drive adatok **nem képezik részét a mentésnek**.
- A szintetikus TEST-fájl **nem** tekinthető valós helyi adatmentésnek. Valós mentést csak később, külön tulajdonosi feloldással, ellenőrzött forrásleltárral és explicit jóváhagyással szabad kínálni.
- Új TEST v28 APK építése csak CI; nincs Play Store/PROD kiadás, PR-merge vagy automatikus frissítés.
- A normál modulok fiókonkénti szétválasztása és az örökölt adatok költöztetése **még nincs kész**; a korábbi szintetikus A→B→A PASS érvényben marad.
