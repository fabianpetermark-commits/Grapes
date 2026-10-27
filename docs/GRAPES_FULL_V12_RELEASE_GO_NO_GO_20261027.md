# Grapes – végleges v1.2 teljes kiadás: tényleges GO/NO-GO mátrix
2026-10-27. Kanonikus forrás: `codex/android-app`. **Állapot: teljes PROD kiadás NO-GO.**

## Elsődleges döntés
Nem készítünk új, második Auth/Supabase/Health rendszert. A jóváhagyott Brand v1.2/egy Otthon/felső hatikonos navigáció *meglévő valódi modulokhoz* kapcsolódik. A jelenlegi szinkron, UI és Android teszteredményeket megőrizzük. **Nem váltható készre egy kizárólag HTML-prototípus vagy mockos CI alapján.**

A végleges UI meghatározó forrásai:
- `docs/GRAPES_BRAND_GUIDE.md` a `docs/grapes-brand-guide-and-ring-brief-20261018` ágon: 6 egyenlő ikon egyetlen közös sötét kapszulában, látható ikonfelirat nélkül, min. 44×44 érintési cél, modulonként kontextuális alsó Quick Action, nincs külön Vissza/Home vagy régi alsó főmenüsáv.
- `docs/GRAPES_HOME_ONE_HOUSE_APPROVED_20261026.md`: **egy** Otthon, egyszerre Bevásárlás + Készlet + Javaslatok, nincs Saját/Közös módválasztó; a családi megosztás jogosultság.
- `docs/GRAPES_HEALTH_MAIN_UI_APPROVAL_20261026.md` a Health #177 ágon: Food/Víznapló/Receptek/Statisztika/Vonalkód/Beállítások, két Health-beállításcsoport.
- `design/references/approved/main-shell-widgets.html` és `health-minimal.html`: működési/design referencia; **nem helyettesítik az élő appot**.

## Modulonkénti tényállás

| Modul | Meglévő, tényleges eredmény | Kiadási hiány / kapu |
| --- | --- | --- |
| Egységes Home UI | #183 első valódi 3 widget; #192 natív TEST Auth→Supabase CAS és outbox, #195 telefonos screenshot alapján javított neon-cyan bottom-sheet/quick-action; #196 v51 aláírt QA artifact, fullchain 23/23 CI PASS | Az új v51/v52 **telefonos** A/B + offline + ütközés + UI elfogadása; megosztás/meghívó kezelő jelenleg információs; PROD `grapes_home_private` schema/role/RLS átvezetése és valós PROD környezetkapu külön review |
| Főmenü és modulkeret | Aktív valós navigáció, Android oldalak, lokalizált funkciók | A `design/android-mobile-preview.html` még négy régi nagy hub-csempét használ; a jóváhagyott 6-ikonos top rail + **Gyakran használt** kezdőlap, manuális pin + valódi használat alapú ajánló és felső modulregiszter nem fut a kanonikus Android UI-ban. A régi globális alsó navot nem szabad visszahozni |
| Health UI | Élő Food és Water aggregáció + célok + import preview, #199 Draft v1.2 integráció | #199 teljes CI-je jelenleg nem zöld (nem merge-elt); valódi telefonos Food/Víz/Receptek/Statisztika és 320–412px megjelenés PASS szükséges. Nem lehet régi + új navigáció párhuzamos |
| Food, YAZIO és Health Connect | Meglévő Food napló, keresés/receptek/előzmények, YAZIO import és Health Connect import; korábbi felhasználói telefonos PASS a YAZIO-importhoz | A teljes jóváhagyott Food belső widgetes képernyő, receptek/tápanyag-statisztika/diary és családtag szerinti adatmegőrzés külön UI parity QA. A tervezett étkezés **nem** automatikus tényleges napló |
| Water és Samsung Health | Víznapló és Health Connect import él; Samsung egészségadat-olvasás natív útvonalon SDK esetén | **Közvetlen Samsung Health Data SDK + valódi telefonos jogosultság + víz readback nincs élesre bizonyítva**. #171 CSV/owner és #173 direkt SDK/owner-auto-sync Draft. Licencelt AAR hiányakor egyértelmű fallback, nem hamis direkt aktív jelvény, nincs 24/7 háttérsync ígéret. Health Connect működését külön tartsuk meg |
| Finance | Valódi öt nézet, ikonrail #182 merged, Finance backup JSON user-gesture javítás #197 merged | Teljes jóváhagyott Finance widget nézet és quick action paritás, OCR/import/Drive/backup, törlés előtti duplán védett mentés. #196 v51 APK **nem** tartalmazza #197-et; v52 új aláírt jelölt Codex #198 feladat |
| Tools / E-book / QR | Valódi E-book, PDF/EPUB, QR és további régi Utility funkciók | Végleg elfogadott Tools név + E-book/QR teljes Brand v1.2 megjelenésből csak referencia/jelölt HTML van #41 alatt; ezekhez a meglévő olvasási/generálási/Drive/QR funkciókhoz kell kötni a látványt, nem új mintákat tárolni |
| Outdoor / Növények | Jóváhagyott interaktív növényes vizuális terv és Outdoor koncepció | Valódi növénynyilvántartás, több példány, nyílt fajkatalógus HU/EN, locsolási/teleltetési napló, helyi időjárási figyelmeztetés **a Home widgetek közé integrálva**, aktuális teendők/halasztás/értesítések; nincs kész release-szintű implementáció. Élő lekérés és telefonos teszt szükséges |
| PROD Supabase Auth és család | TEST külön projekt `aighqtqjlzirlokxwupt` hitelesített családi két szereplős CAS; PROD Auth egyelőre külön build gate | **PROD `yopabovoxyffhokhbgxl` DB-séma nem a TEST Home adatmodellje**. Jóváhagyott, review-zott migráció, RLS, izoláció, idempotencia, regisztráció/OTP, előző lokális Food/Water/Finance rekord tulajdonoshoz kötésének döntése, két valódi accountos PROD QA csak explicit release approval után |
| Android APK és adatmegőrzés | #192 v50 TEST QA, #196 v51 aláírt TEST + signer/sha/version proof; #197 Finance javítás merged | Codex #198 v52 signed TEST ág/QA-feladat; telefonos frissítés **a meglévő TEST fölé**, alkalmazás/adatok törlése nélkül; verzió, csomag, signer, hash visszaellenőrzés; PROD signer külön. A TEST/PROD alkalmazásadatok és Googe Drive / Supabase identitások nem keverhetők |

## Egyetlen közös integrációs sorrend – nem újrakezdés
1. **Aktuális modulok élő v1.2 UI-ja**: meglevő funkciók és tárolók maradnak; Health #199, aztán közös felső menü / gyakori modulok, Finance komplett widgetek, Tools, E-book, QR, végül Outdoor külön valós adatmodul. A jelentkező hibákat forrásban javítjuk és teszttel bizonyítjuk, nem a CI elvárását gyengítjük.
2. **Aktuális TEST v52 családi Home és Finance regression**: Codex #198 új, #197 utáni forrásból aláírt frissítő APK, korábbi A/B alapteszt felesleges megismétlése nélkül, *új* offline/UI/signer ellenőrzéssel.
3. **Samsung Health kapu**: hivatalos SDK licenc/aktuális AAR meglét, telepített natív build, valós user permission és víz olvasási eredmény (CSV helyettesítő nem azonos a direkt SDK-val). Fail-closed, ha hiányzik.
4. **Staging ⇒ PROD**: egyszerre Auth/owner safety, Home migrations + RLS, lokalizált Store/Water/Food, Finance mentések, app update, signed release és visszagörgetés. Jelenleg csak TEST-védelem igazolt; nincs automatikus PROD adatbázis-módosítás.

## Kötelező release kapuk
- [ ] Jóváhagyott v1.2 teljes felület és minden tényleges gomb (főmenü, Home, Health, Food, Water, Finance, Tools, E-book, QR, Outdoor) teljes UI parity PASS, 320/360/390/412 px, képernyőolvasó, fizikai készülék.
- [ ] `npm ci`, `npm test`, `npm run build:android-web`, célzott valódi Chromium end-to-end és Android Kotlin unit/assemble PASS a **pontosan kiadandó commiton**.
- [ ] Fiókváltás A→B→A, offline outbox reload, megkésett CAS/read_attempt, valós server/RLS és ismételt retry PASS; nincs adat átszivárgás vagy phantom stock. `Megvettem` csak vásárlási státusz.
- [ ] Food, Water, Finance, E-book és Home helyi data byte-preservation/rollback + valódi felültelepítés PASS. No silent legacy owner binding.
- [ ] Samsung Health közvetlen SDK engedély/readback vagy egyértelmű, felhasználó által tudott korlátozott Health Connect fallback. Nem állítunk nem támogatott automatikus direkt syncet.
- [ ] Supabase PROD adatbázis/owner/RLS migráció review, validált rollback és kétfiókos backend QA; kifejezett jóváhagyás szükséges PROD DB íráshoz.
- [ ] RELEASE APK helyes PROD csomag, verzió, tanúsítvány, SHA-256; adatvesztés nélküli frissítés és felhasználói telefonos GO. Nincs automatikus kiadás csak mert a TEST CI PASS.

## Nem kiadási bizonyíték
- Mock/szintetikus adapter PASS **nem** bizonyít hitelesített élő telefonos Samsung SDK/PROD RLS sikerét.
- Sikeres TEST A/B proof **nem** teszi egyenlővé a PROD adatbázis-sémát.
- A #196 aláírt v51 build *régebbi* a #197 Finance hotfixnél; v52+ új SHA-t és új tesztet igényel.
- Jóváhagyott HTML prototípus nem a működő Android modul.
- A Home közös bevásárló tételének elintézése **nem** vehet fel automatikusan igazolt készletet.
