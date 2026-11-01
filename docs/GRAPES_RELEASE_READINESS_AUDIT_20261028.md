# Grapes v1.2 – aktuális kiadási állapot / GO–NO-GO
Dátum: 2026-10-28. Kanonikus forrás: `codex/android-app`. Ez a dokumentum a korábbi `GRAPES_FULL_V12_RELEASE_GO_NO_GO_20261027.md` állapotát frissíti a #203, #216 és #222 tényleges eredményeivel.

## Rövid döntés
**PROD RELEASE: NO-GO. TEST UI-integráció: automatizáltan ígéretes, fizikai telefonon még NOT RUN.** A következő aláírt jelölt a #222 v52 TEST APK, nem PROD kiadás. A #223 a teljes családi fiókváltás-tesztet és a v1.2 modul regressziókat futtatja újra a jelenlegi forráson.

## Friss, ellenőrzött tények
- **#203 merged:** hatikonos v1.2 főmenü és tényleges „Gyakran használt” kezdőlap.
- **#216 merged:** elfogadott UI összekötése az élő Home, Outdoor, Tools és Finance modulokkal; mobil preview, főmenü, Tools és Finance route regressziók.
- **#222 Draft:** v52 aláírt TEST APK jelölt, 16/16 GitHub Actions ellenőrzés PASS. Build metaadat: `hu.grapes.healthconnect.test`, versionCode 52, versionName `0.9.52-one-home-ui-test`. APK SHA-256: `362185bd4fc0546a62626bcb5d80e13436ca456e3f3a733b10a6bb06cd95ec7f`; TEST aláíró SHA-256: `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`. [Build/artefakt Run](https://github.com/fabianpetermark-commits/Grapes/actions/runs/40723322319).
- **#223 Draft:** a Codex korábbi 21 PASS / 2 FAIL teljes láncú Home QA-tesztje újrafuttatva a jelenlegi forráson, kiegészítve a Finance backup export/import és az élő v1.2 modulok ellenőrzésével. A CI eredménye csak a futás befejezése után tekinthető bizonyítéknak.
- **#192 merged:** a késői CAS/read-attempt hibautakban az owner újraellenőrzése bekerült a jelenlegi forrásba; a #223 ezt a konkrét esetet újrateszteli.
- A TEST Supabase projekt `aighqtqjlzirlokxwupt`; PROD `yopabovoxyffhokhbgxl`. **A PROD adatbázis sémáját nem módosítottuk.**

## Modulonkénti GO/NO-GO

| Terület | Jelenlegi állapot | Kiadás előtt még kell |
|---|---|---|
| Főmenü / Gyakran használt | #203/#216 merged; #222 CI PASS | v52 fizikai telefonos navigáció és duplikáció-ellenőrzés |
| Egységes Otthon | Egyetlen három-widgetes UI; TEST Auth/CAS/outbox; #222 CI PASS | #223 fullchain eredmény; telefonos A→B→A, offline/reconnect és ütközés; meghívó/jogosultságkezelő teljes működésének döntése |
| Outdoor / Növények | Élő növénynyilvántartás, katalógus, locsolási/teleltetési napló és teendők forrásban; #216 bekötés | #223 browser QA és v52 fizikai telefon; időjárási figyelmeztetések/értesítések tényleges elvárt viselkedésének elfogadása |
| Tools / E-book / QR | #216 bekötés és #222 UI CI PASS | telefonon az ikonközpontú Tools, E-book import/olvasás/Drive és QR generálás, navigáció egyenként |
| Finance | Öt nézet és valós modulútvonal; #222 route + CI PASS | #223 teljes backup/export/import teszt; telefonon mentés/törlés előtti biztonsági export, Drive és OCR |
| Health / Food / Víznapló | #222 Health live-controller CI PASS; meglévő Food és Health Connect funkciók | telefonon Food/receptek/statisztika/víznapló; Health Connect engedélyek és adatmegőrzés; Samsung integráció pontosan jelölje, melyik API működik |
| Beállítások / Auth | v1.2 Settings safe UI + Auth recovery/config CI PASS | fizikai telefonon az egyes kapcsolók, fiók-váltás, Drive leválasztás, backup, engedélyek; ne csak a vizuális állapot legyen elfogadva |
| Samsung Health közvetlen SDK | **Nincs kiadási bizonyíték** arra, hogy a licencelt Samsung Health Data SDK ténylegesen elérhető és működik a felhasználó telefonján. #216 egyik SDK/owner ellenőrzése sikertelen volt. | licencelt AAR/SDK + valódi csomag/tanúsítvány regisztráció + telefonos permission és readback. Addig csak egyértelműen megnevezett Health Connect/CSV fallback; ne állítsunk direkt Samsung syncet |
| Supabase PROD családi Home | **NO-GO**; csak TEST projekt bizonyított | külön review-zott PROD schema/migration, RLS/role/isolation/idempotency, rollback, két valódi account QA és explicit jóváhagyás. Nincs automatikus PROD SQL vagy adatírás |
| Android release | v52 TEST signed candidate, 16/16 CI PASS | telefonos felültelepítés adattörlés nélkül; az APK hash/signer/package/version egyezés; külön PROD csomag/aláírás, adatvesztés nélküli frissítés és kiadási jóváhagyás |

## Következő lépések – sorrend
1. #223 CI végigfuttatása a jelenlegi forráson. A fullchain fiókváltási hibát és a Finance backup export/importot nem lehet kihagyni vagy expected-failure-re állítani.
2. A #222 v52 TEST APK telepítése a meglévő TEST app fölé, **app/adattörlés nélkül**. Hash, csomag, verzió és aláíró ellenőrzése; telefonos UI/A-B/offline smoke teszt.
3. A képernyők tényleges működésének elfogadása: Home, főmenü/favorites, Outdoor, Tools/E-book/QR, Finance, Health/Food/Víz, Beállítások. A CI nem helyettesíti a fizikai telefont.
4. Samsung Health SDK külön kapu; ha nincs licencelt SDK és valós readback, a funkciót korlátozott fallbackként kell feltüntetni.
5. Csak ezután PROD előkészítés: Auth/owner, adatmodell, migration/RLS review, signer, backup/rollback, explicit release approval.

## Változatlan biztonsági korlátok
- Nem írunk a PROD Supabase adatbázisba e dokumentum alapján.
- Nem publikálunk és nem állítunk telefonos PASS-t CI-ből.
- „Megvettem” csak vásárlási állapot; nem készletbevétel.
- A meglévő helyi Home v1, Food, Finance, Water és E-book adatokat nem töröljük teszt kedvéért.
