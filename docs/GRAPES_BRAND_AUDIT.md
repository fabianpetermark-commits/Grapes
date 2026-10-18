# Grapes – arculati audit és végrehajtási döntési alap (2026-10-18)

> **Státusz: forráskódalapú audit, a javítások prioritási javaslata; vizuális végellenőrzés és felhasználói képernyőkép-jóváhagyás még hátravan.**
> A Brand Guide v1.0 **jelöltet** a [#41-es draft PR](https://github.com/fabianpetermark-commits/Grapes/pull/41) tartalmazza. Ez a jelentés nem implementáció, nem APK, nem teljes körű WCAG-tanúsítás.
> **Környezetek:** éles Android: \`codex/android-app\` @ \`9167a691\`; TEST: \`integration/grapes-test-food-20261017\` @ \`fce23335\`; az alap webes komponensek: éles branch \`src/styles/*\`. A \`main\` nem az Android production forrása.

## 1. Döntésre előkészített összegzés

A meglévő mobil UI és a TEST **azonos** sötét/cyan alappal és megegyező mobil SVG-ikontárral rendelkezik. **Megőrzendő:** a \`#3BDCF2\` interakciós akcentus, \`#090E14\` háttér, \`#101821\` kártya, a két külön logóváltozat, a modulok saját tartalmi jelentése és az éles/TEST környezet szigorú elválasztása.

**Első javítási hullám / P1:** BR-01–05, ezeken belül **először BR-01 + BR-05 együtt**, mert a kalóriakör régi vizuális regressziós tesztjei is a hibás neont várják. BR-02/03 csak ellenőrzött, kisebb lépésekben; BR-04 QA-kapu a vizuális PR-ekhez. **P2:** BR-06–12 későbbi, modulonkénti egységesítés. **P3:** BR-13–14 dokumentáció és fontválasztás. A prioritási sorrend **nem jelenti** az egyes látványtervek végső vizuális elfogadását.

Az audit eddig **statikus**: GitHub-forrásfájlok és meglévő tesztek átolvasása, nem új mobil/emulátoros futás. A lent megjelölt kockázatokat **ne** jelentsük készüléken reprodukált hibának.

## 2. Azonosított eltérések

| ID | Prió | Hatókör | Tény / kockázat | Javítás és elfogadási feltétel |
| --- | --- | --- | --- | --- |
| **BR-01** | **P1** | Éles + TEST Food | A \`.energy-ring\` \`--energy-fill:#91ffff\`, \`--energy-track:#147e96\`, teljes körös \`box-shadow\`, és \`::before {filter:blur(9px)}\` miatt 0%-nál is világító teljes kerület. 100%-nál \`#a7ffff\` erősítés. | [#42](https://github.com/fabianpetermark-commits/Grapes/issues/42): sötét, fénytelen track; **csak az aktív \`#3BDCF2\` ív** kap enyhe glow-t; 0/50/100/nincs cél/ismeretlen kcal. |
| **BR-02** | **P1** | Mobil tipográfia | Éles/TEST mobil HTML-ben egyenként **74 db 12px alatti \`font-size\` deklaráció** (nem 74 külön képernyőhiba). Példák: \`Elfogyasztva\` 7px; alsó nav 10px; szinkron státuszok 9–11px. | Kritikus címkék 12–13px vagy jobb tördelés; 320/360/390/412px, megnövelt rendszerfont, eltakarás és hosszú magyar szöveg ellenőrzése. |
| **BR-03** | **P1** | Mobil touch-target | \`.daily-card__menu\` 36×36px, Food keresőfilter 36px, \`.module-tab\` 38px, \`.sync-provider button\` 38px, receptfül 44px. | Fő műveleteknél 48×48px **érintési terület** (nem feltétlenül ekkora látható ikon), indokolt másodlagos minimum 44px, ütköző hitbox nélkül. |
| **BR-04** | **P1** | Vizuális QA | A Chromium mobil böngészős teszt 390×844-es viewportot használ, készít screenshotokat; nincs igazolt jóváhagyott golden 320/360/390/412-es és fontscale-/gyűrűállapot-mátrix. | Stabil screenshot baseline, overflow-, focus-, contrast- és akadálymentességi ellenőrzés; kézi készülékes lépések külön. |
| **BR-05** | **P1** | Kalóriakör tesztjei | Prod \`tests/food-neon-ring.test.js\` és \`tests/food-energy-neon.test.js\`, TEST \`tests/food-test-neon-ring.test.js\` kifejezetten a régi erős halót tesztelik. | A #42 UI-módosítással **együtt** a teszteket a helyes 0/50/100 és célhiány állapotra cserélni, nem törölni. |
| **BR-06** | **P2** | Tokenrendszer | Mobil \`--accent:#3BDCF2\` / \`--bg:#090E14\`; web \`--color-accent:#4C8DFD\` / \`--color-bg-app:#0F1318\`. A dokumentált \`--grapes-*\` tokenek még **nem implementált** közös CSS-változók. | Közös szemantikus szótár, dokumentált platformértékek; későbbi célzott migráció, nem globális keresés/csere. |
| **BR-07** | **P2** | Webes Food | \`src/food/food.css\` világos zöldes téma (\`#F6F8F4\`, \`#17221B\`), míg Android Food sötét-cián; 40 különböző nyers hexkód. | Rögzíteni, hogy tudatos világos webes variáns marad-e; addig nincs önkényes átszínezés. |
| **BR-08** | **P2** | Navigáció és ikonok | Meglévő egységes \`src/android-mobile-icons.js\` mellett az Android alsó nav karaktereket használ: \`⌂\`, \`▤\`, \`↻\`, \`•••\`. | Külön kis PR SVG-nav ikonokra; optikai és TalkBack ellenőrzés. A webes sprite-rendszer maradhat külön implementáció. |
| **BR-09** | **P2** | Modulprogress / grafikonok | Víz progress \`#52C7FF\`, Finance lila megtakarítás és borostyán terv, Food cyan; **nem mind brandhiba**. | Szemantikus kategóriaszín-térkép, funkcionális kivételek és csak aktív szakaszon indokolt glow. |
| **BR-10** | **P2** | Karbantarthatóság | \`design/android-mobile-preview.html\` kb. 102 kB, ebből kb. 52 kB inline CSS; sok helyi hex/szabály. | CSS/tokenezés fokozatosan, külön vizuális snapshot-védőhálóval; nem #42 scope. |
| **BR-11** | **P2** | 2D/GrapesJS/QR és legacy | Legacy \`#00E5FF\` és \`!important\` felülírások, QR saját fallback színek, egyedi editor chrome. | Csak eszköztárak/dialogok közösítése; nyomtatási vászon, QR-kód olvasható fehér területe és renderelt tartalom **nem** brandátfestési cél. |
| **BR-12** | **P2** | 3D Studio CSS | \`src/styles/screens/studio.css\` \`var(--z-popover)\`, \`var(--shadow-lg)\` referenciáit a központi \`tokens.css\` nem definiálja. | Előbb más scope-okban ellenőrizni; ha ténylegesen hiányzik, célzott token-fix. Jelenleg **statikus gyanú**, nem reprodukált futásidejű hiba. |
| **BR-13** | **P3** | Fontkezelés | Android CSS Intert kér, de az ellenőrzött HTML nem tölt saját Inter-webfontot; lehetséges system fallback. | Fontstratégia és hosszú magyar szöveg / rendszerfont teszt; nincs szükség új betűtípusra csak a márkakövetkezetesség kedvéért. |
| **BR-14** | **P3** | Dokumentáció | \`ANDROID_UI_DESIGN_PLAN.md\` 48px fő touch targetet ír; desktop coarse pointer CSS 44px, mobil speciális gombok kisebbek. | Új guide mindig jelölje: **jelenlegi implementáció / célállapot / teszttel igazolt állapot**. |

## 3. Modulmátrix és jóváhagyottként *nem kezelhető* kivételek

| Modul | Vizuális audit fókusza | Mit **nem** változtatunk automatikusan |
| --- | --- | --- |
| Mobil shell, Projektek, Szinkron | Betű, navigáció, badge, sheet, 48px cél, safe-area | Google/Drive/Android bridge logika |
| Food Android, receptek | Gyűrű, célhiány, 5 fül olvashatósága, kereső, menü | Napló-, YAZIO-, USDA-, Health Connect- vagy receptszámítás |
| Víz Android | Progress szín / track / állapotjelzés, kontraszt | Külön \`grapes-water-v1\` tárolás/backup |
| E-book, mobil olvasó | App kezelőszervek és tördelés | A könyv szövegének/olvasói beállításainak szabad megjelenése |
| Pénzügy | Mobil toolbar, dialógus és grafikonlegendák | Pénzügyi kategóriák szemantikus színkülönbsége |
| QR, vonalkód | Kereső/toolbar/dialog kontrollok | A beolvasható fekete-fehér QR munkaterület |
| Számla, 2D / Brossúra, 3D, E-mail | Responsive toolbar / modal / inspector és tokenek | Nyomtatási, szerkesztő- és exportvásznak tényleges tartalma |
| Webes Food / egyéb web | Platformszintű eltérések és megőrizhető variánsok | Önkényes mobil témára cserélés |

**Technikai különbség:** Androidon Food és E-book natív mobil shellben jelenik meg; Finance, QR, Billing, Brochure, Studio, Email egy része az \`index.html\` webes moduljára navigál shell-paraméterrel. Nem elegendő csak a mobil HTML CSS-t ellenőrizni.

## 4. Végrehajtási sorrend, kapuk, elfogadási lista

1. **Most:** az audit rögzítése és a **Brand Guide v1.0-rc1** szabványtervezetének kidolgozása **a #41-es draft PR-ben**, felhasználói véglegesítésre. A PR draft marad, nincs merge.
2. **Első implementáció:** BR-01 + BR-05 = #42: külön PROD és TEST PR, képernyőkép 0/50/100%, napi cél nélkül, hiányzó tápértékkel, 320/360/390/412px-en. Nem lehet 0%-os halo; a progress és a statisztika gomb működése marad.
3. **Következő kis PR-ek:** BR-02 és BR-03 olvashatóság / érintési területek, BR-04 automatizált bizonyítékkal; BR-08 nav ikon.
4. **Fokozatos designrendszer-implementáció:** BR-06–12, modulonként, screenshot + átvezetési tábla + regresszió; BR-13–14 dokumentálása.
5. **Végleges v1.0 kiadás:** a v1.0-rc1 felülvizsgálata után; a guide elfogadása **nem** jelent minden modul megvalósításának befejezését.

**Az összes érintett vizuális PR ellenőrzőlistája:** \`npm test\`, \`npm run build:android-web\`, releváns Chromium browser regressziók; indokolt esetben natív debug-build; 0/50/100/hiányzó cél/hiányzó kcal; nappali mobil képernyőkön overflow, fókusz, képernyőolvasó, nagyobb betű, billentyűzet, safe-area és reduced motion. A produkciós és TEST csomagnevek, aláírások, Drive-mappák és adatok **változatlanok**.

## 5. Kódreferenciák és auditkorlátok

- [Éles mobil HTML/CSS](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/design/android-mobile-preview.html) és [TEST HTML/CSS](https://github.com/fabianpetermark-commits/Grapes/blob/integration/grapes-test-food-20261017/design/android-mobile-preview.html)
- [Mobil ikonok](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/src/android-mobile-icons.js), [webes tokenek](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/src/styles/tokens.css), [Food web CSS](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/src/food/food.css)
- [Food ring prod teszt](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/tests/food-neon-ring.test.js), [TEST teszt](https://github.com/fabianpetermark-commits/Grapes/blob/integration/grapes-test-food-20261017/tests/food-test-neon-ring.test.js), [Android böngészős teszt](https://github.com/fabianpetermark-commits/Grapes/blob/codex/android-app/tests/android-mobile-preview.browser.mjs)
- Az auditot **csak forrásból** végeztük: nem futott új Playwright, nincs 320/360/390/412px-es friss screenshot-golden, TalkBack, fizikai Androidon vagy Drive-on végzett teszt.
- A számozott BR-azonosítók tervezési/fejlesztési nyomonkövetésre szolgálnak. Egyetlen elem sem állítható «kész»-nek mindaddig, amíg a külön PR és annak elfogadási kapuja nem teljesült.

**Változtatás ebben a PR-ben:** dokumentáció és feladat-előkészítés; sem UI, sem adatkezelés, sem aláírás, sem release nincs módosítva.
