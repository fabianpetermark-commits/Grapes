# Grapes TEST – YAZIO fájlimport a saját natív Grapes-fiókba

**Állapot:** külön Draft PR a #153 Water Health, #152 Health Food, #151 Home,
#150 E-book, #148 Food, #145 Finance és #144 Water ágakra épül. A jelenleg
telepített aláírt TEST v28 nem tartalmazza. Nincs merge, APK, release, PROD
vagy távoli Supabase/Drive írás.

## Elérhető az opt-in Android TEST-ben

1. Szinkron → **YAZIO** → **Kapcsolódás** → „JSON vagy CSV fájl kiválasztása”.
2. A felhasználó helyben kiválasztja a **YAZIO export JSON** (yazio-exporter
   táblázatos bundle) vagy **nutrition_log.csv** fájlt, legfeljebb 40 MB.
   Ez **nem a közvetlen YAZIO-bejelentkezés**: jelszó, token, a telefon
   régi YAZIO-munkamenete nem használható.
3. Külön előnézet: új, duplikált, hibás és bizonytalan sorok. A bizonytalan
   rekordok **nincsenek automatikusan kijelölve**; kijelölésük tudatos döntés.
   Legfeljebb az első 250 sor szerepel külön vezérlőkkel; a maradék biztosan
   új sorok bevonása külön kijelölhető.
4. Mentés előtt és után natív subject-ellenőrzés, friss Food `food-current`
   betöltés és CAS mentés. `profile.id`, naplósorok és a visszavonható
   `importBatches` az aktuális natív Grapes subject UUID-hoz vannak kötve.
   Másik fiók vagy ütközés esetén a mentés leáll.
5. JSON esetén a teljes korábbi exporter-adatcsomag a **saját Food-fiók
   IndexedDB dokumentumában** megmarad (beleértve a nem naplózott kapcsolódó
   tételeket). CSV esetén külön névvel és importköteg-azonosítóval kerülnek
   be a sorok; a CSV-fájl szövegét nem archiváljuk teljes egészében.
6. A YAZIO panel **„Utolsó import visszavonása”** művelete csak az
   aktuális fiók legutolsó élő YAZIO-kötegére hat. A később módosított
   vagy felülírt rekordok megmaradnak, a módosított rekordazonosítók
   jelzésre kerülnek.

## Mi marad zárolva?

- Közvetlen YAZIO REST belépés, automatikus YAZIO háttérszinkron,
  Androidon mentett globális YAZIO jelszó/session átvétele vagy használata.
- Régi owner nélküli Food/Water adat, legacy importnapló automatikus
  hozzárendelése bármely Grapes-fiókhoz.
- Google Drive kapcsolat, családi megosztások és nem fiókozott backup-import.
- Két eszköz felhős összevezetése; kizárólag ugyanazon eszközön
  különálló fiókpartíciókat használunk.

## Bizonyíték és korlát

- `tests/grapes-test-fresh-yazio.test.js`: JSON és CSV, visszavonás,
  forrásarchívum, duplikátum, másik owner, módosított sor védelme.
- `tests/grapes-test-fresh-yazio-mobile.browser.mjs`: a normál mobilos
  YAZIO gomb, Android fájlválasztó, előnézet, mentés, két külön fiók,
  A → B → A, idempotencia, visszavonás, érintetlen régi adatok.
- CI: `npm test`, Android WebView build, Water/Health, Finance, Food,
  Home és E-book korábbi A → B → A regressziók.

A tesztek Chromium és **helyettesített natív Grapes Auth** mellett futnak;
valódi készüléken és nagy méretű, személyes exporttal további teszt
szükséges. Drive összerendelését külön, fióktulajdonosra ellenőrzött
terv és távoli hitelesítés nélkül nem kapcsoljuk be.
