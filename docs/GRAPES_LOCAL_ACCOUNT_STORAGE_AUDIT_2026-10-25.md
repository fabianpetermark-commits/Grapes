# Grapes — helyi adatok fiókelkülönítésének auditja (TEST, 2026-10-25)

## Rövid eredmény

**KOCKÁZAT IGAZOLVA — a jelenlegi Android TEST v26-ban a Supabase-fiók váltása nem biztosít általános helyi adatelkülönítést.**

Az A ↔ B telefonos szerveroldali szintetikus Food-jogosultsági teszt PASS volt, de a natív Auth-kapu `getTestAuthSubject` azonosítója jelenleg **nem** szűri automatikusan a régi alkalmazás-W​​ebView helyi tárolóit. A Drive külön identitás; annak bejelentkezése nem azonos a Grapes Auth-tal.

## Bizonyítékok a forráskódban

| Modul | Hol és hogyan tárol | Miért nem Supabase-fiókra izolált |
|---|---|---|
| **Kezdőlap projektlista** | `src/storage/local-project-store.js`, `grapes-projects/projects`, `listLocalProjects()` `getAll()` | A lista tulajdonos szerinti szűrés nélkül adja vissza a projekteket, és az `src/android-mobile-shell.js` megjelenítheti őket |
| **Finance** | `src/finance-tracker.js`, `finance-tracker-current` projektazonosító | Mindkét Grapes Auth-fiók ugyanazt a rekordazonosítót használja; a mentés is ezt célozza |
| **Food** | `src/food/food-mobile.js`, `food-tracker-${profileId}` | A profil az opcionális **Drive** fiók azonosítója vagy `local-food-profile`, nem a Grapes Supabase-fióké. A `migrateLocalProject()` is Drive-profilváltásra épít |
| **Food mentési sor** | `grapes-food-pending-v1:${profileId}` | A sor Drive/legacy Food-profilhoz kötött, nem hitelesített Grapes Auth-fiókhoz |
| **Water** | `src/android-mobile-shell.js`, `grapes-water-v1` | A korábbi kulcs mindenkinek közös; a `grapes-water-v2:<UUID>` prototípus létezik, de a v26 signed workflow-ban `VITE_GRAPES_TEST_WATER_PROFILE_ENABLED=false` |
| **E-book helyi haladás** | `src/ebook-mobile-library.js`, `grapes-ebook-reading-progress-v1` | Globális helyi kulcs, nem Supabase-fiókonkénti |
| **E-book könyvtár-gyorsítótár** | `src/ebook-library.js`, `grapes-ebook-library-cache-v2:<Drive-account>` | Drive-fiók szerint szétválasztott, **nem** Grapes Auth-fiók szerint |
| **Health / offline mentés** | `src/sync/grapes-health-v24-local-reader.js`, IndexedDB + Water | Csak leltár és mentés; a Grapes Auth szerinti hozzáférésellenőrzést külön kell megtervezni |

### Reprodukció (kizárólag külön, eldobható böngészőben)

`node tests/grapes-local-account-legacy-audit.browser.mjs` mesterséges A jelölőket ír az ugyanazon böngészőeredet alatti Finance/Food IndexedDB-be és Water/E-book localStorage-ba. Külön B-lapról változatlan API-val olvas. Ez a próba a **jelenlegi kockázatot** mutatja ki: a script zöld futása **nem** jelent biztonsági PASS-t; ha a védelmi réteg később megépül, a tesztet az elutasított hozzáférés igazolására kell átírni.

## Kötelező következő lépések — módosítási sorrend

1. **Teljes adatleltár és ellenőrzött mentés** modulonként (Food, Water, Finance, E-book, Health, valamint import/üzenetek). A régi tárolókban lévő rekordokat **nem szabad automatikusan az aktuálisan bejelentkezett fiók tulajdonába venni**.
2. **Azonosításon alapuló egységes helyi tárolókapu:** tulajdonos UUID ellenőrzése az adatmegnyitás, lista, mentés, import, export, helyreállítás és automatikus szinkron előtt. Az app saját névtelen/helyi módjának legyen külön előre tisztázott tulajdonosi modellje. Az Auth bejelentkezés hiánya ne adjon implicit hozzáférést más személyhez rendelt rekordhoz.
3. **Módosíthatatlan régi adatpillanatkép és migrációs próba**, tranzakciósan másolt, fiókonkénti tárhelyre; tartalom-, darabszám- és hash-ellenőrzött visszaolvasás. Fiókhoz rendelés csak explicit felhasználói megerősítéssel, duplikátum és ütközés kezelésével. Régi adatokat csak egy későbbi, külön jóváhagyott takarítás törölhet.
4. **Közös készülék A/B próbája**: A saját adata látható, B-nek nem látható és nem módosítható; B saját adata fordítva; alkalmazás-újraindítás, offline mód, közben megszakadó írás, visszaállítás és Drive-fiókváltás tesztek.
5. Csak utána engedhető bármely normál Food/Health felhős szinkron, automatikus adatmozgatás vagy Google Play publikálás.

## Jelen PR biztonsági határa

- Az app adat-API-ja, tárolókulcsai, natív belépése és adatai **változatlanok**.
- A CI kizárólag **eldobható böngészőben** fut; sem PROD, sem távoli TEST adatai nem kerülnek olvasásra vagy írásra.
- **NO-GO** közös telefon több külön személy adatainak használatára; **NO-GO** normál felhőszinkronra.
- A korábbi A ↔ B Supabase TEST szintetikus szerveroldali PASS **érvényben marad**, attól ez a feltárt helyi probléma független.
