# Grapes Home TEST – Óvatos újravásárlási előrejelzés (2026-10-26)

A korábbi Home #165 (pipálás → készletbevétel) és #166 (igazolt hiány, X, 30 nap, több bevásárlólista) logika **kiegészítése**. **Nem** távoli családi PROD/TEST implementáció.

## Két külön jelzés

1. **Igazolt hiány:** csak ellenőrzött készletmozgásból ismert, nullára csökkent mennyiségnél. A mennyiség a Home eseményből származik, nem vásárlási gyakoriságból.
2. **Várható újravásárlás (becslés):** például só/élesztő, amelyet sokszor nem naplóznak. A valóban „Megvettem” állapotú vásárlások **időköze** alapján, **nem** annak bizonyítékaként, hogy a termék elfogyott. **Nincs automatikusan kiszámolt vásárlási mennyiség**.

A kettő külön címmel és indoklással jelenik meg a Home „Javaslatok” oldalon. Főzéshez és készlethez kötött bizonyíték elsőbbséget élvez: ha ugyanarra a termékre igazolt fogyási események vannak, nincs duplikált vásárlási alapú becslés.

## Konzervatív első algoritmus

- Egy termék / egységdimenzió alapján, normalizált magyar névvel csoportosított, érvényes, igazolt listás checkout események.
- **Minimum négy külön napon történt vásárlás**, vagyis legalább három megfigyelt időköz. Az egy napra eső ismételt pipálás nem ad új független mérési pontot.
- **Csak viszonylag rendszeres időközöknél** jelez: az utolsó legfeljebb hat vásárlásból képzett intervallumoknál az eltérés nem lehet nagyobb a medián 40%-ánál (vagy 2 napnál), és az átlagos időköz a 1–180 napos tartományba esik. Szélsőséges vagy kevés adat esetén nincs becslés.
- Becsült következő vásárlási időpont = utolsó megfigyelt vásárlás dátuma + intervallumok mediánja.
- Előjelzési ablak: 1–4 napos intervallumhoz **1 nap**, 5–10 naphoz **2 nap**, 11–20 naphoz **3 nap**, 21–45 naphoz **7 nap**, ennél ritkábbhoz **7–14 nap**. Tervezett UX-alapértékek, nem modellezett statisztikai konfidenciaszintek.
- Nem értelmezi elfogyásként a vásárlást, nem csökkent készletet, és nem generál saját maga „2 l tej” mennyiséget. **A mennyiség mező alapból üres.**
- Ha a felhasználó a javaslatot listára teszi, választhat cél-bevásárlólistát, és opcionálisan megadhat mennyiséget. Üres mennyiség esetén a listás vásárlás sem hoz létre fiktív pozitív készlettételt; később az ismert mennyiséget külön rögzítheti.
- A listaelem tényleges megvásárlása új gyakorisági mintát ad, mennyiség nélkül is lezárja a régi előrejelzést. Kijavított / visszavont vásárlást nem számolunk kétszer.
- Már tervezett bevásárlólistás tételnél azonos név alapján nem jelenik meg újra ugyanaz a javaslat, akkor sem, ha a mennyiség még ismeretlen.
- Elvetés: **Grapes-vörös X** (`#F28B8B`), **fiókonkénti CAS IndexedDB**-ben a javaslat + legutóbbi vásárlási esemény ciklusához kötve. A régi javaslat nem tér vissza minden nap. Új valódi vásárlás után újabb ciklus indulhat.
- Az érintetlen javaslat **30 nappal az első esedékességi figyelmeztetési dátum után** automatikusan a „Korábbi javaslatok” közé kerül. Nem kell külön háttérszolgáltatás.
- Nincs automatikus push-értesítés: a figyelmeztetés a Home megnyitásakor látszik, Android értesítési és többtelefonos egyeztetése későbbi fejlesztés.

## Biztonsági és release határ

Csak a natív Android TEST Auth által hitelesített **személyes** Home-t veszi alapul. A jelenlegi családi M3/B háttér-infrastruktúrára nem történik automatikus adatátadás. Nincs Supabase-üzemi átállás, PROD merge, megosztott Drive/Finance/Food adatokból tulajdonosi határt megkerülő olvasás.

Teszt: `tests/home-purchase-forecast.test.js`; böngészős Android-bridge szimuláció a `tests/home-replenishment-mobile.browser.mjs` végén. CI: `.github/workflows/home-purchase-cadence.yml`.
