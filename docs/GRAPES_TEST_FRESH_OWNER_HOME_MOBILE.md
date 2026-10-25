# Grapes TEST – Home készlet és bevásárlólista fiókonként, normál mobil UI

**Állapot:** a #150 E-book mobil PR-re épülő külön Draft PR. Nincs APK,
merge, release, felhőírás vagy régi adatmigráció. A telepített TEST v28 változatlan.

## Pontosan mi változik az opt-in TEST módban?

- A normál Android Home → Készlet és Bevásárlólista felülete a valódi natív Grapes Auth által ellenőrzött subject UUID-hoz kötött **új, üres** `home-current` IndexedDB dokumentumot használja. A korábbi `grapes-home-household-v1` és `grapes-home-household-v1-previous` helyi kulcsokat sem olvassa, sem törli, sem rendezi automatikusan fiókhoz.
- A Home eseménynaplója, `inventory` megerősített mennyiségei, `shopping` tervezett tételei és a visszavonás ugyanazt a meglévő `applyHomeCommand` + `validateHomeState` logikát használják. `householdId` és `actorId` a saját natív Grapes Auth subject, a snapshot és az eseménynapló teljesen ellenőrzött.
- A Home pillanatképét és a **korábbi érvényes állapotot** együtt, egyetlen tulajdonoshoz kötött CAS tranzakcióban mentjük. Ütközéskor nincs csendes felülírás. A másik fiók munkamenete nem nyithatja, nem módosíthatja a régi adatot.
- A normál mobil gombok aszinkron mentésre várnak, és csak sikeres mentés után jeleznek sikert. Fiókváltáskor / háttérbe kerüléskor / visszatéréskor a régi Home készlet/lista DOM az új natív Auth ellenőrzés **előtt** üres és láthatatlan; hibánál nem mutat korábbi készletet.
- A régi, nem friss-owner Home továbbra is a változatlan helyi `createHomeStore` adaptert használja (nincs PROD változás).

## Biztonsági korlátok

A Home jelenleg **személyes helyi készlet**, nem közös családi készlet. Nem engedélyezett családi megosztás, új Drive Home kapcsolat, régi Home JSON import vagy tulajdonos nélküli mentés átvétele. A Home M2 blokk OCR → készlet irány és a Home külső Food/Finance kapcsolatok a friss fiókos módban külön engedélyezésig tiltva maradnak; sem számla végösszege, sem nem megerősített OCR sor nem hozhat létre készletet.

Az IndexedDB alkalmazás-szintű fiókváltási elkülönítés; **nem hardveres titkosítás** és nem védelem rosszindulatú azonos originű JavaScript ellen. A régi megosztott adatok érintetlenek, de ebben a fresh-owner opt-in módban nem láthatók.

## Automatizált bizonyíték

- `tests/grapes-test-fresh-owner-home.browser.mjs`: valós Chromium IndexedDB A→B→A; két saját külön készlet és bevásárlólista, változatlan mennyiség kipipálás után, eseményidempotencia, korábbi érvényes snapshot, idegen household, stale login, logout, két munkamenet CAS ütközés, régi localStorage érintetlen.
- `tests/grapes-test-fresh-owner-home-mobile.browser.mjs`: **tényleges mobil Home gombok és formok** A készlet/bevásárlólista rögzítése, B teljesen üres naplója, B saját listaeleme, A visszatérő készlete és bevásárlólistája, foreground fiókváltás DOM ürítése. Natív Auth helyettesítve; nem valódi telefonos teszt.
- A saját CI teljes `npm test`, Android WebView build és a korábbi E-book #150, E-book #149, Food #148/#146, Finance #145, Water #144, owner-store és régi adatvesztés regressziókat futtatja.

**Következő:** teljes Home/Health/Drive import- és deep-link határok auditálása,
majd valódi Android TEST APK-ban közös Food, Finance, Water, E-book, Home A→B→A próba.
A régi adatok nem migrálódnak és egyetlen távoli Drive/Supabase/PROD írás sem történik ebben a PR-ben.
