# Grapes főmenü – felső ikonsor és Gyakran használt kezdőoldal (2026-10-23)

> **Állapot:** a főmenü-szerkezetre vonatkozó **jóváhagyott felhasználói irány**; a részletes HTML/UI kompozíció még interaktív előnézet, külön vizuális végső jóváhagyást igényel. Az előző „2×2 / Lista / alsó Főmenü” koncepciót **felváltja**. Forrás: [Brand Guide v1.1](./GRAPES_BRAND_GUIDE.md) – 0.6. fejezet.

## Az új főképernyő

A Grapes belépés után mindig a **Kezdő / Gyakran használt** oldalra érkezik. Az egyszerű fejlécben balra **Grapes**, jobbra az alkalmazás **globális beállításainak fogaskereke**.

A fejléc alatt **egyetlen vízszintes, swipe-pal gördíthető ikonsor** van. Balról jobbra induláskor:

| Sorrend | Ikon célja | Oldal | Megjegyzés |
| --- | --- | --- | --- |
| 1 | Kedvences házikó | **Kezdő** | A gyakran használt oldal, induláskor aktív |
| 2 | Ház | **Home** | Növények, bevásárlólista, készletkezelő |
| 3 | Szív | **Health** | Food, Víz, Receptek, Statisztika |
| 4 | Négyzetek | **Utility** | E-book, QR és az egyéb eszközök |
| 5 | Pénzügy | **Finance** | Pénzügyi napló és kimutatások |
| 6+ | Saját ikon | **Későbbi új főmodul** | A modulregiszterből automatikusan az ikonsor végére kerül |

Az ikonokat olvasható rövid név kíséri. Legalább 44–48 px érintési terület, kiemelt aktív állapot, hozzáférhető szemantika és vízszintes görgetés, ha minden ikon nem fér ki. **Nincs modulmaximálás vagy régi alsó navigáció.**

## A Kezdő oldal – kézi + automatikus kedvencek

- **Gyakran használt** címsor és „+ Hozzáadás” kereshető modulválasztó.
- **Rögzített** kedvencek: felhasználó külön kijelölte, a Grapes nem távolítja el. Ezek jelennek meg először, saját, később szerkeszthető sorrendben.
- **Automatikus** kedvencek: a profil saját, tényleges használata alapján, átlátható rangsorolással; csak a leggyakrabban megnyitott néhány modul. Nem ugyanaz, mint a kézi rögzítés.
- **Eltávolítás és elrejtés**: bármely kézi kedvenc eltávolítható; az automatikusan ajánlott elrejthető (ezt a rendszer megjegyzi). A funkció a főmodulban továbbra is elérhető.
- **Új felhasználó**: nincs hamis előzmény vagy automatikus szám, üres/szűk kezdőállapotot kap, és azonnal tud hozzáadni.
- A prototípusban az első képen a példák: **Ételnapló, Víznapló** rögzítve; **Növények, Receptek** automatikusan ajánlva. Ezek a mintaszámlálók **nem valós Grapes használati statisztikák**.
- Profilhoz kötött privát tárolás, készülékek közötti biztonságos szinkron, duplikáció/konfliktusvédelem csak egy külön megvalósítási körben. Soha ne gyűjtsünk tartalmi egészség- vagy pénzügyi adatot egy egyszerű navigációs gyakorisági számláló kedvéért.

## Amit kifejezetten eltávolítunk a tervezett főmenüből

- „Modulok” felirat a főoldal tetején.
- „2×2 / Lista” elrendezéskapcsoló.
- Nagy 2×2 Home, Health, Utility, Finance főmenükártyák.
- Korábbi alsó **Főmenü / Projektek / Szinkron / Továbbiak** ikonsáv – a felhasználó szerint régen megszűnt, ezért sem referenciaként, sem jövőbeli főmenüelemként nem szerepelhet.

**A főmenü alsó navigációját eltávolítjuk, DE az alsó modul-gyorsműveleteket megtartjuk minden fő területen.** A felhasználó külön megerősítette a Health-ből ismert, fix alsó pill sávot. A felső ikonsor kategóriát választ; alul az éppen látható kategória **saját műveletei** vannak, ezért a dock tartalma főmodulváltáskor változik. Ezek nem másodlagos navigációs fülek.

- **Health (konkrétan jóváhagyott):** Fotó, Étel, Víz és külön kerek Vonalkódolvasó. A Health adatwidgetekkel egy képernyőn látható, nem újabb menübe vezet.
- **Home / Utility / Finance:** ugyanilyen szerkezeti és vizuális szabály szerinti, de **még megtervezendő** saját gyorsműveleti készlet; ne emeljünk át Health-es gombokat ezekbe automatikusan.
- **Kezdő / Gyakran használt:** helyben releváns gyors műveletek (pl. kedvencek hozzáadása / rendezése) külön egyeztetendők, hogy ne duplázzuk a Kezdő tartalmában levő műveleteket.
- **Új főmodul:** saját, deklarált gyorsműveleteivel bővíti az alsó dock tartalmát is a felső ikonsoros navigációhoz illeszkedve.
- **Elhelyezés:** alul rögzített/sticky, androidos safe-area fölött, megfelelő scroll-paddinggel, a tartalmat és utolsó widgetet nem takarja. Teljes képernyős szerkesztőn vagy megnyitott billentyűzetnél kontextus szerint elrejthető és visszatérve helyreáll.
- **Látvány:** Health-minimal minta; sötét, lekerekített pill 2–4 gyakori gyorsgombbal, indokolt esetben külön kerek fő action; matt fill, finom neon-cián csak a keret rövid szakaszán, nincs túlerős glow.
- **Adatbiztonság:** az újratervezés nem módosít mentett Food/Víz/Drive/Finance adatot és nem töri el az Auth / PIN folyamatot.

## Elfogadott vizuális nyelv

**Grapes Brand Guide v1.1** szerint: háttér `#090E14`, widget `#101821`, raised `#17222E`, sötét keret `#243343`, cián `#3BDCF2`. A kártyák peremén rövid neon-szakasz, nincs teljes glow. Tömör címkék, jól olvasható ikonok, 19 px körüli widget-sarok. A képernyő fontos részeit a navigáció ne fedje el.

## Elkülönített HTML/CSS/JS prototípus

A 2026-10-23-i különálló **Grapes főmenü v1.2 – ikonsor és kedvencek** tervben már látható a Kezdő, a Home/Health/Utility/Finance ikonfül, a modulválasztó és a mintán alapuló automatikus sorolás. Demo állapotát helyi böngészőtárolás kezeli, nem a Grapes Auth/profil/Drive.

Böngészős próba: 320, 360, 390, 412 és 768 px; 5 főkategória, keresés/hozzáadás, ikonváltás; horizontális túlcsordulás nélkül. Ez **nem** APK és nem a régi főmenü tényleges eltávolítása az alkalmazásból.

## Implementációs kapu

Az új főmenü csak külön, jóváhagyott **TEST** munkaként vezethető be. Védeni kell a visszalépést, a Health gyorssávot, Google/Supabase Auth + PIN-t, Drive-ot, a meglevő Food/Víz/Finance adatokat és a PROD kiadási folyamatot. Sem dokumentumfrissítés, sem HTML próba **nem** indokol automatikus merge-et vagy APK-t.
