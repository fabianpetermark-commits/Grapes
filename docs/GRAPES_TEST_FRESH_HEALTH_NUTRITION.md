# Grapes TEST – Health Connect étkezésimport saját Grapes-fiókba

**Státusz:** a #151 Home Draft PR-re épülő, külön TEST-only Draft PR.
Az alkalmazásban a fresh-owner opt-in kapu nélkül a korábbi működés változatlan.
Nincs távoli Supabase/Drive írás, régi napló-claim, kiadott APK vagy automatikus
migráció.

## Engedélyezett – szigorúan egyirányú, külön jóváhagyással

1. A felhasználó a normál Android Szinkron → Health Connect → Beolvasás
   lehetőséget kéri; a natív Grapes Auth subject előtte és az Android Health
   adatlekérdezés után is azonos, ellenőrzött UUID.
2. A Health Connect csak a külön megadott kezdődátumtól olvas. A meglévő
   `hu.grapes.healthconnect` v1 exportfolyamat ellenőrzi az időket, a
   rekordtípust, az externalId-t és a tápértékeket. Az export nyers JSON-ja
   **csak az előnézetben, a munkamenet memóriájában** van; nem kerül a régi
   projektbe, nyilvános Drive-ba vagy más fiókhoz.
3. Az előnézetből kizárólag a kijelölt új **nutrition** rekordok
   írhatók, személyes `food-current` CAS Food-dokumentumba. A mentés előtt
   és után natív tulajdonos-ellenőrzés, ütközésnél fail-closed. Az externalKey
   ismételt import esetén megakadályozza a duplikációt.
4. A **hydration** rekordok az előnézetben láthatók, de nem választhatók ki,
   nem kerülnek a Food naplóba és a Water naplóba sem. Water import majd
   külön fiókhoz kötött, atomikus folyamattal készülhet.

## Tiltott a fresh-owner kapu alatt

- automatikus Health Connect vagy Samsung Health olvasás;
- közvetlen Samsung Health Data SDK import (partnerengedély még nincs igazolva);
- YAZIO import/fiókkapcsolat, YAZIO exportarchívum, import batch napló;
- névtelen v24 régi Food/Water adat átvétele;
- Drive/Food felhőszinkron, családi könyvtár és megosztás;
- teljes Health szerveroldali átállás vagy személyes egészségadat feltöltés.

A böngészőtesztben a Health Connect és a natív Auth **helyettesítve** van.
Valós telefonon ellenőrizni kell a permission UI-t, Health Connect előzmény- és
Samsung Health adatátadást, a régi APK-ra épülő upgrade-et, valamint a
munkamenetváltást nyitott Health-engedélydialógus alatt. Az SDK adatforrás
eredetiségét az Android Health Connect jogosultsági modellje kezeli; a v1
export producermezője önmagában nem kriptográfiai eredetigazolás.

## Teszt

- `tests/grapes-test-fresh-health-nutrition.test.js`: csak saját
  nutrition, hydration-kizárás, hibás/duplikált sor, másik tulajdonos tiltása.
- `tests/grapes-test-fresh-health-nutrition-mobile.browser.mjs`: a valós
  Android mobil Szinkron + Health Connect + előnézet + jóváhagyás UI
  fiókonkénti A→B→A, víz tiltás, ismételt import és régi kulcsok érintetlensége.
- A teljes unit + Android build + Water, Finance, Food, E-book és Home
  owner regressziók a PR CI részei.

**További kapuk:** Water Health hydration kézi import, YAZIO új fiókos
import és idempotens batch/archívum, Samsung közvetlen SDK, hitelesített
Drive account-összerendelés, v24 adatkezelés, valódi készülékes QA.
