# Grapes TEST – Health Connect vízadatok saját Water-naplóba

**Stack:** #152 Health Connect Food → #151 Home → #150 E-book → #148 Food → #145 Finance → #144 Water.
**Csak** Android Grapes TEST natív Auth + `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED=true`.
Az aktív aláírt v28-ban ez a funkció ki van kapcsolva; **nincs APK, merge, release, PROD vagy felhőírás.**

## Kézzel indítható normál mobilos használat

Szinkron → Health Connect melletti **Vízimport** gomb → kezdődátum →
„Vízadatok előnézete” → rekordok kiválasztása →
„Kijelölt vízbejegyzések mentése”.

- Kizárólag a natív Grapes Auth saját subject UUID-ja alapján nyitja meg
  a `grapes-water-v2:<subject>` helyi Water-naplót.
- Az Android Health Connect olvasáshoz csak explicit gombnyomásra kér hozzáférést.
  Az előnézet az eredeti export adatait kizárólag memóriában tartja;
  fiókhatár, háttérbe kerülés, panelbezárás vagy hibás mentés törli az előnézetet.
- A **hydration** rekordok közül a jelölhető új sorok menthetők.
  A **nutrition** rekordokat a Water előnézet kizárja, azok csak külön
  Food-jóváhagyással írhatók.
- A Health Connect `externalId` / Water `externalKey` alapján a
  korábbi és az azonos exporton belüli duplikátumok kizáródnak.
- A kiválasztott vízsorokat **egyetlen Water CAS írásba** tömöríti, az
  eredeti napok és célok érintetlenek, korábbi vízbejegyzések megmaradnak.
  Tulajdonosellenőrzés minden olvasás és mentés előtt/után. Fiókváltáskor
  a Water képernyő korábbi napi összegét/naptárát rögtön kiürítjük, és
  csak az új hitelesítés után mutatunk adatot.
- A régi, tulajdonos nélküli `grapes-water-v1`, a Finance/Home/Drive/YAZIO
  és a másik Grapes-fiók adatbázisa nem olvasható és nem változtatható meg
  ennek az importnak a során.

## Határok

- Nincs automatikus Health-import, visszairányú Health Connect szinkron,
  közvetlen Samsung Health Data SDK import, Drive felhőmentés vagy régi
  Health-v24 adatátvitel.
- A jelenlegi Water helyi CAS a WebView-origin `localStorage` személyes
  kulcsán alapul; ez nem titkosított hardvertárhely és nem többeszközös
  tranzakciós szerver. Az egyes Grapes-fiókokat a natív hitelesítés különíti el.
- **Valódi Android-telefonon** még külön kell igazolni a Health Connect
  jogosultságait, Samsung Health megosztását, dátum/időzóna-eltéréseket,
  a háttérben történő fiókváltást és a Water napló állapotának megőrzését.
- A CI Chromium tesztjei a natív Auth és a Health Connect adatait
  helyettesítik; nem helyettesítik a telefonos próbát.

## Automatikus ellenőrzés

- `tests/grapes-test-fresh-water-health.test.js`: víz-only import,
  teljes kiválasztás egy mentésben, duplikáció, idegen fiók, hibás rekord,
  Food táplálkozási sor blokkolása.
- `tests/grapes-test-fresh-water-health-mobile.browser.mjs`: valódi
  Android mobil Szinkron → Vízimport → előnézet → jóváhagyás UI, A → B → A,
  üres B, külön B napló, A duplikáció, régi Water/Home érintetlen.
- CI minden unit tesztet, Android WebView buildet és a Water, Food/Health,
  Finance, Home, E-book mobilos regressziókat újrafuttatja.
