# Grapes Home M3/B — családi alapok (2026-10-25)

## Egyelőre **nem kész családi szinkron**
Ez az ág kizárólag **külön, előkészítő Supabase TEST szerződés**; a tárolási backend végleges megválasztása az eredeti Home specifikáció szerint nyitott. A korábbi személyes Home `home-current` adatait **nem mozgatjuk, nem másoljuk, nem töröljük**, nem csatlakoztatjuk hallgatólagosan közös háztartáshoz. A TEST és PROD Supabase projektekhez nem nyúlunk: a GitHub CI-ben épülő, magától eldobható, helyi Postgres/Auth/PostgREST fut.

Eredeti irány: `docs/GRAPES_HOME_LOGIC_SPECIFICATION.md` @ `feature/home-household-mvp-20261019`, különösen 7.4., 11. és H-20/H-21.

## Kipróbálható backend-szerződés
- `poc/home-family/schema-proposal.sql`: teljesen külön, **nem exponált** `grapes_family_private` tábla- és függvényséma; exponált, `SECURITY INVOKER` `api.home_*` RPC. Az összes családi tábla RLS-sel zárt, közvetlen adattábla-hozzáférés senkinek nincs kiosztva.
- **Tagok**: egy tulajdonos (a létrehozó), meghívott szerkesztő és megtekintő. A meghívás csak célzott, létező Grapes Auth UUID-ra készül, és csak a címzett jóváhagyása után keletkezik tagság. Meghívással nem lesz elérhető semmilyen személyes Food/Health/Pénzügy profil vagy rekord.
- **Jogosultságok**: tulajdonos meghívhat és tagot kizárhat, szerkesztő módosíthat közös snapshotot, megtekintő csak olvashat. A tulajdonos nem távolíthatja el saját magát. Szerepkörváltás, meghívó visszavonása, végleges családtörlés és export még nincs.
- **Közös snapshot CAS**: családazonosító, teljes revízió és műveleti UUID szükséges. Elavult revíziónál `conflict` és saját, elutasított jelölt visszaolvasása; nem írjuk felül más sikeres módosítását. Azonos azonosítójú / azonos tartalmú sikeres kérés idempotens; eltérő tartalommal felhasznált op-ID elutasítás.
- **Fiókmegszűnés**: eltávolított vagy megváltozott szerepkörű tag új híváskor ismét ellenőrizve; korábbi token vagy korábbi próbálkozás nem jogosít írásra.
- **Külön családi adatkör**: csak a külön létrehozott háztartás snapshotjának tárolását tervezzük. Az első személyes Home-állapot `householdId=ownerId`; ez **nem** egy családi háztartásazonosító. A jelen prototípus szándékosan **nem** migrálja.
- **Külön kliensbekötés szükséges**: a jelenlegi `src/home/grapes-test-fresh-home.js` csak natív, személyes CAS tárhelyet ismer. Ne nevezzük ezt valós többkészülékes szinkronnak, amíg külön opt-in/mentés/import, jogosultsághiba, offline konfliktus-visszajátszás, főzés/étkezés és Finance forráshatár nincs igazolva.

## Tesztkapu
- `poc/home-family/ci/verify-local.mjs`: három **valódi, de csak lokális** Supabase Auth-fiók, új háztartás; célzott meghívás, elfogadás, jogosulatlan elfogadás és ismétlés, A/B párhuzamos CAS-ütközés, tartós idempotencia, csak saját elutasított művelet, megtekintő tiltás, tagkizárás és RLS/jogosultság-ellenőrzés.
- Workflow: `.github/workflows/grapes-test-home-m3b-family-contract.yml` teljes Home unit + Android web + A→B→A meglévő mobiltesztekkel.
- Egyetlen SQL művelet sem fut távoli adatokon; **nincs kiadott APK, merge vagy PROD release**.

## M3/B valódi befejezéséhez még szükséges
1. A családi hozzáférési modell (meghívás/kilépés/szerepkör) felhasználói jóváhagyása, valódi TEST-backend kiválasztása és távoli RLS-biztonsági ellenőrzés.
2. Közös otthoni készlettételek **külön opt-in** létrehozása vagy megerősített megosztása; soha nem másoljuk át automatikusan A személyes Home/Food/Finance adatait.
3. Szerver által hitelesített Home parancsok, eseményreplay, forrásduplikáció és atomikus tárolás; tartós offline outbox, CAS konfliktusfelfedés és kézi döntési felület, nem „utolsó írás nyer”.
4. Meghívás visszavonása, szerepkörváltozás, export és helyreállítás.
5. #41 Brand v1.2 közös Home UI-t követő **külön vizuálisan jóváhagyott TEST kliens-PR**, 320/360/390/412 px, Android két eszközzel és A→B→A, majd külön kiadási döntés.
