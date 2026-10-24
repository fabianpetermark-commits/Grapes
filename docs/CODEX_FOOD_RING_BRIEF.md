# Codex feladat – Grapes kalóriakör vizuális korrekció (éles + TEST)

**Prioritás:** magas, csak UI. **Ne merge-elj és ne készíts aláírt APK-t automatikusan.** A felhasználó előbb látni és jóváhagyni szeretné a végeredményt. A Grapes brand-dokumentuma: [`docs/GRAPES_BRAND_GUIDE.md`](./GRAPES_BRAND_GUIDE.md).

## Kiinduló probléma a felhasználó tényleges telefonos screenshotján

A Grapes Android v26 / 0.16.2 és TEST v0.9 kalóriakörénél, például 900/1800 kcal értéknél a kalóriakör túl világos, másik türkiz árnyalatú, és **a teljes kör körül kék-cyan halo van**. A felhasználó visszajelzése: „Kicsit túltoltad; ez mintha nem ugyanaz a szín lenne, mint mellette vagy a logóban. A glow-ból vegyünk le sokkal-sokkal többet és csak ott legyen, ahol van csík; ahol nincs, ott ne legyen.”

### A jelenlegi tényleges okozó kód
- **Éles Android `codex/android-app` és TEST `integration/grapes-test-food-20261017`:** a 2026-10-18-án ellenőrzött `design/android-mobile-preview.html` mindkét ágon lényegében **ugyanazt a túl erős** `.energy-ring` stílust tartalmazza: `--energy-track: #147e96`, `--energy-fill: #91ffff`, teljes körre adott `box-shadow`, `::before` `filter: blur(9px)` és a progressen kívül is cián színű gradient. Ez okozza a teljes 360°-os halót.
- **Mindkét ág Food JS-e** (`src/food/food-mobile.js`, `renderOverview()`) `energyRing.style.setProperty('--energy-progress', ...)` és `data-energy-state` állapotokat használ. **Nincs jelenleg inline `style.background`-felülírás egyikben sem**; a régebbi TEST-állapotra utaló korábbi brief pontatlan volt.
- **Automata tesztek:** az éles `tests/food-neon-ring.test.js` jelenleg még az erős halo és a `#91ffff` jelenlétét várja. Ezt célzottan új, visszafogott design-elfogadási ellenőrzésekre kell átírni, különben a helyes javítás ellenére hamis CI-hiba lesz. A TEST releváns tesztjeit fel kell térképezni, nem szabad az éles tesztfájl meglétét feltételezni.
- A TEST-nek ugyanazt a progress-komponens megjelenést kell kapnia, **de nem** az éles release/signing/adat- és Drive-környezetet.

## Jóváhagyott cél (MUST)

1. Használj `#3BDCF2` / `var(--accent)` színt az aktív ívhez. A meglévő logócsaládot (`public/grapes-mark.svg` a mobil fejlécben, `public/grapes-logo.svg` a négyzetes emblémához, `public/favicon.svg`) hagyd változatlanul.
2. A **nem teljesített rész** színe a meglévő sötét keret: `#243343` / `var(--line)`; **nincs rajta fény, glow, háttér-ragyogás**.
3. Az aktív íven legyen nagyon **finom**, lokális külső fény: kb. `0 0 3px rgb(59 220 242 / 20%)`. Ne alkalmazz `box-shadow`-t a teljes körre, a korongra, a kártyára, és ne színezd kékre a közepet.
4. Helyes százalék = `clamp(consumed / goal, 0, 1)` csak ismert pozitív cél és ismert kalória esetén; nincs fals `2000 kcal` alapérték. 100% felett vizuálisan 100%, a számszerű érték marad igaz. Ismeretlen tápértéknél ne sugalljon ismert teljesítést.
5. `0%`: teljes track sötét, **glow=0**; `50%`: csak az aktív félkör ragyog halványan; `100%`: teljes aktív ív halványan ragyog, de NEM lesz világító reaktor. A glow intenzitása 100%-nál sem ugrik nagyot.
6. Szöveg: olvasható `Elfogyasztva` címke, kalóriaérték, `/ {goal} kcal` vagy `Nincs cél`. Gondoskodj a kis méreten olvasható címkéről. Koppintásra a statisztika továbbra is megnyílik.
7. A natív Grapes TEST `.test` package, QA signing, TEST updater, TEST Drive gyökér nem változhat. Az éles `codex/android-app` és az `integration/grapes-test-food-20261017` ágat **külön, célzott változtatásokkal** kell frissíteni; ne merge-eld egyiket a másikba.
8. NE módosíts: Food adatmodell, SQLite/IndexedDB, víznapló, YAZIO, Health Connect, Finance, e-book, Drive bejelentkezés vagy user-profil, release workflow-k.

## Megvalósítási irány

**Preferált:** a teljes háttérgyűrű és az aktív ív két külön `<circle>` SVG stroke, sugár kb. 42 (nézet 100×100), körív `stroke-dasharray` / `stroke-dashoffset` vagy SVG `pathLength=100`; CSS `stroke: var(--accent)` csak az aktív stroke-on, `filter: drop-shadow(0 0 3px rgb(59 220 242 / 20%))` csak arra az ívre kerül, és 0%-nál teljesen rejtett. `stroke-linecap: round`, `transform: rotate(-90deg)`. Aktív SVG réteg fölött a sötét középső érték. Az üres trackre **nincs** filter és box-shadow. Ha a megoldás CSS-sel valósul meg, bizonyítsd screenshotokkal, hogy a ragyogás nem érinti a nem teljesített szakaszt.

**Tilos:** teljes körre `::before` `filter: blur(9px)`, teljes körre `box-shadow`, vagy JS inline `style.background` a progress kirajzolására. Nem lehet 0%-nál kék halo.

**A korábbi regressziós tesztek** CSS/HTML selektorokat is ellenőriznek; a modernizált implementációval együtt aktualizáld őket (ne hagyj meg félrevezető, már nem valós állításokat). Különösen: az éles `tests/food-neon-ring.test.js` jelenleg *kifejezetten* ellenőrzi a régi, tévesen világító 0%-os tracket, a `blur(9px)`-et és a `#a7ffff` teljesítési színt. Ezeket a #42-es feladat új elvárásaival kell helyettesíteni, nem kihagyni a tesztelést.

## Elfogadási checklist

- [ ] Android screenshot / vizuális ellenőrzés 0% – kizárólag sötét track, nincs glow.
- [ ] Android screenshot / vizuális ellenőrzés 50% – csak az aktív ív világít nagyon halványan.
- [ ] Android screenshot / vizuális ellenőrzés 100% – ugyanaz a cián, többlet-lángolás nélkül.
- [ ] Nincs beállított cél és részlegesen hiányzó kcal – se kitalált cél, se hamis pozitív arány.
- [ ] Következetes brand akcentus = `#3BDCF2`, ne `#91FFFF` és társai.
- [ ] 320/360/390/412 px, rendszerbetű nagyítva, nincs vágás, felső és alsó safe-area helyes.
- [ ] `prefers-reduced-motion` nem animál; talkback gomb „Ételnapló statisztika megnyitása”.
- [ ] `npm test` és Android web build + Chromium regresszió + natív debug assemble zöld.
- [ ] **ÉLES és TEST külön PR**, mindkét ágon ugyanaz a megjelenés, de változatlan package, aláírás, Drive-környezet.
- [ ] Kiadás és merge előtt felhasználói vizuális jóváhagyás.

**A #42-es GitHub issue implementációs feladat, nem automatikusan elindított Codex futás.** Az éles és TEST külön PR-jei csak fejlesztés és ellenőrzés után készülnek; egyik sem indít automatikus release-t.

## Brand system hosszabb távú feladatok (külön PR)

A `docs/GRAPES_BRAND_GUIDE.md` alapján egyetlen mobil token-forrás, standardizált typographic scale, spacing/corner/button/input/icon komponens; színeltérés-ellenőrző lint vagy teszt; desktop/mobil token migráció külön, regresszióval. Ez **nem** része a sürgős kalóriakör javításának.
