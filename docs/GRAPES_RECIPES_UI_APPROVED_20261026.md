# Grapes Health / Receptek — jóváhagyott UX (2026-10-26)

**Státusz:** Felhasználó által jóváhagyott interaktív HTML/CSS/JavaScript **felületi prototípus**, nem bekötött Android/TEST/PROD funkcionalitás.

A 2026-10-26-i chatben bemutatott `Grapes Receptek – interaktív terv` prototípusra a felhasználó azt mondta: **„Tökéletes”**, majd kérte a következő modult. A felületi terv tényleges HTML, CSS és JavaScript demonstrációs logikával rendelkezik (keresés, szűrés, kedvencek, szerkesztés, minta mentés), nem képernyőkép. A mintaadatok nem íródnak a Grapes alkalmazásba. A korábbi `design/references/candidates/recipes.html` **nem azonos** ezzel a chatbeli, jóváhagyott prototípussal; a pontos új dizájn a következő implementációs feladat.

## Jóváhagyott receptgyűjtemény
- Brand v1.2 egységes hatikonos Health navigáció, szimmetrikus fogaskerék, egyetlen `Receptek` főcím.
- Keresés, `Mind / Édes / Sós / Kedvencek` szűrők, találat- és kedvencszám.
- Kompakt kártyák, receptkép/illusztráció, név, kategória, elkészítési idő, adag, valós forrásból számolt kcal/adag, kedvenc.
- Részletes receptadatlap: összetevők/mennyiségek, elkészítés, makrók ha valósak, szerkesztés és külön felhasználói jóváhagyással Food tényleges naplózása. Recept megnyitása önmagában nem naplóz fogyasztást.

## Jóváhagyott receptszerkesztő
Öt tényleges, tartalmát váltó fül: **Alapadatok**, **Összetevők**, **Elkészítés**, **Kép**, **Import**. A szekciók ugyanazt a szerkesztőkeretet használják, nem kötelező öt oldalnyi görgetés.
- Alapadatok: név, Édes/Sós típus, adagok, elkészítési idő.
- Összetevők: egyenként kereshető/hozzáadható mennyiség és egység, lista szerkesztés/törlés. Éles cél: katalógus élelmiszer azonosítóhoz, tápértékek, adagok dinamikus számolása; nem a demóban szabadon megadott fiktív kcal.
- Elkészítés: szerkeszthető leírás.
- Kép: saját fotó feltöltés és jogtiszta forrás.
- Import: **egy szövegdoboz** linkhez vagy bemásolt receptszöveghez, **alatta egy fájlválasztó**, a feldolgozás után ellenőrizhető, jóváhagyható előnézet. Az elfogadott HTML demo nem valódi URL/PDF/DOCX parser.
- Módosítás / mentés / mégse, új recept hozzáadás, egyszerű mobil működés.

## Biztonsági / implementációs megkötések
- Az elfogadott interaktív chat-prototípus állapota **csak memóriában** létezik. A valós Food/Supabase/Drive tulajdonoshoz kötött mentés, YAZIO, keresés, tápértékszámítás, fájlimport, kamera és adatszinkron külön implementáció/QA.
- Meglevő recept és tápérték felülírás nélkül, explicit szinkron/migráció; a Food napló továbbra is a tényleges fogyasztás, étrendtervezés nem ír bele automatikusan.
- Az Android TEST/PROD UI parity, a HTML referencia-átvezetés, és az adatbackend tesztek még elvégzendők. Az elfogadás nem release GO.

**Következő felülvizsgálandó Health-modul:** `Statisztika`, külön `Minden idő` összesített nézettel, választható tápanyagokkal és megoszlási ábrával.
