# Grapes — élő projektindító kontextus

**Pillanatkép:** 2026-10-18, a GitHub-repó közvetlen ellenőrzése alapján. **NEM élő állapot!** Új beszélgetésnél/fejlesztésnél először `AGENTS.md`, majd `node scripts/grapes-context.mjs` vagy a GitHub Releases/PR-oldalak. A script a legfrissebb nyilvános állapotot lekéri; ez a dokumentum az állandó működési modellt és a 2026-10-18-i bázist adja.

## Projektidentitás

- Repo: [fabianpetermark-commits/Grapes](https://github.com/fabianpetermark-commits/Grapes), nyilvános.
- Web: https://fabianpetermark-commits.github.io/Grapes/
- Magyar nyelvű, egyre több modult tartalmazó web/Android alkalmazás. Web: Vite és ES modules. Android: Kotlin + WebView + natív Android bridge; APK-ban csomagolt webes assetek.
- Fő modulok: **Food/Ételnapló**, külön **Víz**, **Pénzügy**, **E-book Library/Reader**, **3D Studio**, brossúra/Fabric szerkesztő, QR/vonalkód eszközök, e-mail stúdió; a modulok eltérő készültségűek. A korábbi `README.md` kezdeti kétmodulos felvezetése nem teljes modulnyilvántartás.
- Közös Google Drive-kapcsolat, Apps Script e-book transfer broker, külön Food-adat/backup, YAZIO és Health Connect integrációk. Külső API/Drive állapotot ne feltételezd teszt nélkül.

## Branch / alkalmazás / release — NEM felcserélhetők

| Szerep | Branch vagy csatorna | Fontos |
| --- | --- | --- |
| Éles Android forrás | `codex/android-app` | Éles `hu.grapes.healthconnect`, Drive-gyökér `Grapes`, külön release signing |
| Grapes TEST forrás | `integration/grapes-test-food-20261017` | `hu.grapes.healthconnect.test`, TEST signing, TEST Drive, külön updater |
| Legacy/default GitHub | `main` | **Nem** az Android-kiadás forrásának tekintendő; HEAD külön ellenőrzendő |
| Egyéb staging | `develop`, nyitott feature/PR ágak | Ne merge-elj véletlenül a rossz ágba |
| Stabil APK | [GitHub Releases](https://github.com/fabianpetermark-commits/Grapes/releases/latest) | Csak nem-prerelease `android-vN` |
| TEST APK | [TEST prerelease-ek](https://github.com/fabianpetermark-commits/Grapes/releases?q=android-test-v) | `android-test-vN`, `grapes-test-vN.apk`, SHA-256 fájl |

**Utolsó ellenőrzött kiadások 2026-10-18-án:**
- Éles **[Android v26 / 0.16.2](https://github.com/fabianpetermark-commits/Grapes/releases/tag/android-v26)**. Korábban v23 Android JSON „Save As”/ellenőrzött export, v24 Food TEST v0.8-ból célzott élesítés, v25/v26 kalóriagyűrű-változások.
- TEST **[android-test-v9 / 0.9.0](https://github.com/fabianpetermark-commits/Grapes/releases/tag/android-test-v9)**. Korábban v0.7 ötfüles receptszerkesztő, v0.8 szerkesztett elkészítési leírás, v0.9 erősebb neon Food-kör.
- Ez a verziólista **csak dátumos pillanatkép**. Semmit nem bizonyít a telefonra történő telepítésről.

## Food: ami már kódban és kiadásban van

- Android Food napi kalória, makrók, napi célok, statisztika, étkezési sorok, receptek és saját ételek.
- USDA részben ellenőrzött offline ételek és online keresés; Open Food Facts keresés/vonalkód. API limitnél 429 lehetséges. A nyilvános USDA `DEMO_KEY` alapból szigorúbb korlátú; új kulcsot csak biztonságosan, nem APK-ba kódolva.
- Recept: **Alapadatok, Felvétel, Összetevők, Kép, Importálás** fülek; kép feltöltése, alap receptszöveg/JSON(-LD)/HTML/CSV/táblázat/DOCX/OCR fájlbeolvasás, importelőnézet. **Nem univerzális PDF-import:** a PDF-szövegkinyerés ezen a ponton nem támogatott, HTTPS oldalaknál CORS korlát van.
- Hozam a kész tömeg/egységtömeg alapján számolható; receptösszetevő tápértékhiányt `null`-ként, nem hamis nullaként kell kezelni.
- Só/cukor/víz alapanyag helyi tápértékpótlása; egymástól eltérő manual food rekordok megőrzése/csoportosítása, nincs automatikus káros duplikátumtörlés.
- Keresésnél a `Vonalkód`, `Fotó alapján`, `Kedvencek`, `Saját étel` gyorsgombok vannak a kereső alatt. A **Fotó alapján** jelenleg fényképen látható **vonalkódot olvas**, nem készételt ismer fel.
- Receptutasítások sortöréseinek és egyszerű biztonságos szövegformázásának megőrzése (PR #34).
- **YAZIO** előzményimport és Health Connect kapcsolatok: profil- és történeti adatok védelme, importált napló snapshotok pontos megőrzése. Valós API/login és régi export eltérhet a CI-szintetikus tesztektől.

Fontos források: `src/food/food-mobile.js`, `src/food/food-data.js`, `src/food/recipe-import*.js`, `src/food/food-catalog-search.js`, `src/food/food-yazio-import.js`, `design/android-mobile-preview.html`, `android-health-connect-poc/`, `tests/food-*.test.js`, `tests/android-recipe-ingredient.browser.mjs`.

## Kiadási és adatvédelmi protokoll

- **TEST:** gyors PR/CI, nincs minden commit után teljes Gradle-build. Csak külön kért verzióbump `android-health-connect-poc/test-release.json` fájlban indítja a külön aláírt `.github/workflows/release-android-test.yml` folyamatot. Debug artifact **nem** helyettesíti a tartósan aláírt telepíthető TEST kiadást.
- **Éles:** `codex/android-app` forrás és manuális `.github/workflows/release-android.yml`; csak kifejezett jóváhagyás után merge és release. A TEST automatikus egyesítése az élő appal tiltott. `main` nem stabil Android release-branch.
- Sem alkalmazás törlése, sem Food/Víz/Drive automatikus felülírás, sem TEST–éles profilok/Drive adatok összefésülése nem része az általános munkának.
- **Víznapló:** külön tárolt `grapes-water-v1`; külön biztonsági mentés és visszaállítás. Nem azonos a Food JSON-nal és nem automatikusan Drive-szinkron.
- JSON-mentésnél valós Android natív mentésválasztó ellenőrzendő; a böngészős „letöltés sikeres” önmagában nem fájlmentés.
- Az éles Food-adatok megőrzése fontosabb a rövidített migrációnál. Nincs csendes automatikus összefésülés külön profilok/Drive fájlok között.
- A felhasználói exportok, API kulcsok, OAuth tokenek és keystore **nem** kerülnek GitHubra vagy chatbe.

## UI / Brand Guide / nyitott munka

A Food neon-cyan gyűrű v25/v26 és TEST v0.9 változatát a felhasználó **túl világítónak és a Grapes-palettától eltérőnek** találta. A kért irány:
1. Grapes-logó/Android UI akcentus: **`#3BDCF2`**.
2. **Jóval kisebb glow; csak a ténylegesen teljesített ív világítson**, az el nem ért track sötét, fénytelen.
3. A kcal legyen domináns, ne a „reaktor” fény. Ellenőrizd 0/50/100% és hiányzó napi cél esetén.
4. Sötét, funkcionális UI, következetes ikonok/érintési méretek, Android safe-area és akadálymentesség.

[**PR #41 — Brand Guide v0.1 + Codex ring brief**](https://github.com/fabianpetermark-commits/Grapes/pull/41) **2026-10-18-án NYITOTT, review-ra váró dokumentációs PR**. A két fájl a `docs/grapes-brand-guide-and-ring-brief-20261018` ágon:
- `docs/GRAPES_BRAND_GUIDE.md` — javasolt színkódok, UI-tokenek, tipográfia, komponensek.
- `docs/CODEX_FOOD_RING_BRIEF.md` — célzott, alacsony glow-s gyűrűkorrekció és vizuális tesztek.

A PR #41 **nem** maga a javított kalóriagyűrű; ne jelentsd késznek, és ne merge-eld automatikusan a felhasználó jóváhagyása nélkül. Az egységes design későbbi külön feladat, nem véletlen globális CSS átírás.

## Kód- és tesztelési tájékozódási pontok

```sh
git fetch origin
git switch codex/android-app             # vagy a TEST branch – a cél szerint
npm ci
npm test
npm run build:android-web
node tests/android-recipe-ingredient.browser.mjs
node tests/android-mobile-preview.browser.mjs
node scripts/grapes-context.mjs
```

- E-book: `src/ebook-library.js`, `apps-script/ebook-transfer/Code.gs`, `npm run test:ebook`.
- Pénzügy: `src/finance-import.js`, `src/receipt-ocr.js` és kapcsolódó tesztek.
- Android mobil shell: `design/android-mobile-preview.html`, `src/android-mobile-shell.js`, `src/android-bridge.js`.
- Mobil UI tokenek vs desktop: `design/android-mobile-preview.html` és `src/styles/tokens.css` eltérhet; ne feltételezz egyesített tokent.

## Új beszélgetésben helyes folytatás

1. A felhasználó mondja: **„Grapes – töltsd be a projektkontextust”**.
2. Nézd meg a repó `AGENTS.md` és ezt a dokumentumot, majd futtasd a `scripts/grapes-context.mjs`-t **vagy** GitHub connectorral olvasd a legfrissebb Releases/PR/branch állapotot.
3. A felhasználó új feladata szabja meg a célágat; ne hagyatkozz „a legutóbbi commitra” vagy egy másik beszélgetés korábbi tervére.
4. Válaszolj rövid aktuális státusszal, kiadásadatokkal és azonosított nyitott feladattal; utána dolgozz PR-ben.
5. Tartsd meg: pontos adatok, elszigetelt TEST/éles, biztonságos mentés, kifejezett release-hozzájárulás.

A beilleszthető új-chat prompt és ChatGPT Project instrukciók: `docs/GRAPES_NEW_CHAT.md`.
