# Grapes főmenü – Widgetes Design v1.1 koncepció (2026-10-23)

> **Állapot: PROPOSED / NEM jóváhagyott főmenü-elrendezés.** A közös mobil megjelenés már jóváhagyott; a főmenü pontos komponensei külön felhasználói döntésre várnak. Nem módosít alkalmazáskódot, release-t, Authot vagy Drive-adatot. Alap: [Grapes Brand Guide v1.1](./GRAPES_BRAND_GUIDE.md).

## Mi marad változatlan?

- Négy főmodul: **Home, Health, Utility, Finance**.
- Meglévő alsó globális navigáció: **Főmenü, Projektek, Szinkron, Továbbiak**; a modul saját gyorsműveletei ettől külön kezelendők.
- Minden valódi modul útvonala, belépési/PIN-folyamata, szinkronja és mentett adata ugyanoda vezet, mint korábban; ez egyelőre UI-terv.
- A modul képernyőjén a **minimál fejléc** az elfogadott: balra modulnév, jobbra modulbeállítás. A **Grapes gyökérfőmenü** ettől megengedetten eltérő: a címe Grapes lehet, jobbra globális beállítás.

## Két javasolt elrendezés egy interaktív, különálló HTML mintában

**A változat – 2×2 csempék (alapértelmezett javaslat)**
- A jelenlegi 4 főkategóriát tartja meg.
- 2 oszlop, kb. 12 px rés, 19 px kártyasugár, sötét widgetfelület.
- A kártyán minimal ikon, modulnév, 2–4 funkció röviden és halk jobbra nyíl.
- Rövid, diszkrét `#3BDCF2` neon-fény **kizárólag a kártyaszegély részén**.

**B változat – egysoros/listás modulwidgetek**
- Ugyanez a négy modul, függőleges egyoszlopos, kompakt sorokban.
- Kisebb térfoglalás, több hely a másodlagos, személyre szabott gyorseléréseknek.
- A két nézet *csak a tervben* kapcsolható; a valódi alkalmazásban a kapcsolót/mentett elrendezést a felhasználó jóváhagyása nélkül nem vezetjük be.

**Opcionális másodlagos widget – Gyorselérés**
- A négy modul alatt: például **Ételnapló / Víz / Növények** közvetlen ikonok. Még nem elfogadott kötelező elem.
- Minden csempe valódi létező funkcióra mutasson, ne építsen új mock adatnaplót.
- A tényleges sorrend és hogy lehet-e testreszabni, külön jóváhagyást igényel.

## UI/UX elfogadási feltételek

1. Ugyanaz a Health minimáltervben véglegesített színpaletta: `#090E14` háttér, `#101821` widget, `#17222E` emelt felület, `#243343` halk track/szegély, `#3BDCF2` rövid perem-cian.
2. Nincs nagy, felesleges „Miben segíthetünk?” hero vagy duplázott oldalfejléc; a modulok rögtön láthatók.
3. Mind a négy modul egyenrangú, **nincs ötödik külön Outdoor**: a Növények a Home-hoz tartozik.
4. Megmarad a globális belépési/értesítési/fiók és Android Back funkció: a főmenü-terv nem módosítja automatikusan a valódi Auth helyreállított logikáját.
5. Ellenőrzés 320, 360, 390, 412 px-en: nincs vízszintes túllógás, 44–48 px érintési cél, TalkBack és nagy rendszerbetű külön ellenőrzendő.
6. A különálló HTML prototípus egy kapcsolható demo, **nem** megegyező a jelenlegi éles Grapes kóddal, és nem APK vagy kiadás.

## Következő felhasználói döntések

- 2×2 vagy lista legyen-e az alapfőmenü?
- Maradjon-e külön Gyorselérés widget, és milyen gombok legyenek benne?
- Milyen globális értesítés- és beállításbelépési pont legyen a főmenü fejlécén, hogy egyik funkció se vesszen el?

**Fejlesztési kapu:** csak jóváhagyott végső képernyőkép után elkülönített TEST UI-változtatás; Auth, Food, Water, Drive és PROD változatlan, nem automatikus release.
