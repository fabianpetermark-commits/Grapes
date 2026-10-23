# Grapes – Brand Guide / Design System v1.1 (elfogadott mobil vizuális irány)

> **2026-10-23-i felhasználói döntés:** a Health minimal widgetes HTML-tervezet vizuális iránya elfogadva (APPROVED), és ettől kezdve ez a Grapes mobil arculati mintája. **Ez nem jelenti azt, hogy a már kiadott APK-k és valamennyi modul átálltak.** A 2026-10-18-i korábbi audit megállapításai történeti referenciák; ütközésnél az új 0. fejezet az elsődleges. Fizikai készülékes regresszió és külön implementáció továbbra is szükséges. Lásd: [`GRAPES_BRAND_AUDIT.md`](./GRAPES_BRAND_AUDIT.md). Kiindulás: a repó valódi logója, Android mobilfelülete és meglévő design tokenjei (2026-10-18). A dokumentum önmagában nem módosít sem UI-t, sem adatkezelést. Ahol a régi webes UI és az Android eltér, ott ezt nyíltan jelöli; a változtatásokat külön PR-ben kell átvezetni.
>
> **Cél:** Grapes-azonos szín, tipó, ikon, navigáció, effektek és komponensműködés minden modulban: Ételnapló, Víz, Pénzügy, E-book, QR, 3D, E-mail, Brossúra stb.; éles Android + TEST ugyanazt a vizuális rendszert használja, de adat- és release-környezeteik továbbra is külön maradnak.


> **HTML referencia-források:** [Grapes Design Reference Gallery](../design/references/index.html) és a [referencia- és pixelparitás-szerződés](../design/references/README.md). A valódi, korábban jóváhagyott HTML-ek pontos forrása itt verziózott; az új Home, Tools, E-book, QR és Finance képernyők a `candidates/` mappában **PROPOSED**, még jóváhagyandók. **Implementáció előtt mindig ezt az indexet kell használni, nem a régi history/minta HTML-eket.**

## 0. Jóváhagyott Grapes mobil megjelenés (2026-10-23) – ez az elsődleges szabvány

**Referencia:** a felhasználó által képernyőképes iterációkban véglegesített **Grapes Health minimal** önálló HTML/CSS/JS-tervezet. A mintában a fejléc bal oldalán kizárólag **Health** látható, a jobb oldalán kizárólag az adott modul **beállítás-fogaskereke**; a widgetkártyák rövid, halvány ciánfényes peremszegélyekkel jelennek meg. Az interaktív prototípus mintaadatokat használ, nem az éles Food/Víz napló tartalma.

### 0.1. Új, elfogadott arculati képlet

- Fő háttér: **#090E14**; widgetek: **#101821**; emelt felületek: **#17222E**.
- Semleges szegély: **#243343** (a bemutatópanelben kb. **#293E4C**); főszöveg: **#F2F7FB**; segédszöveg: **#94A5B8**.
- Grapes cián: **#3BDCF2**, elsősorban interakciókhoz, fókuszhoz, ikonokhoz, linkekhez és a widgetek finom peremfényéhez.
- Matt adat- és progress-kitöltések a Health-tervben: kb. **#60C1D2 / #77C6D2**; a figyelem a valódi számokon van, nem a glow-on.
- Kártya: sötét belső, 1 px halk keret, 19 px körüli sarok, 13–16 px belső tér; a kártyák közt általában 12 px távolság.
- Oldalsó margó: 15–16 px (kis kijelzőn 12 px). Az elválasztó vonalak sötétek, nem neonok.
- Közvetlenül használható **widgetek** dominálnak: Healthben Food + víz + saját receptajánló, alul gyorsműveletsáv; más modulban a saját hasznos adatok és műveletek. A menü *ne* ismételje feleslegesen ugyanazt a címet.

### 0.2. Neon kizárólag a dobozszegély rövid részén

- A kártya szegélye egyébként matt sötétkék, **nem körben neon**.
- Felül egy rövid, fokozatosan elhalványuló, kb. 1 px-es cián vonalszakasz; opcionálisan bal oldalon egy még halványabb, rövid függőleges vonalszakasz.
- Referencia: a Health minimáltervben felső szegmens balról 17 px-nél kezdődik, maximum 45% széles; színe cián 87% alfától 35%-ig, majd átlátszó. A szegélyhez simuló árnyék: **0 0 4px rgba(59,220,242,.22)**.
- **TILOS**: a dobozon kívüli nagy fényudvar, a belső felület megvilágítása, teljes neonkerület, háttérradiális ciánfolt, pörgő/pulzáló dekoratív glow, üres progress-szakasz világítása.
- A pseudoelemek ne blokkolják az érintést; reduced motion módban animáció nélkül. A progress gyűrű matt, a track sötét marad.

**Referencia CSS, izolált célstílus (nem állítás arról, hogy ez már központi komponens az APK-ban):**

~~~css
.grapes-widget {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid #293e4c;
  border-radius: 19px;
  background: #101821;
}
.grapes-widget::before {
  content: "";
  position: absolute;
  pointer-events: none;
  top: -1px;
  left: 17px;
  width: 45%;
  height: 1px;
  background: linear-gradient(90deg,
    rgba(59,220,242,.87), rgba(59,220,242,.35) 53%, transparent);
  box-shadow: 0 0 4px rgba(59,220,242,.22);
}
.grapes-widget::after {
  content: "";
  position: absolute;
  pointer-events: none;
  left: -1px;
  top: 19px;
  height: 52px;
  width: 1px;
  background: linear-gradient(180deg, rgba(59,220,242,.42), transparent);
  box-shadow: 0 0 3px rgba(59,220,242,.20);
}
~~~

### 0.3. Modulfejléc: a minimal Health terv az alap

~~~text
┌────────────────────────────────┐
│ Health                   [ ⚙ ] │
└────────────────────────────────┘
~~~

- Balra **csak** a modul neve, kb. 20–24 px, félkövér.
- Jobbra **csak a modulbeállítás** fogaskereke (tap target 44–48 px), amely az aktuális modul céljaihoz, megjelenítéséhez és integrációihoz visz.
- A modulfejlécben **NINCS** Grapes-logó, második alcímsor, „Grapes / Áttekintés”, újabb óriási Health H1, „TERVEZET” badge, dekoratív magyarázó szöveg vagy duplázott értesítési harang.
- Közvetlenül utána indulhat az első adatwidget; nincs külön hero-kártya vagy fölösleges felvezető.
- **Gyökérfőmenü/bejelentkezés**: lehet külön Grapes márkajelzés, mert ez nem egy adott modul aloldala. Ne töröljünk natív Back, globális értesítés, fiók vagy navigáció funkciót CSS-sel; a minimál UI funkcionálisan is legyen teljes.

### 0.4. Widgetes oldalszerkezet és gyorsműveletek

1. **Első nagy widget**: a modul legfontosabb tényleges állapota (Health: kalóriagyűrű/makrók/étkezések). Nem önmagáért épített dekoratív panel.
2. **Kisebb, praktikus widget**: a gyakran frissülő feladat (Health: Víz, progress és egyértelmű „+250 ml” gyorsművelet).
3. **Ajánló / aktuális tartalom**: csak valós felhasználói adatból, előzményből vagy a modul megbízható adatforrásából. A Health prototípus számai és receptcíme mintaadatok.
4. **Modul gyorssáv**: a Health tervezeten Fotó, Étel, Víz + külön Vonalkód. Az adott modul fontos műveleteit tartalmazza, nem egyenlő a Grapes globális navigációjával.
5. **Egyedi modulbeállítások**: widgetek elrejtése, célok, naplók, mértékegységek, integrációk és adatok a funkcióhoz igazítva. Ne töröljenek mentett adatot a widget elrejtésekor.
6. A négy Grapes fő terület **Home / Health / Tools / Finance** megmarad; a korábbi **Utility** csak felhasználói elnevezésként változik **Tools**-ra, a belső azonosítók automatikus átnevezése nélkül. A **gyökérfőmenü 2026-10-23-i, felhasználói visszajelzés alapján egyeztetett új navigációja** az alábbi 0.6. fejezetben található. A képi tervezet még PROPOSED, az alsó navigáció megszüntetése és a felső ikonsor használata már kötelező funkcionális tervezési követelmény.

### 0.5. Tipográfia, hozzáférhetőség és bevezetési kapuk

- Modulcím: 20–24 px / 700–800; widgetcím: 16–18 px; fontos stat-szám: 24–32 px; normál leírás: 14–16 px; lehetőleg min. 12–13 px kiegészítő címke.
- A demo HTML-ben előforduló 9–11 px címkék **nem** éles, akadálymentesítési jóváhagyások. Nagyobb rendszerbetűnél is olvasható tördelés és 320/360/390/412 px teszt kell.
- A négy elsődleges modul és minden valós funkció megmarad; az új külső **nem írhatja felül** Google/Supabase Auth, PIN, Food/Víz/Drive mentések és Android release működését.
- A 2026-10-23-i elismert minta **APPROVED DESIGN**, de a Grapes PROD/TEST implementáció **külön, ellenőrzendő**. Minden migráció célzott PR, screenshot/böngészős regresszió és külön telefonos próba alapján történjen; dokumentáció-módosítás után **nincs automatikus merge vagy APK-kiadás**.

### 0.6. Új Grapes főmenü – felső ikonsor és intelligens kezdőoldal (2026-10-23)

**Felhasználói UI-követelmény (elfogadott irány):** a régi alsó „Főmenü / Projektek / Szinkron / Továbbiak” sáv **már nem része a Grapes kívánt főmenüjének**, ezért NEM szabad a későbbi UI-tervekbe visszahozni. A „Modulok” felirat, a 2×2-es nagy főmenücsempék és a „2×2 / Lista” kapcsoló szintén megszűnnek. Az alábbi, felső vízszintes főmodul-ikonsor lesz az alkalmazás gyökérnavigációja:

```text
┌──────────────────────────────────────────┐
│ Grapes                              [⚙] │
├──────────────────────────────────────────┤
│ [⌂★]     [⌂]      [♡]      [▦]      [$] │
│ Kezdő    Home    Health    Tools    Finance│
├──────────────────────────────────────────┤
│ Gyakran használt             [+ Hozzáadás]│
│ [ Ételnapló ]  [ Víznapló ]               │
│ [ Növények ]  [ Receptek ]               │
│ ...                                       │
└──────────────────────────────────────────┘
```

- **Felső fej:** a gyökérfőmenüben balra csak `Grapes`, jobbra a **globális** fogaskerék. Az egyes modulok saját képernyőjén továbbra is modulnév + modulbeállítás fogaskerék az elfogadott fejléc. Nincs ismételt dekoráció/alcím.
- **Közvetlenül alatta egyetlen vízszintes főmenü-ikonsor**, ikon és rövid egyértelmű felirat, legalább 44–48 px működő érintési területtel. Fókusz- és aktív állapot legyen jól megkülönböztethető, ne csak színnel.
- **Az első ikon egy házikó/kedvenc-ház**, amely az **„Gyakran használt” kezdőoldal**. Az app ezt nyissa meg induláskor, és a felső sávból ide bármikor vissza lehessen térni. Ez nem egyenlő a külön `Home` főmodullal.
- **A további ikonok:** Home, Health, **Tools** (korábban Utility), Finance, az alkalmazás ténylegesen elérhető gyökérmoduljainak regiszterében szereplő sorrendben. **Ha új főmodul készül, automatikusan ebbe a felső ikonsorba kerül**, ikon+név azonosítóval; nincs hardcoded maximum 4 vagy 5 modul. Szűk képernyőn a sor **vízszintesen görgethető**, swipe-tal és billentyűzetes/fókuszos eléréssel, úgy, hogy az ikonok nem zsugorodnak olvashatatlanra. A telepített modulok és sorrendjük ugyanabból a modulregiszterből származzanak, ne UI-ban kézzel duplikált listából.
- **Nincs alsó főmenü-navigáció**, nincs második főmenüsor. Viszont **minden fő területnek megmarad a saját, kontextuális alsó gyorsműveleti sávja**. Ez a felhasználó által a Health képernyőn külön bekarikázott, jóváhagyott minta: Health = **Fotó / Étel / Víz + külön Vonalkód**. Nem navigációs tabok, hanem műveletek; főmodulváltáskor a sáv tartalma az aktív főmodul műveleteire vált. A Kezdőn a kedvencek kezelését szolgáló műveletek jelenhetnek meg; Home / Tools / Finance konkrét gyorsgombjai külön véglegesítendők. A modul gyorssávját a globális felső ikonsor nem helyettesíti.
- **A gyorssáv elhelyezése:** a főmodul- és Kezdő-nézeteken alul, a tartalom görgetésétől függetlenül elérhető, Android safe-area fölött. A görgethető widgetek alul megfelelő paddinget kapnak, hogy az utolsó kártyát se takarja ki a sáv. A főmenü alsó globális navigációját nem szabad összekeverni az egyes modulok gyorssávjával.
- **Működés:** az adott gyorsgomb közvetlenül a hozzá tartozó műveletet indítsa, ne ugyanazt a kategóriamenüt nyissa meg újra; következetes 44–48 px érintési cél, szöveges címke/akadálymentes név. A modulon belül megnyitott teljes képernyős szerkesztő/billentyűzet esetén szükség szerint elrejthető, de az állapotnak navigációkor és visszalépéskor helyre kell állnia.
- **Stílus:** a jóváhagyott Health-mintából: sötét, enyhén emelt, lekerekített pill az elsődleges 2–4 műveletnek, szükség esetén külön hangsúlyos kerek action gombbal. Matt háttér, finom keret és kizárólag rövid, diszkrét Grapes-cián peremfény. Az alsó dock nem lehet az egész szélességében világító neonkeret.
- **Későbbi új főmodul:** a modulregiszter az ikonja és oldala mellett a saját `quickActions` konfigurációját is megadja; a shell kontextus szerint jeleníti meg az adott sávot, hogy új modul miatt ne kelljen globális navigációt újratervezni.
- **Gyakran használt kezdőoldal:** közvetlenül nyitható kisebb widgetkártyák a fontos modulokhoz és almodulokhoz. Két forrásuk lehet: (a) kézzel, + Hozzáadás művelettel rögzített elemek; (b) az alkalmazás által az aktuális felhasználó tényleges modulmegnyitásai alapján automatikusan kiválasztott, leggyakrabban használt elemek.
- **Világos, külön jelölés**: `Rögzítve` vs. `Automatikus`; a rögzített elemek mindig elöl jelenjenek meg, az automatikus sorrend a használati gyakoriságot kövesse. A kézzel kiválasztottakat az alkalmazás automatikus rendezése **nem** távolíthatja el.
- **Kedvencek kezelése:** az összes valóban elérhető belső modulból/almodulból kereshető hozzáadás és eltávolítás. Az automatikus javaslat elrejthető úgy, hogy az egyéni elrejtés/tiltás később is érvényesüljön; ettől a modul maga továbbra is elérhető marad az eredeti navigációjából.
- **Személyes adatok:** a kézi kedvencek, elrejtések és a használatszámlálók a **Grapes-profilhoz** tartoznak, nem a másik felhasználóhoz; a használat nyilvántartása ne gyűjtsön tartalmi Food/Finance/E-book adatokat, csak a navigációhoz szükséges eseményszámot/időszakot. Biztonságos mentés/szinkron és konfliktuskezelés a valódi implementáció külön terve. A gyakoriságszámítás legyen determinisztikus, korlátozott és magyarázható, az automatikus widgethelyek ne korlátlanul növekedjenek.
- **Első indulás, még nincs használat:** tiszta, értelmes üres állapot és `Modul hozzáadása` lehetőség. A rögzített kedvenceket nem írja felül automatikus érték.
- **Szín / felület:** minden widget és kedvenckártya a 0.1–0.4 pontban elfogadott sötét Grapes háttérrel és rövid neon-cián peremszakasszal jelenjen meg. A fejlécre és ikonokra ne tegyünk teljes, erős kék aurát.

**Állapot: jóváhagyott navigációs irány + még felülvizsgálandó részletes HTML kompozíció.** A mostani statikus HTML-próba rövid időre `localStorage` alapú demonstrációs számlálókat/kedvenceket használ; ez **nem kész Grapes-profilos tároló** és nem módosít éles rendszeradatot.

**Külön implementációs kapuk:** indulás a Kezdő oldalon; a négy meglévő ikon és új modul bővítésének próbája; navigációs visszalépés; megnyitások alapján változó automatikus ajánlások; kézi rögzítés, elrejtés és profilváltás; 320/360/390/412 px, nagyobb font; beszélő címkék/TalkBack; Auth/PIN/Drive érintetlenség. A design doc frissítése **nem** triggerelhet merge-et, PROD APK-t vagy bejelentkezési átépítést.


---

### 0.7. Teljes Home / Tools / Finance widgetes átvezetés (2026-10-23)

**Új felhasználói igény:** a korábbi `Utility` látható neve **Tools**. A **Home**, **Finance**, valamint a **Tools → E-book / QR** teljes moduljai – belső oldalaikkal együtt – a Healthből elfogadott, neon-cián peremszegélyes **widgetes megjelenést** kapják. Nem elég a főmodul csempéit átfesteni.

- Felső ikonsorban főmodult választunk; **azonnal a főmodul saját tényleges widgetjeit** látjuk, nem újabb fő almodulválasztó menüt. Az egyes widgeteket a Kezdőre is lehet kézzel/gyakoriság szerint kitenni.
- **Tools**: E-book folytatás/könyvtár/olvasó/átvitel + QR Stúdió generálás és beállítások. Olvasási tipográfia és a QR tényleges kódja nem kötelező ciánra festendő tartalom.
- **Finance**: aktuális bevétel/kiadás, kategóriák, megtakarítás, tranzakciók; részletekben megtartandók az Áttekintés/Tranzakció/Megtakarítás/Előrejelzés/Import nézetek, minden adat és mentés.
- **Home**: Bevásárlólista, Készletkezelő, Növények widgetek; az utóbbi nem válhat automatikusan éles, kitalált növény- vagy időjárásadattá.
- **Minden főmodul** saját alsó kontextuális gyorsműveletsávot kap; az egyedi Home/Tools/Finance gombkiosztás **még jóváhagyandó**. A már jóváhagyott Health Fotó/Étel/Víz/Vonalkód elrendezést megőrizzük.
- **Adatvédelem:** a régi belső `utility` modulazonosítók, Drive-mappák és a QR/E-book/Finance/Home mentései nem változnak pusztán név- és designfrissítés miatt. A QR-munkaoldal olvasható kontrasztja és az olvasó személyes tipográfiája marad.
- **Tervezési hivatkozás:** [Tools / Home / Finance teljes widgetes átalakítása](./GRAPES_TOOLS_FINANCE_HOME_WIDGET_REDESIGN_20261023.md). Ezt külön TEST implementációs PR-ek követhetik; **nem** automatikus merge/release.

---

## 1. Arculati alapelv

- **Karakter:** sötét, letisztult, funkcionális, kék–cián technológiai esztétika; nyugodt vizuális hierarchia, nem neon minden elemen.
- **Fő szín:** az Android mobil UI valóban meglévő `--accent: #3BDCF2`. Ez legyen az interaktív kiemelés, aktív progress, link, fókusz meghatározó alapszíne.
- **Kiegészítő:** `--accent-2: #4D8FFF` – csak második szín pl. makró progress/kiemelt fokozatos átmenet; **nem** önálló új arculati szín.
- **Logó:** a forrás SVG saját gradientet használ. A logó árnyalatai nem helyettesítik a fő UI-akcentust, és nem indokolnak további tetszőleges, túlfényes ciánokat.
- **Effekt:** a **rövid, finoman ciánnal világító widget-peremszegély** elfogadott arculati elem (lásd 0. fejezet). A **teljes kártya aurája**, a tömör neon háttér, az üres progress track és a középső korong továbbra sem világíthat.

## 2. Kanonikus logó és grafikai szabályok

| Tétel | Forrás / szabály |
| --- | --- |
| Négyzetes, sötét hátterű Grapes-embléma | [`public/grapes-logo.svg`](../public/grapes-logo.svg) |
| Háttér nélküli szőlőjel / mobil appjel | [`public/grapes-mark.svg`](../public/grapes-mark.svg) |
| Böngésző favicon | [`public/favicon.svg`](../public/favicon.svg) |
| Képarány | A `grapes-logo.svg` és a `grapes-mark.svg` egyaránt 96×96 nézetű; **csak** az előbbi rendelkezik sötét, lekerekített négyzetes alappal |
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

**Létező külön desktop rendszer, nem szabad letagadni:** a `src/styles/tokens.css` másik készletet ad (például `--color-accent: #4C8DFD`, `--color-bg-app: #0F1318`, `--font-ui: system-ui, ...`). A v1.0-rc1 a **mobil Android képernyők** kanonikus célmintája; a teljes desktop egységesítés külön review, kontrasztvizsgálat és migráció. Ne cseréljük globálisan az összes desktop tokent egy Food-gyűrű javítása miatt.

## 4. Tipográfia

**A jelenlegi mobil CSS:** `font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Nincs garantáltan beágyazott vagy telepített Inter, ezért rendszerenként fallback lehet; ezt figyelembe kell venni vizuális ellenőrzésnél.

**v1.0-rc1 mobil céltípuslétra**, amely az `ANDROID_UI_DESIGN_PLAN.md` szándékával és a meglévő UI-val összhangban van:

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
- Kártyák: normál widgetnél **18–21 px** sugár (elfogadott minta: 19 px), hero/kiemelt elemeknél 20–22 px; bottom sheet felső sarkok 24 px.
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

**A widgetek rövid, szegélyre korlátozott, halk neonja az új Grapes márkajegy része.** Alapállapotú kártyának sem lehet nagy cián halója, körben izzó kerete vagy feltűnően megvilágított belseje. Logó: eredeti SVG drop shadow. Aktivált navigáció/gomb: finom soft highlight, nem 30–40 px külső aura.

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

**Verzió:** v1.1 / 2026-10-23. A 0. fejezet szerinti mobilos megjelenés felhasználói jóváhagyást kapott (APPROVED). A 2026-10-18-i alapszabályok és audit megőrzött forrásadatok, nem mindenütt kész implementációk. A jóváhagyás önmagában nem kódváltozás és nem APK-release.


## 11. Ellenőrizhető komponensszerződés (célállapot, nem kész implementáció)

| Elem | Tervezési szabály | Kötelező ellenőrzés |
| --- | --- | --- |
| Appbar és fő navigáció | A modul saját fejlécében **csak modulnév balra és modulspecifikus beállítás-fogaskerék jobbra**; nincs ismétlődő Grapes-logó és alcím. A globális főmenü/bejelentkezés ettől eltérhet és továbbra is használhat Grapes-logót. | 320px-től helyes tördelés; safe-area, visszalépés, érthető hozzáférhető gombnév. |
| Elsődleges CTA | `#3BDCF2` kitöltés, **sötét** szöveg, nincs fölösleges külső glow. | 48×48px használható érintési terület; fókusz, disabled, loading és hibaállapot. |
| Másodlagos/destruktív gomb | Raised háttér + halk border; törlés csak szemantikus pirossal és megfelelő megerősítéssel. | Minimum 44×44px célzott másodlagos hitbox; aktív/fókusz állapot nem csak színnel. |
| Kereső, input, select, űrlapcímke | Raised háttér, következetes 12–14px sarok; olvasható normál szöveg 15–16px. | Képernyőbillentyűzet, input focus, nagy rendszerfont, hosszú magyar szöveg, hibajelzés. |
| Statkártya és célérték | Érték 24–32px, `tabular-nums`; cím és magyarázat hierarchikus, nem 7–9px. | Hiányzó cél és ismeretlen adat valós jelzése; nincs levágott szám. |
| Progress bar / ring | Sötét, **teljesen fénytelen track**; csak az aktív ív/bar kap brand- vagy szemantikus színt; glow csak indokolt aktív ívön. | 0/50/100%, nincs cél, ismeretlen érték; reduced motion; gomb és `aria-label` megtartása. |
| Bottom sheet és modal | Sötét felület, diszkrét overlay, konzisztens 24px körüli sheet-sarok. | `role=dialog`, `aria-modal`/inert, billentyűzet és safe-area, mentés elérhető, fókusz és bezárás. |
| Státusz / toast | Siker zöld, figyelmeztetés borostyán, hiba piros, folyamatban cián; minden színnek szöveges jelentése van. | Látható hiba és betöltés, megfelelő `role=status`/élő régió, nincs pusztán szín alapú közlés. |
| Modulikonok | A meglévő `src/android-mobile-icons.js` 24×24 SVG, 1.8 stroke, round és `currentColor` a mobil minta. | Dekoratív SVG `aria-hidden`; az interaktív gomb kap megfelelő megnevezést. |

Az **érintési terület** (látható ikon + tappolható gombterület) számít: 24px ikon lehet 48px-es gombban. A 44px-es kivétel nem menti fel a fő műveleteket a 48px alól; két szomszédos hitbox nem fedheti egymást.

Az olvashatósági cél általában **4,5:1 normál szövegre**, **3:1 nagy szövegre és lényeges grafikai vezérlőre**, a vonatkozó WCAG feltételek szerint. A számított tokenkontraszt **nem** helyettesíti a valós opacity/overlay/fókusz állapotok tesztelését. A mikrocímkék emelésekor a tördelést is át kell nézni; nagy betűnél és 320px szélességen nem szabad levágni a tartalmat.

## 12. Platformtokenek és funkcionális kivételek

A dokumentált `--grapes-*` változók **jövőbeli szemantikus API-nevek**; jelenleg a mobil CSS-ben `--accent` / `--bg` / `--surface` / `--line`, a webes komponenseknél `--color-accent` / `--color-bg-app` / `--color-bg-surface` az implementáltak. **Ne** hivatkozzunk a nem létező global tokenre egy gyors CSS-javításban. A jövőbeli mapping bevezetése külön PR és regressziós feladat (BR-06 / BR-10).

| Szemantikus szerep | Mobilforrás | Desktop/web példa |
| --- | --- | --- |
| Primary interactive accent | `--accent: #3BDCF2` | `--color-accent: #4C8DFD` |
| App background | `--bg: #090E14` | `--color-bg-app: #0F1318` |
| Surface | `--surface: #101821` | `--color-bg-surface: #161B22` |
| Border / empty track | `--line: #243343` | `--color-border: #252D38` |

**Nem hibának minősülő, de ellenőrzendő funkcionális kivételek:**
- A **QR/vonalkód és nyomtatási/szerkesztővászon** valódi fekete-fehér tartalma **nem** arculati átszínezés tárgya. Csak a környező app-toolbar/dialog/chrome.
- A **könyvolvasó** egyedi tartalomtipográfiája és felhasználói olvasási beállításai megmaradnak.
- A **pénzügyi és tápanyagdiagramok** kategóriaszínei (lila, zöld, borostyán, kék stb.) megmaradhatnak, ha jelentést és megfelelő jelmagyarázatot hordoznak. A brand-cián nem minden adatsor kötelező színe.
- A **Víz progress** külön kék színt használhat; az üres track viszont ne világítson, és az adatkezelés teljesen elkülönült marad.
- A **webes Food** jelenleg világos/zöldes; nem automatikusan hibás. Light-variánsként megtartása vagy harmonizálása külön vizuális döntés.
- A **GrapesJS/Fabric/3D szerkesztő** vászna a tartalom része. Harmadik fél CSS-e csak indokoltan, izoláltan írható felül.

A kivétel mindig kapjon dokumentált indokot, modult, színjelentést és későbbi vizuális tesztet.

## 13. Audit-prioritás és bevezetési/tesztelési kapuk

A forrásellenőrzés 14 megállapítást rögzít a [Grapes Brand Audit](./GRAPES_BRAND_AUDIT.md) fájlban:
- **P1 / BR-01–05:** kalóriakör + rossz elvárású tesztek; túl kicsi mobil feliratok és touch targetek; hiányos vizuális mátrix.
- **P2 / BR-06–12:** mobil/web tokeneltérés, világos webes Food variáns, mobil glyph navigáció, modulszínek, nagy inline CSS, legacy és 3D tokenkockázat.
- **P3 / BR-13–14:** betűforrás/fallback és jelenlegi-vs-tervezett-vs-tesztelt dokumentáció.

**Első implementáció csak #42 / BR-01 + BR-05:** külön éles és TEST PR. Élesben `codex/android-app`, TEST-ben `integration/grapes-test-food-20261017`; nincs automatikus merge, APK, frissítés vagy Drive-felülírás. A korábbi erős neon-elvárást tartalmazó prod **mindkét** tesztet és a TEST ring-tesztet szükséges célzottan aktualizálni. Nem módosulhat napló, recept, Víz, YAZIO, Health Connect, backup, Google Drive, aláírás és package ID.

**Vizuális kapuk:** 0/50/100%, napi cél nélkül, ismeretlen kcal; 320/360/390/412px, emelt rendszerbetű, hosszú magyar címke, mentés/képernyőbillentyűzet, fókusz/TalkBack, safe-area és `prefers-reduced-motion`. Lefutott `npm test`, `npm run build:android-web`, releváns Chromium/Playwright regresszió és szükség szerint natív debug. GitHub CI **nem** fizikailag telepített APK-teszt.

**Státusznyelv:** `CURRENT` = forrásban meglevő; `TARGET` = tervezett; `VERIFIED` = működés/screenshot alapján igazolt; `APPROVED` = a felhasználó a megjelenési irányt elfogadta. A v1.1-es mobil **vizuális nyelv APPROVED**, alkalmazásbeli, modulonkénti integrációja külön TARGET/VERIFIED állapotú. Az új főmenü tartalma/elrendezése mindaddig csak PROPOSED, amíg azt külön elfogadják.
