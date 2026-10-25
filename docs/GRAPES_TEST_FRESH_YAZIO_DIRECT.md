# Grapes TEST – YAZIO egyszeri közvetlen beolvasás, fiókhoz kötötten

Stacked Draft PR a #154 YAZIO JSON/CSV, #153 Water Health és a korábbi
Water/Finance/Food/E-book/Home átállásokra építve. A felület kizárólag natív
Grapes TEST Auth + fresh-owner opt-in kapcsoló mellett használható. A
telepített TEST v28, PROD és távoli adat változatlan.

## Működés

Szinkron → YAZIO → **Egyszeri fiókbeolvasás**. A felhasználó az adott
alkalomhoz beírja a YAZIO e-mail/jelszót, választ egy legfeljebb 366 napos
időszakot, majd megnyomja az „Adatok beolvasása” gombot.

- A Grapes natív subject ellenőrzése még YAZIO belépés előtt megtörténik.
- A kliens kizárólag a natív Android `yazio('login', email, password)`
  (nem `loginRemembered`, nem `loginSaved`) műveletet hívja.
  A jelszót a panelből azonnal kiüríti, nem írja helyi vagy felhőtárhelyre.
- A meglévő `readYazioApiBundle` az egyes napokat és termékek
  tápértékadatait olvassa; minden natív válasz előtt és után ismét
  ellenőrzi a Grapes subjectet és a megszakítási állapotot.
- **Minden kimenetben** `yazio('logout', session)` hívás zárja az
  egyszeri YAZIO munkamenetet, akkor is, ha a fiók időközben megváltozik,
  a lekérés hibás vagy a panel bezárul.
- A beolvasott YAZIO bundle csak az aktuális fiókhoz újraellenőrzött,
  nem mentett JSON-előnézetbe kerül. Étkezés mentéséhez továbbra is a
  #154-ben elkészült **rekordszintű kiválasztás és CAS-jóváhagyás**
  szükséges.
- A nem támogatott típusok a YAZIO bundle `raw_days` archívumában
  megmaradnak és figyelmeztetés jelzi őket; nem válnak téves étkezéssé.

## Tiltások

Nincs háttérszinkron, mentett natív YAZIO hitelesítés átvétele, Google
Drive szinkron, fiókok közötti import, régi Food adatclaim vagy automatikus
YAZIO-kezelés. A közvetlen YAZIO kliens régi, támogatásában bizonytalan
API-útvonalát valódi Android készüléken még ellenőrizni kell. A native
Auth és YAZIO szerver a CI Chromium tesztjében **helyettesített**.
Nincs APK, release, merge vagy PROD kiadás.

## Tesztek

- `tests/grapes-test-fresh-yazio-direct.test.js`: egyszeri login,
  több fázisú YAZIO lekérés, logout, hibás hitelesítő adatok, fiókváltás
  és megszakítás.
- `tests/grapes-test-fresh-yazio-direct-mobile.browser.mjs`: normál
  Android mobil Sync/YAZIO egyszeri fiókbeolvasás, valódi gombok,
  előnézet, Food-művelet A→B→A, YAZIO subject váltás közbeni leállás,
  mentett hitelesítő adatok mellőzése.
- CI: teljes npm unit teszt, Android WebView build, YAZIO JSON/CSV,
  Health Connect Food/Water, Water, Finance, Home és E-book regressziók.
