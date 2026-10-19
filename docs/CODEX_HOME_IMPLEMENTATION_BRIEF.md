# CODEX / Grapes Home — végrehajtási feladat (M1)

> **Indítási útmutató Codexnek · 2026-10-19 · READY FOR IMPLEMENTATION.**  
> **Repo:** `fabianpetermark-commits/Grapes`  
> **KIZÁRÓLAGOS munkabranche:** `feature/home-household-mvp-20261019`  
> **Eredeti alap:** `codex/android-app` (nem a `main`, nem a Food TEST integrációs ág).  
> **Termékspecifikáció:** [GRAPES_HOME_PRODUCT_SPEC.md](./GRAPES_HOME_PRODUCT_SPEC.md) — ezt olvasd el először.  
> **Helyi projektutasítás:** `AGENTS.md`, ha létezik / később becsatolva kerül ide; ne feltételezd, hogy a `main`-en lévő AGENTS a jó Android-baseline.

## A feladat

**Kezdd el ténylegesen lefejleszteni az új „Home / Háztartás” modult az M1 vertikális szelet erejéig; ne állj meg dokumentálásnál.** A Home a háztartás élelmiszerkészlete, nem a Grapes globális `data-page="home"` kezdőlapja. A meglévő Home landinget, a Food aktuális képességeit, a Pénzügy modult és a kiadási csatornákat tartsd változatlanul.

A felhasználó az új Home koncepciót elfogadta: családi használat, minél kevesebb manuális munka, **induláskor csak élelmiszer**, hűtő/fagyasztó elosztás, bevásárlás, később okos „Mit főzzünk?”. A design nem válhat prioritássá az adatintegritás rovására.

## Előzetes ellenőrzés – kötelező

1. `git fetch origin`, `git status`, `git branch --show-current`, `git log -1 --oneline`; ha nem a `feature/home-household-mvp-20261019` ágon vagy, válts oda **csak biztonságos tiszta munkafával**. Ha Codex Cloud saját worktree / branch mechanikát ad, biztosítsd, hogy a módosítások ebből a Home branchből induljanak, és ne a Food/#48 vagy dokumentációs/#47 ágból.
2. Ellenőrizd a `docs/GRAPES_HOME_PRODUCT_SPEC.md` dokumentumot, a tényleges mobil forrásokat (`design/android-mobile-preview.html`, `src/android-mobile-shell.js`), projekt-/storage-szolgáltatásokat és a meglévő modulteszteket.
3. Rögzítsd az aktuális, bizonyított `npm test`, `npm run build:android-web`, `npm run test:android:shell` kiindulási eredményeket. Ha az adott környezetben böngésző vagy SDK nem áll rendelkezésre, korrektül jelentsd „nem futtatható”.
4. A nyitott #47 és #48 Food/UI PR-t, a #41 Brand Guide-ot és a #43/#44 projektkontextus PR-eket olvasd csak referenciaként; **ne merge-eld** őket. Design referencia: Grapes cyan `#3BDCF2`, background `#090E14`, card `#101821`, lines `#243343`.

## M1 elvárt működő funkcionalitás

### 1. Modul belépőpont és biztonságos izoláció

- A mobil kezdőlapon legyen önálló `Home / Háztartás` alkalmazásmodul belépés.
- A jelenlegi `data-page="home"` / globális bottom-nav / Projektek / Szinkron / Továbbiak szerkezet **változatlan**. Az új modul adható `data-page="household"` azonosítóval vagy a meglévő modularchitektúrához illő megoldással; válaszd a legkisebb regressziós kockázatú integrációt.
- Visszalépés/billentyűzet/biztonságos Android WebView működjön; offline mód. Ne legyen nem működő, kattinthatónak látszó navigáció.
- Ne legyen első körben éles Drive/Supabase/Finance/Food írás. Egyértelműen látszódjon: **„Ezen az eszközön tárolva”**, amíg valódi közös szinkron nincs.

### 2. Készletmodell és tartós lokális mentés

Javasolt elkülönítés:
- `src/home/home-data.js`: tiszta normalizálás, konverzió, készlet és split események, validáció.
- `src/home/home-store.js`: verziózott, namespaced tartós mentés, ellenőrzött beolvasás, JSON export/import (ha az Android mentés valóban ellenőrizhető), mentes alapadatok / visszaállítás.
- `src/home/home-mobile.js`: UI/controller, csak saját `data-household-*` selectorok, meglévő ikon/UI tokenek.
- Eltérő fájlszerkezet megengedett, ha a felelősségi határok megmaradnak.

Modell minimum: `householdId`, `inventoryLot.id`, `name`, `ingredientId?`, `quantity`, `unit`, `storageLocation` (`fridge` / `freezer` / `pantry`), `evidenceStatus`, `sourceType`, `sourceId?`, `observedAt`, `updatedAt`, opcionális `expiryDate`, `expiryKind`, `openedAt`, `confirmedAt` és jövőbeni `actorId?`.
- Ne tárold ugyanazt az 1 kg-ot két készlettételben kétszer. Nincs negatív mennyiség, nem számolunk automatikusan össze nem kompatibilis egységeket. `kg → g`, `l → ml`, `dkg → g`, `dl → ml` kezelhető; darabhoz nem lehet kitalált súly.
- Verziózott JSON, hibás/korrumpálódott adat ne íródjon felül csendesen. Mentési/import hiba jelezve; lehetőleg visszavonás / szerkesztés a legutóbbi változtatáshoz. A Home saját adatait se keverd `grapes-water-v1`/Food/Finance kulcsokkal.
- Ismeretlen mennyiséget ne jeleníts meg `0 g`-ként. A csupán felhasználó által rögzített aktuális mennyiség lehet „megerősített”, de ne keverjük össze a vásárlási eseménnyel.

### 3. Készlet UI (csak élelmiszer)

- Áttekintés: „Mi van otthon?”; keresés / összes / hűtő / fagyasztó / kamra szűrés, állapotok/üres állapot, megerősítés és egyérintéses szerkesztés.
- Hozzáadás: név, mennyiség, egység, tároló. Opcionális dátum / lejárati **típus** (`minőségmegőrzési` vs `fogyaszthatósági`) a saját adatszerkezetben.
- Figyelmeztető másodlagos szöveg becslés / ismeretlen esetén; ne állítsd, hogy egy dátumból élelmiszer-biztonságot lehet megállapítani.
- Érintési cél legalább ~44-48 px, hosszú magyar terméknevek, 320/360/390/412 px, billentyűzet + safe-area + TalkBack.

### 4. Hűtő / Fagyasztó — ergonomikus megosztás

- A felhasználó válasszon egy meglévő, kompatibilis alapanyag-készlettételt, és ossza meg tárolók között.
- Három gyorsművelet: „Mind hűtő”, „Fele-fele”, „Mind fagyasztó”.
- Pontos egyedi `600 g hűtő + 400 g fagyasztó` is megadható 1 kg eredetiből; opcionális slider **nem** helyettesíti a szöveges/számmezős inputot.
- Két tétel összege a forráséval megegyező, helyes egység-konverzióval. Megosztás jóváhagyásáig csak előnézet; jóváhagyás után egyszeri, visszavonható mozgás.
- Tárolóváltás nem jelent vásárlást/felhasználást/fogyasztást; nincs automatikus lejárati tényállítás.

### 5. Bevásárlólista — a szándék külön a készlettől

- Új tétel, mennyiség, egység, lista, kijelölés/elhalasztás/szerkesztés/eltávolítás; mobilon használható.
- Az „Elintézve” / kipipálás **csak a listastátuszt** változtatja; a Home készletét nem módosítja, csak ha később külön megerősített bevételezés érkezik.
- Javaslati gombot csak működő logikával vezess be; ne állíts „biztosan elfogyott”-ot feltételezésből.

### 6. Home képernyő stílus

- A koncepciós [Home referencia](https://github.com/fabianpetermark-commits/Grapes/blob/docs/grapes-product-vision-ui-kit-20261019/docs/GRAPES_CONCEPT_UI_REFERENCE.md) és a [Brand Guide](https://github.com/fabianpetermark-commits/Grapes/blob/docs/grapes-brand-guide-and-ring-brief-20261018/docs/GRAPES_BRAND_GUIDE.md) Grapes-vizuális rendszeréhez igazodjon, de kódhoz **ne** importálj önkényesen félkész Food Design #48 PR-t.
- A kamera/képek nélküli képernyők se legyenek kopárak. Használj márkaszínű visszafogott ikonokat, tiszta kártyákat, egyértelmű aláírásokat.
- Nincs napi admin-kényszer, nincs rangsor/streak.
- A „Mit főzzünk?” teljes ajánlója M2/M3, és nem színlelhető működőként M1-ben; vedd figyelembe a koncepciót a bővíthető szerkezetnél.

## M1 tesztkövetelmények

- **Unit**: validáció, unit konverzió, 1000 g → 600/400, fél/fél, mind hűtő/mind fagyasztó, óvás a duplikált mozgásoktól, negatív/NaN, ismeretlen, sérült JSON, tárolóváltás.
- **State**: helyi mentés -> újratöltés -> ugyanazok az adatok, hibás adat nem írja felül a jót, bevásárlólista check nem tesz készletet.
- **Browser/UI**: megnyitás a Grapes mobil kezdőlapról, minden Home funkció használata, vissza a korábbi oldalra, 320–412px; eredeti Food/Finance modulok ugyanúgy elérhetők.
- **CI/build**: `npm test` + `npm run build:android-web` + `npm run test:android:shell` (ahol támogatott); ne módosíts TEST release JSON-t vagy Android signingot.
- **QA**: dokumentáld a bizonyított és még nem igazolt eredményeket. Ne mondd, hogy Android APK-n kész, amíg nem történt valódi eszköz-ellenőrzés.

## Mit NE módosíts

- Ne nyúlj a `src/food/*` import/napló/recipeszámítási logikájához az M1-ben.
- Ne nyúlj a Pénzügy, E-book, Water, Health Connect, YAZIO vagy Drive meglévő üzleti/adatkezelő kódjához. Új Home integrációt külön adapteren keresztül később, külön jóváhagyással.
- Ne módosíts `codex/android-app`, `integration/grapes-test-food-20261017`, `main`, `develop`, #47, #48 és release branch tartalmat; ne merge-elj és ne indíts kiadást.
- Ne használj valós személyes fájlokat/secreteket/keystore-t; tesztadatokat generálj.
- Ne csinálj helyi készletből „közös, többkészülékes háztartást”, ha még nincs valós backend és jogosultság.

## Codex munkamenet és PR

1. **Írj kódot, ne csak tervet:** elkülönült Home modell, helyi tárolás, UI, navigáció és tesztek.
2. Kis, áttekinthető commitokat készíts ugyanazon `feature/home-household-mvp-20261019` ágon; ha Codex környezet saját feladatágat használ, dokumentáld a pontos eltérést és a PR célját.
3. A kész M1 kódhoz **draft PR** a `codex/android-app` alapág felé. Az issue-t és ezt a briefet linkeld; hangsúlyozd: review előtt **nincs merge**, később külön TEST integrációs jóváhagyás.
4. A PR-ben szerepeljen: changed-file lista, adatmodell, bizonyítékalapú teszteredmény, 320/390px képernyőkép vagy a hiány oka, ismert korlátok, következő M2 bridge.
5. Ha valami ténylegesen blokkolja az M1-et, szűkítsd a slice-ot, és nyiss blokkert, de ne kerülje meg a felhasználói adatvédelmet.
6. **A feladat nem a későbbi Home-integrációk vagy a családi szinkron előre-élesítése.**

## A Codex első végrehajtandó parancsai

```bash
git fetch origin
git switch feature/home-household-mvp-20261019
git status --short
npm ci
npm test
npm run build:android-web
```

A fenti parancsok végrehajtása előtt kezeld a környezet sajátos Codex-feladat/worktree viselkedését; ne törölj módosított fájlokat. Ha `npm ci` nem érhető el, jelentsd a környezeti hibát. Ez a dokumentum önmagában nem bizonyítja, hogy Codex elindult vagy a build lefutott.

**M1 teljesítési feltétel:** önálló Home, valódi működő élelmiszer-készlettel, hűtő/fagyasztó megosztással, bevásárlólistával, offline biztonságos adatkezeléssel, tesztekkel és draft PR-rel — bármiféle élesítés nélkül.
