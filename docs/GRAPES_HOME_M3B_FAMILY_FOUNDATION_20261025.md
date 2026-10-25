# Home M3/B – családi háztartás: első szerveroldali TEST alap (2026-10-25)

**Állapot: csak fejlesztési Draft, nem telepített vagy Androidban elérhető funkció.** A #160 fiókonkénti Home és a #41 Brand v1.2 vizuális szerződés továbbra is különálló; a PR NEM implementál látványtervet és nem ír a valódi Grapes TEST/PROD Supabase-be.

## Megvalósított szerver- és kliensszerződés
- `src/home/home-family-data.js`: új, **kifejezetten üres** háztartás. A már mentett személyes Home-adat NEM válik megosztottá. Engedélyezett közös műveletek: kézi készlet CRUD, tárolóelosztás, bevásárlólista CRUD és visszavonás. Külső Food-/Finance-adat, OCR, készétel és személyes Health kizárt.
- `src/home/home-family-gateway.js`: kizárólag valódi `client.auth.getUser()` Supabase Auth sessiont fogad (a natív Android subject azonosító NEM hozzáférési token). Minden RPC előtt és után fiókot ellenőriz; A→B váltásnál leáll.
- `poc/home-m3b/schema-proposal.sql`: privát családi háztartás, szerkesztő/megtekintő/tag szerep; saját Auth UID; tulajdonosi meghívás generálás SHA-256 hash-sel, 256 bites egyszeri kód, lejárat, elfogadás, visszavonás; megtekintés és revíziós CAS; append-only eseménynapló és ellenőrzött stock/lista collection-delták; elveszett válasznál azonos műveletazonosító, konfliktusnál megőrzött elutasított javaslat.
- `poc/home-m3b/ci/verify-local.mjs` és `.github/workflows/home-m3b-family-foundation.yml`: kizárólag múló, localhostra korlátozott Supabase stack, három szintetikus **valódi Auth JWT** és jogosultság/ütközéspróbák. Minden adat eldobható.
- Nem létezik automatikus utolsó-írás-győz konfliktusfeloldás; a visszautasított változás kézi összevetést igényel. Az offline outboxhoz megvan a nem változó operationId/candidate szerződés, **de még nincs Androidban bekötött tartós offline sor vagy automatikus háttérszinkron**.

## Fontos biztonsági és UX határok
1. Meglévő személyes Home, készlet, receptek, blokk/OCR, Water, Health, YAZIO, Finance, Drive és E-book adatait sem ez a SQL, sem a gateway nem olvassa át automatikusan. A közös háztartás indítása később kifejezett `Létrehozás` művelet lesz.
2. Megosztás csak külön meghívás elfogadásával. Az owner létrehozhat és visszavonhat meghívót, a viewer nem ír, az editor a közös listát és készletet módosíthatja, az owner eltávolíthat tagot; az utolsó tulajdonos nem hagyhatja el a háztartást. Tulajdon-átruházás, családi kijelentkeztetés, szerepkörváltás további review.
3. Egy közös főzési esemény nem hozhat létre automatikusan személyes Food-naplóbejegyzést. Közös `prepared` és saját adagok külön következő szakasz, explicit adatvédelmi elfogadással.
4. A #41-hez tartozó Home widget és alsó Quick Action vizuális terve **még PROPOSED**. Családi kezelőfelület nem került a kiadott Android appba és nem imitálunk működő meghívás/szinkron gombot.
5. Az SQL-javaslat új `grapes_home_private` sémát használ, a szerveren csak az `api.home_m3b_*` RPC-k lehetnének elérhetők. Az Auth szerepkör a JWT-ből, nem a felhasználó által küldött userId-ból származik. A séma nincs telepítve távoli projektre.

## Kötelező következő kiadási kapuk
1. A lokális Supabase 3-fiókos CI és SQL advisor zöld eredménye, negatív jogosultságpróbák, verseny/újrapróbálás; code review a security-definer RPC-kre.
2. Jóváhagyott **külön TEST backend migráció** és távoli Auth/RLS teszt független A/B/C fiókkal; service role soha nem kerül kliensoldalra.
3. Hitelesített rövid élettartamú Android Supabase sessionátadás (natív UUID önmagában nem elég), kijelentkezés/jogosultságvisszavonás és tokenfrissítés tesztekkel.
4. Tulajdonoshoz kötött tartós offline outbox + kijelentkezés és fiókváltás védelem; manuális konfliktusfeloldási UI, veszteségmentes újrapróba.
5. Valódi Home/Brand v1.2 widgetes családi kezelés, meghívás/közös készlet UI, 320/360/390/412px vizuális ellenőrzés és telefonos 2 készülékes próba.
6. Csak explicit felhasználói jóváhagyás után merge/APK/PROD.

## Kifejezetten NINCS kész
- Több telefon között élő szinkron, automatikus meghíváskézbesítés, értesítések, offline merge, családi készétel/receptek megosztása.
- A #41-es teljes Home dizájn-átvezetés.
- M3/A fogyási minták teljes elemzése.

A biztonsági alapot **nem** szabad azonosítani egy már működő családi szinkron funkcióval.
