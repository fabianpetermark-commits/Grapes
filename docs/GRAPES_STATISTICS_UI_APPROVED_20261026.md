# Grapes Health / Statisztika – elfogadott felület (2026-10-26)

**Státusz:** a felhasználó által jóváhagyott HTML/CSS/JS-alapú vizuális és interakciós terv. **Nem** kész Android/TEST/PROD-implementáció vagy valódi Health/Food adatkapcsolat.

## Végleges döntés, vizuális megjelenés

A `Statisztika` oldal az egységes Grapes Brand Guide v1.2 szerinti **hatikonos felső navigációt**, szabályos fogaskereket, minimál neon-cián palettát és **egyszeri oldal-főcímet** használja. További ismételt modulcímek, dekoratív címsorikonok nem kellenek.

- Alapértelmezés: **Minden idő**, a felhasználó minden tényleges, feldolgozható naplóadatával, nem naptárválasztó főoldallal. Gyors időszakok: `7 nap`, `30 nap`, `90 nap`.
- `Vizsgált mutató` nézet: **5 szűrő egyszerre, pontosan egy sorban, vízszintes görgetés nélkül**. Nincs külön doboz, háttérlap vagy piktogramkeret az ikonok körül. Kompakt, ~23–25 px-es ikonok egyenlő oszlopban, teljes ujjérintési cél (legalább 44 px magas). Az aktív választást csak **rövid, halk cián aláhúzás** jelöli, teljes háttérglow nincs.
- Az öt eredeti alapmutató: **`kcal`** felirat (kalória); **`💪` egyszerű izmos kar emoji** (fehérje) – **nem** saját bonyolult/széteső vonalrajz; kenyér/vekni piktogram (szénhidrát); félbevágott avokádó piktogram (zsír); vízcsepp (víz). A felhasználó a többi ikont jóváhagyta; csak a fehérje cserélendő egyszerű `💪`-re.
- További, választható mutatók (például rost, cukor) `Testreszabás` alatt kapcsolhatók; az új ikonok **a következő sorba törjenek**, soha ne indítsanak vízszintes ikongörgetést.
- Minden ikon könnyen értelmezhető `aria-label` + `title` értékkel és látható billentyűzetfókusszal; a kijelölt mutató **neve és mértékegysége** külön, egyetlen szövegsorban látható a sor alatt.

## Tartalom és működés
- Összesítés: **napi átlag**, **időszakra számolt teljes mennyiség** helyes egységgel.
- Kattintható, időszak szerint újraszámolt oszlopgrafikon, konkrét oszlopra koppintva az adott periódus átlaga és intervalluma.
- **Makrók megoszlása** kördiagramon: energiaarány, nem grammarány. Fehérje 4 kcal/g, szénhidrát 4 kcal/g, zsír 9 kcal/g. Értelmezhető százalékok, élő jelmagyarázat.
- Health globális alsó Quick Action: `Fotó / Étel / Víz` + külön nagy `Vonalkód`. Kamera művelet éles Androidban közvetlen natív olvasó, itt csak terv.
- Health `Beállítások` alatt változatlanul kizárólag `Napi célok` és `Adatkapcsolatok` szekciók.

## Megvalósítási és adatminőségi feltételek
A chatben bemutatott `Grapes Statisztika – kompakt neonikonok` prototípus működő HTML/CSS/JS demo volt, **180 napnyi mesterséges adatokkal**, nem teljes élő statisztikai backend. Az app megvalósítása előtt valós Food + Víz adatforrás, deduplikáció, mérési egységek, hiányzó napok, időzóna, dátumkezelés, RLS/owner izoláció és mozgó-időszakos aggregáció külön tesztelendő. Az éles build és adatbázis változatlan, nincs automatikus merge vagy PROD GO.

**Utolsó UX visszajelzés:** „A fehérje piktogram :D kivehetetlen egy sima izmos kar kéne szerintem💪, a többi tökéletes.” A dokumentált végleges változat ezt a pontos javítást tartalmazza.
