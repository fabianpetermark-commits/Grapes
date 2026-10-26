# Grapes Home M3/B – hosted TEST bizonyítás és kiadási kapu

2026-10-26 · Eredeti PR-lánc: #164 → #165 → #166 → #167 → #168 → #169 → #172.

## Projektkörnyezetek

- **Grapes TEST**: `aighqtqjlzirlokxwupt` – kizárólag ide került M3/B migráció.
- **Grapes PROD**: `yopabovoxyffhokhbgxl` – nem módosítandó addig, amíg a telefonos ellenőrzés és a kiadási döntés meg nem történt.
- Az M3/B nem másol automatikusan személyes Food-, Water-, Finance-, Health- vagy E-book adatokat a családi készletbe.

## Valóban ellenőrzött eredmények

1. Induláskor: TEST-ben `api` már létezett, `grapes_home_private` hiányzott, `home_m3b_*` RPC nem volt.
2. **Sikeres hosted TEST migráció**: `20261026083157_grapes_home_m3b_shared_test_only_20261026` a Supabase migrációtörténetben.
3. TEST-ben 10 `api.home_m3b_*` függvény található; `authenticated` EXECUTE engedély igazolt, `anon` EXECUTE megtagadott. A wrapper-függvények `security invoker` módúak.
4. A `grapes_home_private` négy tábláján (households, members, invites, attempts) **RLS aktív**, közvetlen `anon` és `authenticated` SELECT nincs.
5. A korábbi CI az elszigetelt **valódi helyi Supabase Auth/JWT** háromfelhasználós CAS, RLS, meghívó, owner/editor/viewer, ütközés, idempotencia és visszaolvasás tesztjeiben PASS; hosted TEST Auth/JWT két valós mobilfelhasználóval még nem bizonyított.
6. A hosted TEST Data API külön anon és privát-séma HTTP-probe-ja, natív QA build, APK SHA és aláírás bizonyítás a dedikált v40-es Actions workflow feladata: `.github/workflows/grapes-home-v40-hosted-qa.yml`.

## Security advisor

Az RLS-enabled-no-policy INFO a **privát, közvetlen jogok nélküli**, a kapcsolati API-n kívül maradó táblákon szándékos, további publikus tábla grant nincs. Az Auth leaked-password-protection-disabled WARN nem az M3/B migráció eredménye; külön Supabase Auth-hardening feladatként kezelendő.

## Telefonos QA a telepíthető v40 TEST jelölttel

1. Az aktuális `hu.grapes.healthconnect.test` fölé telepítendő a QA APK **adatok törlése nélkül**, egyező TEST aláírással, `versionCode=40` ellenőrzéssel.
2. Bejelentkezés A-fiókkal; **Továbbiak → Családi készlet**, háztartás létrehozása.
3. Egyszeri meghívó kiadása; B-fiókkal csatlakozás, owner/editor/viewer jogaival működés és elutasítás ellenőrzése.
4. B közös bevásárlólistához kenyér `1 db` tételt ad, `Megvettem`; A frissít és a közös készletben **egyszer** találja; nincs duplán bevételezés.
5. A→B→A fiókváltás; idegen családi adatok tiltva, saját Home/Food/Finance/Drive változatlan.
6. Offline változtatás és visszatérés online; függő CAS művelet újrapróbálás és szerveroldali igazolás; konkurens szerkesztéskor megőrzött konfliktus, **semmilyen automatikus felülírás**.
7. Negatív tesztek: névtelen műveletek és viewer írás tiltott, privát moduladat nincs kitéve.

## Kiadhatóság

**NO-GO a PROD/végleges kiadásra**, amíg a hosted valódi kétfiókos mobilteszt, kulcshatárok, rollback terv és natív csomag próba nincs rögzítve. A teszt APK előállítása nem kiadás; a #172 Draft és a PR-lánc nem merge-elt.
