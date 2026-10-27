# Grapes — funkciómegőrzési és felhőintegrációs audit
**Készült:** 2026-10-27  
**Állapot:** részleges, bizonyítékalapú TEST-audit. **Nem** teljes rendszer GO; nem PROD GO.

## Mit vizsgálunk?
A **fejlesztés alatt álló** modulok működő képességeinek megőrzését, nem pusztán azt, hogy a jelenleg telepített alkalmazás nem módosult. A felhasználó ezt külön tisztázta. Az elfogadott HTML látványterv (Home, Health, Food, Finance, Tools/QR, Outdoor, Kezdő, Beállítások, ideiglenes E-book) **nem** bizonyítja az Android funkcióparitást.

A funkcióvesztés elleni ellenőrzésnek 4 külön szintje van:
1. **Valódi modulparitás:** megtartjuk a gombok/űrlapok/böngésző, fájlimport/mentés, undo, CRUD és navigáció működését.
2. **Tulajdonosi és háztartási határ:** két Grapes fiók A→B→A, cache/DOM, jogosultságok, private Health/Food/Water/Finance/E-book, közös Home csak meghívottaknak.
3. **Adatállandóság:** helyi CAS, export és visszaállítás, offline queue, deduplikáció, újrapróbálás/ütközés; ne legyen csendes felülírás.
4. **Valódi felhő/telefon:** másik eszköz újratelepítés utáni visszaolvasás, teljes Supabase-szinkron, valódi Samsung/Health Connect/Drive import, telefonos egymásra telepítés csak külön készülékes GO-val.

## Ellenőrzött alap
**Összevont TEST v29** (PR #158, SHA `6b4158aba19255a0c333f75d3ab744a85d2d69b1`, 2026-10-25):
- CI sikeres: **571 unit PASS, 0 hiba**, Android WebView build PASS.
- Tizenegy egymásra épülő modul PR #144–#155 ancestry-ellenőrzés PASS.
- Chromiumon Water, Finance + bizonylat/CAS, Food + napló/receptek, saját E-book/EPUB olvasási pozíció, Home készlet/lista, Health Connect táplálkozás/víz manuális importelőnézet, YAZIO fájl/direct import, A→B→A + duplikátum/undo, tulajdonosi tároló és régi adatok sértetlensége PASS.
- Natív TEST unit, signed v29 APK artifact és aláírás/integritás PASS.
- Korlát: böngészős natív **mock**; nem teljes Samsung Health/Supabase/Drive hálózati E2E; az E-book Drive-beavatkozás v29-ben szándékosan tiltott volt.

Ez **csak a v29-be már bekerült kódra** érvényes; a későbbi Home és Samsung ágakat nem bizonyítja.

## Új, read-only audit CI
`.github/workflows/grapes-functional-preservation-audit.yml` a v29 headből külön audit ágon futó biztonságos kapu. Műveletek:
- teljes korábban sikeres `npm test`;
- `npm run build:android-web`;
- 11 valós Chromium képernyőteszt (UI + per-owner A/B/A, offline/CAS/undo és importoldalak);
- `gradle --project-dir android-health-connect-poc :app:testQaUnitTest`.
**Nem** készít aláírt APK-t, nem indít kiadást, nem hív éles Supabase API-t és nem végez backend migrációt. E workflow eredményét külön kell lekérdezni: a fájl létrehozása önmagában **nem PASS**.

## Az eddig azonosított nyitott kockázatok

| Terület | Bizonyíték | GO / NO-GO |
|---|---|---|
| Food (keresés, receptek, ételnapló, YAZIO) | v29 unit/UI/owner teszt PASS | Csak v29 funkcióparitás; valódi felhő és új UI még nyitott |
| Water / Health Connect | v29 manuális kiválasztás, dedup, A/B/A PASS | Közvetlen szolgáltatás/E2E, cloud és új telefon még nyitott |
| Finance (tranzakció, bizonylat, mentés, CAS) | v29 valós UI / owner teszt PASS; #178 csak HTML ikon + docs | A végleges UI és új Supabase mentés külön ellenőrzést igényel |
| E-book | v29 helyi EPUB polc + olvasó / haladás A/B/A PASS | **Drive-hozzáférés/átvitel** független, v29-ben tudatosan tiltott; UI csak részlegesen elfogadott |
| Home (családi és egyetlen Otthon) | v29 saját Home PASS; #172 TEST családi adatbázis; #175 v42 *meghaladott* kétadatteres UX | **NO-GO** a végleges Egységes Otthonra: nincs egyesített, teljesen tesztelt adatmodell + shared E2E |
| Samsung Health direkt Water (#173) | helyi unit/browser PASS a futásban; 2026-10-26 source-commit CI **failed** a Samsung SDK ZIP letöltésén | Teljes SDK-signed artifact és valódi készülékes olvasás **nincs ezen a rögzített runon igazolva**. Más későbbi v32 siker külön azonosítandó, ne keverjük a source-futással |
| QR Stúdió | chat UX jóváhagyva; meglévő `src/qr-studio.js` / `src/qr-data.js` külön tényleges kód | A régi generator, vCard, Wi-Fi, kontraszt, PNG, Drive-project és szkennelhetőség Android paritása még nyitott |
| Outdoor / Növények | UX jóváhagyva (feladat/hely bővíthető lista), korábbi TEST design PR-ek | Tároló és valós időjárás/napló/otthonjogosultság nincs igazolva |
| Kezdő / központi Beállítások | csak UX-jóváhagyás | Widgetek akciói, értesítések, Auth/PIN/Drive engedélyek, böngészős és Android back/fókusz tesztek még nyitottak |
| Dizájn-összehangolás (#41) | 2026-10-27 vizuális workflow piros: régi Home referencia `missing nav/title` | **Nem következtethetünk ebből funkciótörésre**, de a terv-referencia tesztet javítani kell, mielőtt a felületet átvesszük |

## Supabase metaadat — csak olvasás, 2026-10-27
- TEST (`aighqtqjlzirlokxwupt`): `grapes_phase2_private_documents_cas` és családi `grapes_home_m3b_shared_test_only_20261026` migrációk megvannak; `grapes_home_private` négy táblája RLS=true, a metadata szerint már léteznek háztartási és tagsági sorok. Ez **nem** bizonyítja a teljes moduladatok távoli mentését.
- PROD (`yopabovoxyffhokhbgxl`): a vizsgált `public`, `api`, `grapes_home_private` alkalmazás táblái/migrációi nincsenek telepítve; semmi PROD-módosítás nem történt.

## Kötelező következő kapu — minden új TEST integrációra
1. **Egyetlen, új TEST integrációs ág**, amelybe előbb a még fejlesztés alatt álló Home **Egységes Otthon** kerül, a régi Saját/Közös UI **nem**; fiók- és háztartásadatok megszakítás nélküli mentésével, felülírás nélkül. A Samsung közvetlen SDK csak igazolt, licencelt buildútvonalon.
2. A jóváhagyott HTML-változatok a valós funkciókra kapcsolódjanak; ne szűnjön meg meglévő import, hozzáadás, feloldás, szkennelés, QR-export, EPUB olvasás, félretétel, blokk-OCR vagy egyedi növény.
3. Ezen az **új** headen futtassuk a teljes regressziós kaput; egy zöld **régi** v29 head nem egyenértékű.
4. Valódi TEST Supabase E2E **modulonként**: A ment → B nem látja a privát rekordot → második eszközön A visszaolvassa → offline CAS → reconnect/safe retry → nincs duplikáció, role viewer nem ír.
5. Valódi Android-on manuális fontos művelet és adatsértetlenség; külön GO a PROD schema/migrációkhoz és aláírt éles buildhez. Egy zöld build önmagában nem GO.

**Tilalom:** nincs automatikus merge, PROD írás, régi helyi adatok törlése, TEST/PROD kulcs- vagy aláíráskeverés, Drive összemosás natív Grapes Auth azonosítóval, és nincs arra állítás, hogy „minden működik”, amíg a végső összefésült kódon a teljes kapu nem zöld.
