# Grapes TEST — normál Finance modul saját fióktárhelyen, örökölt migráció nélkül

**2026-10-25, Water + Finance szakasz.** A felhasználó megerősítette, hogy nincsenek megőrzendő régi normál appadatok. A fiókonkénti tárolás első normál modulja a Water (#144), a második a jelen Finance szakasz. A régi globális IndexedDB-, localStorage-, szintetikus v27/v28- és Drive-tárhelyeket **nem töröljük és nem konvertáljuk**.

## Elkészült

1. A **normál Finance képernyő** a külön TEST Auth és `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED=true` buildkapu mellett nem olvassa a régi közös `finance-tracker-current` és két régi biztonsági mentés rekordját.
2. `src/storage/grapes-test-finance-live.js` natív Grapes TEST subjecthez **megnyitáskor rögzített** Finance controller; `finance-current` az új, A/B tulajdonosi IndexedDB adatbázisban. CAS revíziós mentési sor, hibánál végleg leálló controller, korábbról megmaradó autosave nem kerülhet át B tárhelyére. A tényleges tétel és a bizonylat meta/base64 bytes ugyanabban az új Finance dokumentumban marad.
3. A normál Finance `persistLocal`, automatikus mentés, törlés előtti mentés (`finance-safety-last-delete`), visszaállítás előtti mentés (`finance-safety-before-restore`), visszaállítás és saját biztonsági mentés visszaolvasása az új owner adapteren megy. Kijelentkezett vagy megváltozott fióknál ezek elutasításra kerülnek. A fájlexport előtt is natív subject ellenőrzést végez.
4. **A Drive minden Finance-írása kikapcsolva ebben a TEST módban.** A külön Google Drive-fiók nem egyenlő a Grapes natív Auth subjecttel; ennek kapcsolatát csak külön, későbbi jóváhagyással lehet majd megteremteni.
5. Finance-képernyőre visszatérésnél az előző felhasználó összes memóriában maradt pénzügyi rekordját rögtön eltávolítja. Új natív fiók visszaellenőrzéséig a Finance képernyő rejtve marad. Az új saját projektlista ezután csak a hitelesített fiók `finance-current` metaadatait listázhatja, nem a globális régit.
6. `screens.js` minden friss tulajdonosi TEST módban, közvetlen Android deep link esetén is tiltja a még nem elkülönített Food-, E-book- és egyéb hagyományos modulokat. A Finance indítása csak a natív Auth ellenőrzése után engedett; a Water saját v2 naplója továbbra is a #144 elkülönített útját használja.
7. A hosszabban futó törlés, bizonylat-OCR, kategória- és személyhozzáadás, fájlból visszaállítás és aszinkron mentés az eredetileg rögzített Finance-munkamenetet ellenőrzi, majd csak ugyanebben a sessionben folytatható. A még nem saját fiókhoz rögzített, tömeges CSV/XLSX Finance-import az első QA kiadásban **szándékosan KI VAN KAPCSOLVA**; később külön fiókváltási teszttel nyitható fel. Az önkéntes, teljes Finance-JSON visszaállítás az induló és folytatódó fiókot is ellenőrzi.
8. **Valódi Chromium UI-integrációs próba:** a Finance képernyő saját mentési gombjai A normál tranzakcióját és bizonylatát az új owner IndexedDB-be írják; B saját fiókjával először üres lapot kap; B saját tétele A-nál nem látható; vissza A-ra A eredeti tétele megmaradt. B nem olvashatja A privát biztonsági mentését. A párhuzamos CAS verseny, korábbi controller tiltása, külön mentési sor, régi rekord változatlansága, Drive gomb tiltása és Food/E-book deep link tiltása szintén ellenőrizve. A Water A/B/A és legacy backup/regression tesztek megmaradnak.

## Fontos korlátok

- Ez a *normál Finance UI mesterséges próbatételekkel* végzett CI-teszt, **nem igazolt személyes Finance-tartalom migrációját**. A jelenlegi TEST v28-on a flag továbbra is **OFF**; még nincs új aláírt készülékes APK, telefonos A→B→A itt nem történt.
- Nem teljes a Grapes fiókszeparációja: Food, E-book, Home, Health/Health Connect, YAZIO és külön Google Drive útvonalainak továbbra is saját tulajdonoshoz kötött, adatbiztonságos munkamenetre van szükségük. A TEST flag csak Water+Finance-re engedi a valódi modulokat, más útvonalat ideiglenesen lezár.
- A régi közös adatok fizikailag továbbra is a készüléken lehetnek, mert nem kértek törlést. A kliensoldali fiók-szűrés nem tekinthető titkosításnak vagy védelemnek rosszindulatú kód ellen.
- A TEST/PROD Supabase szerveradatokat és Drive-t nem módosítja. Nincs PR-merge, nincs PROD release, automatikus frissítés, APK, felhőszinkron vagy fiókhoz rendelés.

## Következő szükséges lépések

Normál Food-profil és receptek fiókhozkötése (minden mentési sor, pending/YAZIO/Health import, távoli Drive-fiók), majd E-book olvasási haladás és Drive-határ. Ezután a teljes Water+Finance+Food+E-book új fiókos TEST engedélyezése, tesztek és külön, történeti aláírással összeállított APK; egy valódi telefonos A→B→A normál modulpróba szükséges a teljes PASS-hoz.
