# Grapes – fejlesztési együttműködés és munkafolyamat

**Dokumentum célja:** rögzíteni, hogyan folytatjuk a Grapes fejlesztését úgy, hogy a korábban Antigravityvel végzett munka, az elfogadott döntések és a projekt állapota követhető maradjon.

**Utolsó frissítés:** 2026-11-02

---

## 1. A projekt alapelve

A Grapes hosszú távú, fokozatosan épülő személyes/családi alkalmazás. Nem cél a gyors, de félkész kiadás. A fejlesztés során a stabilitás, az adatbiztonság, a visszakövethetőség és a már működő funkciók megőrzése elsődleges.

- Meglévő, működő kódot nem írunk át indokolatlanul.
- Új funkció csak ellenőrizhető, tesztelhető módon kerülhet be.
- A TEST és PROD környezetet külön kezeljük.
- A `main` ágra közvetlenül nem dolgozunk; feature branch és PR az alapértelmezett folyamat.
- PROD konfigurációt, adatbázist vagy kiadást külön jóváhagyás nélkül nem módosítunk.
- A „build sikeres” nem jelenti automatikusan azt, hogy a funkció valós eszközön is bizonyítottan működik.

## 2. Szerepek és eszközök

### ChatGPT – tervezés, ellenőrzés és műszaki támogatás

A ChatGPT feladata:
- korábbi döntések és elfogadott követelmények követése;
- architektúra és fejlesztési sorrend megtervezése;
- konkrét, végrehajtható fejlesztési feladatok megfogalmazása;
- kód, diffek, teszteredmények és auditjelentések átnézése;
- hibák és kockázatok elemzése;
- elfogadási feltételek és tesztelési terv meghatározása;
- a fejlesztési állapot dokumentálása.

A ChatGPT nem lát rá automatikusan a laptop helyi Grapes mappájára vagy az Antigravity futó munkamenetére. A helyi állapotot fájlok, kimenetek, diffek vagy megfelelően csatlakoztatott eszközök útján lehet ellenőrizni. Nem szabad úgy tenni, mintha helyi módosítás vagy teszt futott volna le, ha annak nincs ellenőrizhető eredménye.

### Antigravity – helyi végrehajtás

Az Antigravity eddigi szerepe:
- a helyi repository vizsgálata és módosítása;
- fájlok létrehozása és szerkesztése;
- tesztek és build futtatása;
- auditok és állapotjelentések készítése;
- Git branch-ek, commitok és PR-ok előkészítése a jóváhagyott feladat szerint.

Az Antigravitynek adott feladatok legyenek konkrétak, tartalmazzanak ellenőrzési lépéseket és elfogadási feltételeket. Ne kapjon homályos, többféleképpen értelmezhető utasítást.

### GitHub – verziókezelés és ellenőrizhető mérföldkövek

- Minden nagyobb fejlesztés külön feature branch-en történjen.
- A módosításokat diff alapján ellenőrizzük.
- A commit tartalma legyen célzott; ne kerüljön bele véletlenül idegen vagy ideiglenes fájl.
- A PR legyen ellenőrizhető, teszteredményekkel és ismert korlátozásokkal.
- Merge és PROD kiadás csak külön döntés után történjen.

## 3. Javasolt közös munkamenet

1. **Állapotfelmérés:** branch, `git status`, aktuális diff, releváns auditok és teszteredmények.
2. **Feladat pontosítása:** cél, hatókör, érintett modulok, mit nem szabad megváltoztatni.
3. **Fejlesztési brief:** ChatGPT megírja a részletes Antigravity-feladatot.
4. **Végrehajtás:** Antigravity a kijelölt branch-en dolgozik.
5. **Ellenőrzés:** célzott tesztek, teljes tesztcsomag, build, szükség esetén telefonos/böngészős teszt.
6. **Eredmény áttekintése:** Antigravity átadja a módosított fájlok listáját, diff-összefoglalót, tesztkimeneteket és blokkolókat.
7. **Jóváhagyás:** csak ellenőrzés után commit, push és PR; merge vagy kiadás külön jóváhagyással.
8. **Dokumentálás:** az audit- és validációs dokumentumok frissülnek.

Minden munkaszakasz végén legyen egy rövid, tényszerű állapotjelentés:
- mi változott;
- mely fájlok érintettek;
- milyen tesztek futottak le és mi lett az eredmény;
- mi nem lett tesztelve;
- milyen ismert hibák vagy blokkolók maradtak;
- történt-e commit, push vagy PR-művelet.

## 4. Kötelező óvintézkedések

- Fejlesztés előtt ellenőrizni kell a branchet és a munkafát.
- Meglévő, nem kapcsolódó helyi módosításokat nem szabad felülírni vagy automatikusan hozzáadni a commitokhoz.
- APK-k, AAB-k, ZIP-ek, build outputok, ideiglenes fájlok és titkok ne kerüljenek véletlenül a Gitbe.
- API-kulcsot, tokent, jelszót vagy személyes adatot tartalmazó fájl nem kerülhet commitba.
- Adatbázis-migráció, RLS, Auth, Storage és PROD beállítás csak külön ellenőrzéssel módosítható.
- Import és szinkronizáció nem törölheti vagy írhatja felül csendben a már meglévő adatokat.
- A kézi eszköztesztet nem helyettesíti az automatizált teszt vagy a sikeres build.

## 5. Jelenlegi ismert projektállapot – 2026-11-02

Az alábbiak a rendelkezésre álló korábbi auditok és fejlesztési jelentések összefoglalói. A következő munkamenet elején az aktuális repositoryban újra ellenőrizni kell őket.

### E-book Library és QR Studio

Korábbi jelentések szerint:
- az E-book Library célzott tesztjei 23/23 sikeresek voltak;
- a QR adatkezelési segédfüggvények tesztjei 5/5 sikeresek voltak;
- a production build sikeres volt;
- valós e-olvasós, telefonkamerás és Google OAuth/Apps Script végponttól végpontig tesztek még hiányoztak.

Ezek az eredmények nem bizonyítják a teljes valós eszközös működést. A kapcsolódó helyi módosításokat és a branch állapotát commit előtt újra ellenőrizni kell.

### Health

A korábbi funkcionális audit szerint:
- a Health Connect táplálkozási és hidratációs import-alapjai léteznek;
- helyi adattárolás és duplikációvédelem rendelkezésre áll;
- van Google Drive biztonsági mentési alap;
- nincs kész, önálló Health modul és saját áttekintő felület;
- a Samsung Health közvetlen vízadat-integrációja nem tekinthető késznek; a szükséges SDK/AAR, regisztráció és aláírási feltételek hiányozhatnak;
- a valós telefonos Health Connect és Samsung Health tesztek függőben voltak.

**Következő fejlesztési cél:** önálló Health modul kialakítása a már meglévő import- és adattárolási alapokra építve, a működő kód újraírása nélkül. Legyen áttekintő felület, napi/heti előzmény, statisztika, adatforrás-állapot és megfelelő engedély-/hibaállapot-kezelés. A Samsung-integrációt csak ténylegesen rendelkezésre álló feltételekkel szabad késznek jelölni.

### Home

A korábbi audit szerint a teljes Home/háztartáskezelő funkciócsomag még nem volt jelen:
- háztartás létrehozása és tagkezelés;
- közös bevásárlólista;
- otthoni készletnyilvántartás;
- készletből képzett automatikus bevásárlási javaslatok;
- Növények modul, katalógus és gondozási feladatok.

A Food megosztott receptkönyvtára már létező részfunkció, de nem helyettesíti a teljes családi Home modult.

### Tools és Finance

- A Tools auditot a felhasználó jelenleg elengedte; ezt nem kell újra megnyitni, amíg külön nem kéri.
- A Finance friss, teljes funkcionális auditja a korábbi összefoglalóban nem volt igazolva. Késznek csak új ellenőrzés után nevezhető.

## 6. A Grapes elfogadott UI- és termékirányelvei

- Samsung Health-szerű, letisztult főmenü.
- Neon-cyan csak visszafogott élkiemelésként jelenjen meg, ne teljes felületi glow-ként.
- A globális főmenü ikonsora ne duplikálódjon a modulokon belül.
- Nincs régi alsó navigáció és nincs 2×2/lista nézetváltó.
- A modulokon belül ne legyen külön Home/Back gombsor.
- A Settings ikon és elérés legyen egységes.
- A Home-on egy közös háztartási felület legyen, ne duplikált „saját/megosztott” panelek.
- A tervezett növényfunkció neve: **Növények**.
- A Tools elnevezés a korábbi Utility helyett elfogadott.

A korábbi részletes specifikációk és jóváhagyott képernyőtervek továbbra is elsődleges hivatkozási alapok; ez a dokumentum nem írja felül őket.

## 7. Hogyan adjunk feladatot az Antigravitynek?

Minden fejlesztési brief tartalmazza:

1. **Cél:** mit kell elérni felhasználói szempontból.
2. **Kiinduló állapot:** mely meglévő kódra, modulra és dokumentumra kell építeni.
3. **Hatókör:** mely funkciók és fájlterületek tartoznak bele.
4. **Védelmi korlátok:** mit nem szabad átírni, törölni vagy kiadni.
5. **Elfogadási feltételek:** miből látszik, hogy valóban kész.
6. **Tesztelés:** pontosan milyen teszteket és buildet kell futtatni.
7. **Átadás:** fájllista, diff, teszteredmények, blokkolók és Git-állapot.

Ha egy követelmény nem egyértelmű, az Antigravity ne találjon ki önállóan termékdöntést: jelezze a kérdést, és kérjen pontosítást.

## 8. Következő lépések

1. A Health fejlesztési brief végrehajtása külön feature branch-en.
2. A Health modul működésének és tesztjeinek ellenőrzése.
3. Az E-book Library + QR Studio módosításainak külön, célzott végső ellenőrzése, majd commit/PR előkészítése.
4. A Home fejlesztésének későbbi, önálló ütemezése.
5. A Finance állapotának felmérése, mielőtt teljes készültséget állítunk.

---

**Alapelv:** a Grapes állapotáról mindig a jelenlegi kód, a tényleges teszteredmény és a dokumentált eszközteszt dönt. Egy korábbi terv, sikeres build vagy késznek tűnő felület önmagában nem bizonyítja a teljes funkcionalitást.
