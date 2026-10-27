# Grapes Supabase → Egységes Otthon / teljes fiókszinkron – igazolt kapu (2026-10-27)

## Tények a *valódi* projektekből – nem feltételezések

| Vizsgált terület | Grapes TEST | Grapes PROD |
| --- | --- | --- |
| Projekt | `aighqtqjlzirlokxwupt` | `yopabovoxyffhokhbgxl` |
| Supabase Auth | aktív | aktív |
| Közös Home táblák | `grapes_home_private.households, members, invites, attempts` – RLS ON | még nincs |
| Különálló személyes dokumentumok | `grapes_private.profiles, documents, revisions, attempts` – RLS ON | még nincs |
| RPC | 10 darab `api.home_m3b_*` + 8 `api` Phase2 személyes dokumentum RPC, minden API RPC `SECURITY INVOKER`, `authenticated` EXECUTE true, `anon` false | még nincs Grapes adattárolási RPC |
| Migration history | 20261024152325 Phase2 CAS + 20261026083157 Home M3/B | Grapes migráció nincs |

A TEST privát táblái közvetlenül nem adhatók ki a Data API-n. A privát táblák RLS-without-policy INFO jelenleg szándékos deny-all; csak hitelesített, ellenőrzött `api` belépési pont engedélyezett. A TEST Auth advisor külön **Leaked Password Protection Disabled WARN** figyelmeztetést mutat; ezt be kell állítani a felhasználói azonosítás termékbiztonsági munkájában, nem feloldani RLS lazítással.

## Mi történt a PROD UI-ágon?

- A jóváhagyott, **egyetlen Otthon** három működő widgetje a #183 PR-en az aktuális PROD-forrásba került.
- A `grapes-home-household-v1` eseménynapló továbbra is **helyi**. A családi megosztás blokkolt, nem hazudunk kétfiókos szinkront.
- A TEST családi backend `schemaVersion: 2` és `prepared: []` sémája **nem** a PROD v1-ével azonos. A személyes/korábbi Home és a családi adat automatikus egyesítése tilos.
- A korábbi #163/#169/#172 TEST megoldások *technikailag újrahasznosíthatók*, de a külön Saját/Közös kapcsolós UI nem vihető át: a mostani végleges, jóváhagyott UX **egy Home**.
- `src/home/home-supabase-test-readonly.js` csak **TEST + ellenőrzött Auth** mellett működő, egyelőre UI-hoz NEM kötött felderítő. A→B fiókváltás után egyetlen A-választ sem adhat ki; nincs benne író RPC.

## Kiadás/SQL átvezetés sorrendje

1. **TEST távoli ACL/RLS és PostgREST bizonyítás**: anon denied, magánséma nincs exponálva; két külön VALÓDI Auth JWT-vel owner/editor/viewer, idegen otthon/kérés, meghívó-visszavonás, offline és párhuzamos CAS ellenőrzés. A SQL-admin olvasás **nem** helyettesíti ezt.
2. **Egységes home_id kiválasztás és migrációs felderítés**: egy használó egy alapértelmezett aktív Otthont kap; családi meghívás ehhez ad hozzáférést, **nem** új UI/adattár. A helyi v1 és a közös TEST v2 események export+hash+preflight; nem auto-sum, nem destruktív. Jóváhagyott explicit, idempotens átvitel.
3. **Valódi natív PROD Auth-tokennel végzett RPC**: a webes UI sosem kap hosszú életű bearer tokent, a natív oldalon revalidáljuk `getUser()` és szerep/household azonosítót. A saját Food/Water/Finance/E-book nem kap Family Home olvasási jogot.
4. **Tartós, fiók- és household-azonosítóhoz kötött outbox**: művelet UUID, szerver revízió/CAS, hitelesített külön visszaolvasás, konfliktuskor szigorú stop, kézi egyeztetés. Nem silent LWW.
5. **Külön PROD séma telepítés**: csak a távoli TEST és valódi kéttelefonos/szintetikus E2E PASS után, review-olt migration, backup, rollback és security advisor. Az auth-key, oauth redirect, signing és package id marad kizárólag PROD; TEST kulcs nem kerül az éles buildbe.
6. **Modulonkénti fiókszinkron**: az `api.*` privát személyes dokumentum CAS-t szigorúan owner-scoped használni a Food/Water/Finance/E-book modulokban. RLS + fiókváltás + offline + adatvisszaolvasás PASS külön-külön, soha nem Home tagság alapján.

## GO/NOGO

- ✅ PROD-forrásban lévő Home v1.2 UI-szelet, regresszió alapján (nem aláírt APK).
- ✅ TEST meglévő adatbázis struktúra/funkció jogosultságok és külön, csak olvasó adapter tesztek.
- ❌ Valódi, távoli kétfiókos A/B TEST RPC-visszaolvasás: még nem történt e szakaszban.
- ❌ V1→V2 elismert migráció, családi közös Home élő adapter, felhasználói telefonos GO.
- ❌ Grapes private/Household schema PROD telepítés és modulonkénti végleges fiókszinkron.
- ❌ Új aláírt, adatmegőrző PROD Android APK.

**Szabály:** A jelenlegi állapotot nem szabad teljes Grapes Supabase-átállásként vagy közös családi szinkronként kommunikálni; telepített PROD séma és készülékes bizonyítás előtt mindig NO-GO.
