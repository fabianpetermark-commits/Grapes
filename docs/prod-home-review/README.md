# PROD családi Home – külön review, nincs telepítés

A mellékelt konkrét SQL-javaslat a TEST M3/B backendből származik, forrása és commitja a fejlécben. Nem futott adatbázison. Nem része az APK-nak vagy automatikus migrációs folyamatnak. A v35-ben a családi PROD Home-szinkron továbbra is kikapcsolt.

Az SQL tranzakcióba foglalja a négy új privát táblát (households, members, invites, attempts), RLS deny-all beállítást, Auth JWT-alapú belső jogosultságellenőrzést és tíz SECURITY INVOKER API RPC-t. A privilegizált kód kizárólag nem exponált magánsémában, üres search_path-tal fut; PUBLIC/anon EXECUTE visszavonva. Az owner, editor, viewer, meghívó és CAS/idempotencia az eredeti szerződést követi. Három FK/lekérdezési index szerepel az eredetihez képest. Nincs Food/Water/Finance/E-book jogosultságbővítés vagy helyi adatok automatikus feltöltése.

## Telepítés előtti kötelező bizonyítás

1. Aktuális PROD séma/RPC/ACL és Postgres-verzió csak olvasó preflight; létező azonos nevű objektum esetén STOP. A 2026-09-25 Postgres changelog breaking change ellenőrzése megtörtént; a tényleges projekt verziójának kompatibilitása még igazolandó.
2. Ephemerális adatbázisban SQL és advisor ellenőrzés; majd távoli TEST-en valódi A/B/idegen Auth JWT: anon tiltás, owner/editor/viewer, meghívó-visszavonás, kilépés, párhuzamos CAS, ismételt operation_id és külön hitelesített visszaolvasás. A korábbi TEST tesztek nem igazolják ezt a PROD-javaslatot.
3. Review az api sémamegosztásról: kizárólag api exponálható; grapes_home_private soha. Más api RPC-k grantjei változatlanok.
4. Külön alkalmazásoldali PROD natív gateway és egyetlen aktív home_id. A régi Home v1 → v2 átvitel külön export+hash+előnézet+explicit elfogadás; ez az SQL csak üres backend, önmagában nem kész családi szinkron.
5. Külön telepítési jóváhagyás után `supabase migration new home_m3b_prod` hozza létre a valódi migrációt. Az itt lévő SQL review-kapuja alapból megállítja a futtatást. Nincs CLI link/push vagy adatbázis-parancs ebben a PR-ben.

## Új izolált SQL-ellenőrzés (2026-10-28)

A `.github/workflows/grapes-prod-home-sql-review.yml` kizárólag egy ideiglenes PostgreSQL 16 konténerben futtatja a javaslatot. A workflow **PASS**: SQL-szintaxis, mind a négy RLS-tábla, tíz SECURITY INVOKER API-wrapper, anon jogosultságtiltás, hitelesített háztartás-létrehozás/listázás, valamint közvetlen táblalekérdezés megtagadása. A hitelesített szerep a privát séma USAGE-jogát csak az invoker wrapper belső hívásához kapja; a privát séma továbbra sem lehet PostgREST által exponált séma.

Ez izolált PostgreSQL-ellenőrzés, nem Supabase-projekt, nem RLS/CAS teljes integrációs bizonyítás, nem advisor-futtatás és nem PROD telepítés. A tényleges Supabase TEST-en futó A/B bizonyíték nem helyettesíti a javaslaton végzett teljes owner/editor/viewer és párhuzamos CAS teszteket.

## Backup és visszaállítás

Telepítés előtt teljes séma/ACL mentés és a helyi Home export hash-e szükséges. Hiba esetén a telepítő tranzakció visszagörget. Commit utáni rollback első lépése a PROD gateway kikapcsolása és az új RPC EXECUTE jogainak visszavonása. Új családi adatok létrejötte után DROP SCHEMA CASCADE tilos: előbb ellenőrzött export, majd külön review-olt visszaállítás. A régi helyi Home adatokhoz ez a javaslat nem nyúl.

## Ellenőrzés

Forrással összevetett statikus SQL-review: négy RLS-tábla, tíz invoker API, privát definer Auth-ellenőrzések; nincs user_metadata-jogosultság. SQL futtatás/RLS bizonyítás/advisor: még NEM történt. A Supabase CLI a jelen környezetben a csak olvasható home könyvtár miatt nem inicializálható; ezért ez kifejezetten SQL-javaslat, nem létrehozott migrációtörténet.
