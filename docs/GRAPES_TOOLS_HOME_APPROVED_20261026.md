# Grapes Tools főoldal — jóváhagyott UX (2026-10-26)

**Állapot: APPROVED DESIGN / INTERAKTÍV HTML-KONCEPCIÓ.** A 2026-10-26-i beszélgetésben a „Grapes Tools – interaktív főoldal” kipróbálása után a felhasználó válasza: „Szerintem rendben van”.

## Elfogadott szerkezet

- A Brand Guide v1.2 egységes, hatikonos gyökérnavigációja: **Kezdő / Home / Health / Tools / Finance / Beállítások**, a **Tools** aktív nézettel. Pontosan egy `Tools` főcím az ikonsor alatt, nincs belső E-book/QR választómenü, nincs külön látható Vissza/Home gomb.
- **Közvetlenül látható E-book widget**: az utoljára olvasott könyv borítóval, címmel, típus/szerző adatokkal és haladási sávval, közvetlen **Olvasás folytatása**, valamint Könyvtár hozzáférés.
- Alatta **közvetlenül látható QR Stúdió widget**: link/szöveg beviteli mező, **QR szerkesztése**, **Új QR**, és legutóbbi projektek kompakt listája. Ne legyen köztes csempemenü.
- Saját alsó, rögzített **Tools Quick Action**: `Folytatás / Könyv / Átvitel` háromfeliratos kapszula, jobb oldalt külön **Új QR** főgomb. Más modulok gyorsműveleti sávját nem helyettesíti.
- Saját könyvtár és QR-projektek külön-külön valódi részletes nézetben/szerkesztőben nyíljanak meg. A Tools főoldal nem kísérelheti meg az összes belső képernyőt egyetlen hosszú lapon összezsúfolni.
- A színek, kártyák, 1 px részleges cyan peremfény, ikonméret és tipó a Grapes Brand Guide v1.2 szerint. Nem kötelező a könyv belső olvasószövegét vagy a valódi, olvasható QR-kódot neonra festeni.

## Technikai megjegyzés
A chatben elfogadott HTML/CSS/JS mintaprototípus csak memóriabeli könyveket és QR-projekteket használ. A régi `design/references/candidates/tools.html` továbbra is egy **régebbi PROPOSED referencia**, még át kell vezetni az elfogadott pontos Tools-dizájnra. Valódi Google Drive, EPUB/PDF könyvtár, fájlimport, E-reader párosítás és QR-generálás nem bizonyított ezzel a prototípussal. Nincs Android/TEST/PROD változás vagy kiadási engedély.

**Következő vizuális review:** az E-book modul belső Könyvtár / Olvasó / Átvitel képernyője, utána QR Stúdió részletes terve.
