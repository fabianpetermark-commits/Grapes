# Grapes Android — egységes mobil UI terv

## 1. Cél és hatókör

A Grapes Android alkalmazás kapjon valódi, érintésre optimalizált mobilfelületet. A webes felület vizuálisan és működésében változatlan marad.

Az Android-változat:

- telefonon egy kézzel is használható;
- következetes navigációt és műveleti hierarchiát használ minden modulban;
- kezeli a kis kijelzőt, a kijelzőkivágást, a státuszsort, a navigációs sávot és a virtuális billentyűzetet;
- helyi módban és Google Drive-val is érthető állapotot mutat;
- ugyanazt az adat- és üzleti logikát használja, mint a webes változat.

Nem cél külön Android-kódmásolat létrehozása vagy a webes nézet mobilstílusának átírása.

## 2. Technikai elválasztás

Az Android WebView induláskor `is-grapes-android` osztályt kap a dokumentum gyökérelemén. Minden alkalmazásspecifikus szabály egy külön `android-app.css` fájlban, kizárólag ezen gyökérosztály alatt él:

```css
html.is-grapes-android .dashboard { /* ... */ }
```

Szabályok:

1. A meglévő webes CSS marad az alapréteg.
2. Az Android-réteg csak célzott felülírásokat és új mobilkomponenseket tartalmaz.
3. Közös marad az adatkezelés, a Drive-kapcsolat, a modulok logikája és a HTML fő szerkezete.
4. Android-specifikus elem csak `data-android-only` attribútummal kerülhet a DOM-ba; weben rejtve marad.
5. Minden regressziós teszt külön ellenőrzi a webes és az Android megjelenést.

## 3. Vizuális irány

### Karakter

Sötét, nyugodt, modern munkaeszköz. A jelenlegi Grapes kék–cián identitása megmarad, de kevesebb keretet, több felületi elkülönítést és tisztább tipográfiai hierarchiát használunk.

### Android design tokenek

| Tulajdonság | Android érték |
| --- | --- |
| Alap térköz | 4 px, fő ritmus 8 px |
| Oldalsó margó | 16 px; 360 px alatt 12 px |
| Elsődleges érintési cél | legalább 48 × 48 px |
| Másodlagos érintési cél | legalább 44 × 44 px |
| Kártyasugár | 16 px |
| Beviteli mező sugara | 12 px |
| Alsó lap sugara | 24 px felül |
| Törzsszöveg | 15–16 px |
| Segédszöveg | legalább 13 px |
| Képernyőcím | 24–28 px |
| Fő művelet | kitöltött kék/cián gomb |
| Veszélyes művelet | piros, külön megerősítéssel |

Színjelentések:

- cián/kék: aktív, kiválasztott, elsődleges művelet;
- zöld: mentett vagy szinkronizált;
- borostyán: helyi, még nem szinkronizált állapot;
- piros: hiba vagy visszafordíthatatlan művelet;
- szürke: másodlagos információ.

## 4. Globális Android alkalmazáskeret

### Felső alkalmazássáv

- 56 px magas, plusz a felső safe-area;
- bal oldalon vissza vagy Grapes ikon;
- középen rövid képernyőcím;
- jobb oldalon legfeljebb két ikon;
- minden további művelet a „Továbbiak” alsó lapba kerül.

### Alsó navigáció a kezdőszinten

Négy állandó cél:

1. **Kezdőlap**
2. **Projektek**
3. **Szinkron**
4. **Továbbiak**

A modulokon belül ez kontextuális műveletsávvá változik; nem foglalunk helyet egyszerre globális és modulnavigációval.

### Alsó lapok

Telefonon a hosszú panelek, beállítások és ritkább műveletek alulról nyíló lapban jelennek meg. A lap:

- húzással és bezárógombbal zárható;
- nem lehet magasabb a hasznos képernyő 90%-ánál;
- a billentyűzet megjelenésekor is láthatóvá teszi az aktív mezőt;
- egyértelmű címet és opcionális rögzített mentésgombot kap.

### Rendszerállapotok

A Drive- és mentési állapot mindig rövid, egységes chip:

- `Drive csatlakoztatva` — zöld;
- `Helyi mód` — borostyán;
- `Szinkronizálás…` — animált kék;
- `Sikertelen` — piros, újrapróbálási lehetőséggel.

## 5. Fő képernyők

### Belépés

```text
┌────────────────────────────┐
│                      HU EN │
│                            │
│          [Grapes]          │
│     Minden eszközöd,       │
│         egy helyen         │
│                            │
│ [ Bejelentkezés Google-lel ]│
│ [ Folytatás helyi módban   ]│
│                            │
│ Rövid adatvédelmi tájékoztató│
└────────────────────────────┘
```

- Egy képernyőn elfér 360 × 740 px-en.
- A Google-hiba nem növeli korlátlanul a kártyát: rövid összefoglaló és „Részletek” gomb jelenik meg.
- A helyi mód azonos rangú, de vizuálisan másodlagos lehetőség.

### Kezdőlap

- rövid üdvözlés és aktuális tárolási állapot;
- a legutóbbi 2–3 projekt vízszintes görgetés nélkül;
- modulok egyoszlopos, kompakt listában;
- kategóriák összecsukhatók;
- a fejlécben nem jelenik meg egyszerre nyelvváltó, fiókchip, státusz és kijelentkezés — ezek a Továbbiak lapba kerülnek.

### Projektek

- kereshető lista;
- modul, módosítási idő és tárolási hely szűrő;
- kártyánként egy fő művelet: megnyitás;
- átnevezés, másolás és törlés a sor menüjében.

### Szinkron

- helyi/Drive állapot;
- utolsó sikeres szinkron;
- függőben lévő változások;
- Google-fiók csatlakoztatása vagy leválasztása;
- technikai hibakód csak lenyitható részletekben.

## 6. Modulminták

### Adatközpontú modulok

Ételnapló, Pénzügyi Napló, Számla:

- felül napi/havi összegző kártya;
- elsődleges hozzáadás lebegő `+` gombbal;
- táblázat helyett mobil kártyalista;
- űrlapok teljes szélességű alsó lapon;
- szűrők külön szűrőlapon, aktív szűrőchipekkel.

### Könyvtár jellegű modulok

E-book és projektek:

- borító/ikon, cím és rövid metaadat egy sorban;
- keresés rögzítve a lista tetején;
- szerkesztés külön részletező képernyőn;
- tömeges művelet csak explicit kijelölési módban.

### Generátorok

QR Stúdió:

- előnézet a képernyő felső harmadában;
- tartalomtípus lapozható szegmensekkel;
- beállítások összecsukható szekciókban;
- rögzített alsó `Létrehozás` / `Mentés` művelet.

### Vizuális szerkesztők

Brossúra, E-mail Stúdió és 3D Stúdió:

- a vászon mindig elsődleges és a lehető legnagyobb;
- módok: **Vászon**, **Elemek**, **Tulajdonságok**;
- egyszerre csak egy oldalsó panel jelenik meg, telefonon alsó lapként;
- kijelölés után kontextuális alsó eszköztár;
- nagyítás kétujjas gesztussal és külön „Képernyőhöz igazítás” gombbal;
- a ritka, összetett műveletek a Továbbiak lapba kerülnek;
- nincs zsugorított asztali eszköztár.

## 7. Android-specifikus viselkedés

- A rendszer vissza gombja először bezárja az alsó lapot vagy modalt, utána lép vissza, és csak a kezdőképernyőről zárja be az appot.
- A billentyűzet nem takarhat el aktív mezőt vagy mentésgombot.
- Minden görgethető képernyő figyelembe veszi a felső és alsó safe-area insetet.
- A fájlválasztás, megosztás, frissítés és Drive-belépés natív Android folyamatként marad.
- Álló nézet az elsődleges; a vászonalapú modulok támogatják a fekvő nézetet is.

## 8. Hozzáférhetőség

- legalább 4.5:1 szövegkontraszt;
- legalább 48 px elsődleges érintési cél;
- ikon csak hozzáférhető névvel használható;
- szín mellett mindig szöveg vagy ikon jelzi az állapotot;
- rendszer betűméret 130%-ig törés és levágás nélkül;
- csökkentett mozgás beállítás tiszteletben tartása;
- TalkBack bejárási sorrend külön tesztelendő.

## 9. Bevezetési sorrend

### 1. fázis — alapok

- Android platformjelölő és elkülönített stílusréteg;
- safe-area, tipográfia és 48 px érintési rendszer;
- felső sáv, alsó navigáció, alsó lap és státuszchip;
- belépés, kezdőlap, helyi mód és szinkronképernyő.

### 2. fázis — mindennapi modulok

- Ételnapló;
- Pénzügyi Napló;
- QR Stúdió;
- Számla és árajánlat.

### 3. fázis — tartalomkezelés

- E-book könyvtár és szerkesztő;
- E-mail Stúdió.

### 4. fázis — összetett szerkesztők

- Brossúra Szerkesztő;
- 3D Nyomtatási Stúdió;
- érintéses vászonműveletek és fekvő mód.

## 10. Elfogadási feltételek

Minden Android-képernyőnek teljesítenie kell:

1. nincs dokumentumszintű vízszintes görgetés 320, 360, 390 és 412 px szélességen;
2. nincs 44 px-nél kisebb interaktív cél, elsődleges műveletnél 48 px a minimum;
3. a fő feladat legfeljebb három érintésből elindítható a kezdőlapról;
4. a billentyűzet mellett is elérhető a mentés/megerősítés;
5. a rendszer vissza gombja kiszámíthatóan működik;
6. helyi mód és Drive-mód között nincs adatvesztés;
7. Android CSS nélkül a webes képernyőképek változatlanok;
8. legalább egy valódi középkategóriás telefonon történik kézi ellenőrzés.

## 11. Első megvalósítási csomag

Az első kiadható csomag tartalma:

- Android-only platformosztály és stílusbelépő;
- új mobil felső sáv és alsó navigáció;
- kompakt belépési hibaállapot;
- új kezdőlap és Továbbiak lap;
- helyi/Drive státuszchip;
- vizuális regressziós teszt Android és web módra külön.

Ez teremti meg azt a stabil keretet, amelybe a modulokat egyenként, következetesen lehet átültetni.
