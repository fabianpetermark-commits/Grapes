# Grapes – Brand Guide / Design System v0.2 (review draft)

> **Állapot: javasolt egységesítési szabvány, felülvizsgálatra vár.** Kiindulás: a repó valódi logója, Android mobilfelülete és meglévő design tokenjei (2026-10-18). A dokumentum önmagában nem módosít sem UI-t, sem adatkezelést. Ahol a régi webes UI és az Android eltér, ott ezt nyíltan jelöli; a változtatásokat külön PR-ben kell átvezetni.
>
> **Cél:** Grapes-azonos szín, tipó, ikon, navigáció, effektek és komponensműködés minden modulban: Ételnapló, Víz, Pénzügy, E-book, QR, 3D, E-mail, Brossúra stb.; éles Android + TEST ugyanazt a vizuális rendszert használja, de adat- és release-környezeteik továbbra is külön maradnak.

## 1. Arculati alapelv

- **Karakter:** sötét, letisztult, funkcionális, kék–cián technológiai esztétika; nyugodt vizuális hierarchia, nem neon minden elemen.
- **Fő szín:** az Android mobil UI valóban meglévő `--accent: #3BDCF2`. Ez legyen az interaktív kiemelés, aktív progress, link, fókusz meghatározó alapszíne.
- **Kiegészítő:** `--accent-2: #4D8FFF` – csak második szín pl. makró progress/kiemelt fokozatos átmenet; **nem** önálló új arculati szín.
- **Logó:** a forrás SVG saját gradientet használ. A logó árnyalatai nem helyettesítik a fő UI-akcentust, és nem indokolnak további tetszőleges, túlfényes ciánokat.
- **Effekt:** a cián fény csak indokolt, jelentést hordozó **aktív elemre** kerülhet; szürke/üres progress trackre, teljes kártyára vagy középső korongra nem.

## 2. Kanonikus logó és grafikai szabályok

| Tétel | Forrás / szabály |
| --- | --- |
| Négyzetes, sötét hátterű Grapes-embléma | [`public/grapes-logo.svg`](../public/grapes-logo.svg) |
| Háttér nélküli szőlőjel / mobil appjel | [`public/grapes-mark.svg`](../public/grapes-mark.svg) |
| Böngésző favicon | [`public/favicon.svg`](../public/favicon.svg) |
| Képarány | 1:1; a teljes SVG 96×96-es nézettel és lekerekített sötét négyzet alappal rendelkezik |
| Mobil fejléc és belépés (tényleges forrás) | `design/android-mobile-preview.html`: fejléc `grapes-mark.svg` 36×36 px, 3 px padding; belépő képernyő `grapes-mark.svg` 76×76 px, 7 px padding; a CSS mindkettőhöz külön külső árnyékot is ad. Ez **jelenlegi állapot**, nem kötelező új komponensminta. |
| Negatív tér | A logó körül minimum ¼ logószélesség más emblémától/elemtől, amennyiben a layout megengedi |
| Tiltott változtatások | Önálló átszínezés, összenyújtás, újrarajzolás, túlexponált külső glow, tetszőleges árnyék vagy más verzió másolása külön modulba |
| Kódhasználat | A megfelelő **meglévő közös assetet** használd: háttér nélküli mobil jelhez `grapes-mark.svg`, négyzetes emblémához `grapes-logo.svg`, böngésző ikonhoz `favicon.svg`. Ne készíts modulonként másolatot vagy újrarajzolt variánst. |

**A logócsalád valós színei** (a `public/grapes-logo.svg` és `public/grapes-mark.svg` forrásából):
- Grape/berry gradient: `#B5FBFF` → `#49EDFA` → `#00B8E1` → `#00699F`.
- Levél: `#24DCE9`, vékony körvonal: `#9BFBFF`; bogyó belső árnyalata: `#005D8E`.
- Logó háttere: `#1D3040` → `#0B151E` → `#05080C`.
- A négyzetes emblémának saját SVG-árnyékai vannak, a háttér nélküli `grapes-mark.svg` pedig saját, finom SVG-glow-t tartalmaz. A mobil `.logo` és `.appbar__logo` jelenleg ezen felül CSS drop-shadow-t is alkalmaz. **Javasolt szabály:** a külön CSS-es logóhalo indokolatlan erősítését később külön vizuális review-val mérsékeljük, a logóassetek megváltoztatása nélkül.
- **Nem egyetlen felcserélhető fájlról van szó:** a `grapes-mark.svg` átlátszó hátterű, a `grapes-logo.svg` sötét, lekerekített négyzetet is tartalmaz. A `favicon.svg` harmadik, kisméretre szabott SVG-forrás.

## 3. Elsődleges Grapes Android színpaletta

**Forrás:** `design/android-mobile-preview.html` `:root` (a valós telefonon megjelenő mobil design). A táblázat az ott használt értékeket tartalmazza; kanonikus tokenné emelésük **javaslat**.

| Token (javasolt globális név) | HEX / CSS | Szerep |
| --- | --- | --- |
| `--grapes-bg` | `#090E14` | Fő alkalmazásháttér |
| `--grapes-surface` | `#101821` | Kártyák és modulfelületek |
| `--grapes-raised` | `#17222E` | Beviteli mező / kiemelt háttér |
| `--grapes-line` | `#243343` | Finom keretek, üres progress track |
| `--grapes-text` | `#F2F7FB` | Fő szövegszín |
| `--grapes-muted` | `#94A5B8` | Segédszövegek |
| `--grapes-accent` | `#3BDCF2` | **Elsődleges Grapes cián**, interaktív és aktív progress |
| `--grapes-accent-2` | `#4D8FFF` | Másodlagos kék, szükség esetén átmenet |
| `--grapes-accent-soft` | `rgb(59 220 242 / 12%)` | Halk akcentus-háttér |
| `--grapes-success` | `#47D89B` | Siker / szinkron rendben |
| `--grapes-warning` | `#F2B84B` | Figyelmeztetés / helyi várakozás |
| `--grapes-danger` | `#FF7083` | Hiba / destruktív művelet |

A progresshez ne legyen egyedi `#91FFFF`, `#A7FFFF`, `#8EFFFF` vagy tetszőleges másik neonszín; ezek nem az Android alap-paletta részei. Aktív progress = `var(--grapes-accent)` / jelenlegi `var(--accent)`; üres track = `var(--grapes-line)` / jelenlegi `var(--line)`.

**Átmeneti technikai állapot:** a `--grapes-*` nevek jelenleg dokumentációs célnevek, **nem élesben már bevezetett, globális CSS-tokenek**. A mobil forrás jelenleg `--bg`, `--surface`, `--line`, `--accent` stb. neveket használ. A közös mobil tokenszint bevezetése külön implementációs PR feladata.

**Létező külön desktop rendszer, nem szabad letagadni:** a `src/styles/tokens.css` másik készletet ad (például `--color-accent: #4C8DFD`, `--color-bg-app: #0F1318`, `--font-ui: system-ui, ...`). A v0.1 a **mobil Android képernyők** kanonikus mintája; a teljes desktop egységesítés külön review, kontrasztvizsgálat és migráció. Ne cseréljük globálisan az összes desktop tokent egy Food-gyűrű javítása miatt.

## 4. Tipográfia

**A jelenlegi mobil CSS:** `font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Nincs garantáltan beágyazott vagy telepített Inter, ezért rendszerenként fallback lehet; ezt figyelembe kell venni vizuális ellenőrzésnél.

**Javasolt egységes mobil típuslétra**, amely az `ANDROID_UI_DESIGN_PLAN.md` szándékával és a meglévő UI-val összhangban van:

| Szerep | Méret | Súly | Sor-/viselkedési szabály |
| --- | ---: | ---: | --- |
| Képernyőcím / hero | 24–28 px | 700–800 | line-height 1.15; csak legfelső hierarchia |
| Fő kártyaszám (pl. kcal) | 24–32 px | 700–800 | tabular-nums |
| Szekciócím | 18–20 px | 700 | line-height 1.25 |
| Kártyacím | 16–17 px | 600–700 | line-height 1.3 |
| Normál törzsszöveg | 15–16 px | 400–500 | line-height 1.45–1.55 |
| Kiegészítő szöveg | 13–14 px | 400–600 | line-height 1.4 |
| Rövid címke / pill | 12–13 px | 600–800 | magas kontraszt, nem hosszú szövegek |
| Ikon melletti tömör micro-label | 11–12 px | 600–700 | csak helyhiányos esetben; ellenőrizni olvashatóságot |

A jelenlegi HTML-ben 7–11 px-es feliratok is vannak; **ezek meglévő megvalósítások, nem a kívánatos szabvány**. A kör belsejében az `Elfogyasztva` feliratot nem szabad 7 px-en hagyni, ha helyette 11–12 px-et el lehet érni. A 112 px-es korongon 0/900 kcal érték, cél és felirat több sor esetén inkább tördeljen, ne veszítsen olvashatóságot.

Betűskála szűk képernyőn is olvasható, nagyobb rendszerbetűnél se legyen levágva; az értékek `font-variant-numeric: tabular-nums`-t használjanak.

**Kontraszt-ellenőrzés (forrásból számított WCAG kontrasztarányok, nem készülékteszt):** `#3BDCF2` a `#090E14` háttéren kb. **11,72:1**, a `#101821` felületen kb. **10,82:1**; a `#94A5B8` másodlagos szöveg a `#101821` felületen kb. **7,09:1**. Fontos ellenpélda: **fehér szöveg cián gombon csak kb. 1,65:1**, ezért világos cián kitöltésnél sötét gombszöveget használjunk, és a végső állapotokat külön ellenőrizzük. A kontrasztarány nem helyettesíti a minimális méret, érintési cél és TalkBack ellenőrzését.

## 5. Layout, térköz, méretek

**Forrás:** `ANDROID_UI_DESIGN_PLAN.md`, a mobile CSS, és az általános `src/styles/tokens.css` 4 px-es spacing rácsa.

- Térközök: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px.
- Mobil oldalsó margó: 16 px, 360 px alatt 12 px.
- Kártyák: javasolt 16 px, hero/kiemelt kártyáknál 20–22 px; bottom sheet felső sarkok 24 px.
- Beviteli mezők és kompakt gombok: 12–14 px, egységesen.
- Elsődleges érintési cél: **min. 48×48 px**; másodlagos is min. 44×44 px.
- Kártyák alapja sötét surface; keret finom. Komoly árnyékot csak modálnál vagy overlay-nél.
- Táblázatok és listák: mobilon egyoszlopos; a szám és mértékegység nem futhat össze.
- Fontos: 320 / 360 / 390 / 412 px-es viewport és Android safe-area, visszalépés, billentyűzet.

## 6. Komponensek és ikonok

- **Elsődleges CTA:** világos cián/kék akcentus, sötét felirat, megfelelő kontraszt, min. 48 px magas.
- **Másodlagos gomb:** sötét emelt felület, vékony outline, jól látható címke; ne legyen ugyanannyira erős, mint az elsődleges.
- **Aktív állapot:** csupán szín helyett szöveg/ikon is jelezze.
- **Input, panel, kártya:** `--grapes-raised`, `--grapes-surface`, `--grapes-line`, ne külön hardcoded Food-kék.
- **Ikonkészlet:** `src/android-mobile-icons.js` a jelenlegi mobil stroke-ikonok forrása: 24×24 nézet, `stroke-width="1.8"`, kerekített végek/csatlakozások, `currentColor`; az ikon színe szemantikus tokent kövessen.
- **Státuszok:** siker = zöld; figyelmeztetés/helyi adat = borostyán; hiba/törlés = piros; folyamatban = cián/kék. A státuszt szöveg is magyarázza.
- **Grafikonok:** a kategóriák színei konzisztensen tükrözzék ugyanazt a jelentést; nem lehet egy másik sötét témára optimalizált, ad hoc neonpalettával felülírni őket.

## 7. Fény, glow, árnyék – fontos korlátozás

**A fény nem márkajegy minden objektumon, hanem ritkán használt, jelentést hordozó állapotjelzés.** Alapállapotú kártyának nincs erős cián halo-ja. Logó: eredeti SVG drop shadow. Aktivált navigáció/gomb: finom soft highlight, nem 30–40 px külső aura.

**Food-kalóriakör (jóváhagyásra javasolt végső irány):**
1. A kör trackje körben vékony, sötét és **teljesen fénytelen**: `#243343` vagy azzal ekvivalens border token.
2. A progress ív `#3BDCF2`, végpontja lekerekített; a **glow kizárólag ennek az ívnek a vonalát** követi.
3. Fényerő: az előző, túlfényes screenshothoz képest jelentősen visszafogott; **2–4 px elmosás, kb. 15–25% alfa**, nem teljes körű `::before` conic-gradient glow.
4. **0%**: üres, sötét kör, nulla halo, 0 kcal; **50%**: csak a fél progress ív világít, nincs fény a fennmaradó félkörön; **100%**: teljes progress ív világíthat finoman, de továbbra sem „reaktor”.
5. **Nincs napi cél:** nincs hamis százalék/kitalált `2000 kcal` cél; a kör semleges, középen `Nincs cél`.
6. Sötét, áttetsző **nem ragyogó** középső korong; kcal a legnagyobb típus. Az `Elfogyasztva` címke marad, de legyen olvasható.
7. Az éles **és a TEST** 2026-10-18-i CSS-ben is fennálló `.energy-ring::before` teljes 360°-os elmosott hátterét el kell távolítani; helyette érdemes **SVG progress circle két külön stroke-ját** használni (sötét track + aktív, önmagán halvány filterezett progress). Az SVG azonos és pontosan szakaszra korlátozott 0/50/100 állapotot ad.
8. Reduced motion: `prefers-reduced-motion` esetén nincs fény/pulzáló animáció. Normál módban is csak enyhe állapotváltás.
9. Az új progress komponens megőrzi a statisztika gomb funkcióját és az akadálymentes nevet.

**2026-10-18-i forrásellenőrzés:** a `codex/android-app` és `integration/grapes-test-food-20261017` ág jelenlegi `.energy-ring` CSS-e lényegében azonos: `--energy-track: #147e96`, `--energy-fill: #91ffff`, az egész gyűrűn `box-shadow`, és `::before` `blur(9px)`. Mindkét Food JS a `--energy-progress` változót írja és `data-energy-state` állapotot állít; egyik sem ír már inline progress-hátteret. Ez a *javítandó jelenlegi implementáció*, nem a kívánt design. A két külön PR továbbra is kötelező a környezetek elkülönítése miatt.

## 8. Mit tilos megtenni egy brand-polish miatt?

- TEST és éles alkalmazás adatainak/Drive fájljainak egyesítése; TEST `.test` csomagnév vagy `Grapes TEST` gyökér módosítása.
- Külön pixelértékekkel CSS-es „sürgős javítás” minden modulban; több eltérő ciánpaletta.
- Automatikus Drive-import / release / merge pusztán dokumentáció módosítása után.
- Egyetlen screenshot alapján globálisan átírni a desktop eszközöket vagy a logót.
- Hozzáférhetőséget rontani a vizuális hatásért (különösen 7 px caption és gyenge kontraszt).

## 9. Fejlesztési és átadási szabályok (Codex)

1. Használd a meglévő logó assetet; a forrás és a színkódok legyenek visszakövethetők.
2. A közös Android tokeneknek legyen **egy kanonikus forrása**; a modulok csak ezekre hivatkozzanak.
3. Első körben CSAK a Food progressgyűrű javítása: lásd [`docs/CODEX_FOOD_RING_BRIEF.md`](./CODEX_FOOD_RING_BRIEF.md).
4. Biztosíts `0%`, `50%`, `100%`, `nincs cél`, `ismeretlen tápérték` eseteket. Vizsgáld kis képernyőn és sötét Android WebView-val.
5. Először izolált PR és vizuális/automata teszt, **merge és release csak külön jóváhagyással**.
6. A későbbi modulonkénti arculati egységesítéshez legyen szemantikus token-jegyzet, képernyőkép és eltéréslista.

## 10. Forrásjegyzék és verziózás

- `public/grapes-logo.svg` – négyzetes, hátteres vektoros embléma.
- `public/grapes-mark.svg` – tényleges mobil fejléc- és bejelentkezési szőlőjel.
- `public/favicon.svg` – böngésző favicon.
- `design/android-mobile-preview.html` – jelenlegi Android mobil valós stílusdefiníciói.
- `src/android-mobile-icons.js` – mobil SVG stroke ikonok.
- `src/styles/tokens.css` – meglévő, **eltérő desktop** tokenskála.
- `ANDROID_UI_DESIGN_PLAN.md` – korábbi mobil UI-felvevő követelmények, kontraszt és méretezés.
- `docs/CODEX_FOOD_RING_BRIEF.md` – azonnali, pontos megvalósítási brief.

**Verzió:** 0.2 review draft / 2026-10-18. A logócsalád, a mobil színkódok és az éles/TEST gyűrű állapota *tények a repo forrásából*; az egységesítés, tipográfiai minőségszintek és glow-limit *javasolt szabályok*, még nincsenek minden modulban bevezetve. Ez a változtatás kizárólag dokumentáció, nem UI-implementáció és nem release.
