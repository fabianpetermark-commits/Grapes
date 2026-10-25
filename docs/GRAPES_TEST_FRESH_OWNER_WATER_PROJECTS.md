# Grapes TEST – új, üres fiókonkénti adatok: első normál modul, Water

**2026-10-25 döntés:** a tulajdonos megerősítette, hogy a normál Grapes-alkalmazásban jelenleg nincsenek megőrzendő korábbi adatok. Ezért a régi globális helyi rekordok tulajdonoshoz rendelésére és aktív migrációjára **nincs szükség**. Új fiókok kizárólag üres, saját tárhelyet kapnak. Az eddigi szintetikus QA rekordokat és a régi DB fizikai bájtjait *nem* töröljük és nem módosítjuk.

## PR tartalma

1. `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED` – kizárólag TEST channel + natív Grapes Android Auth esetén értelmezett, **alapértelmezésben OFF** kapcsoló.
2. `src/water/grapes-test-fresh-water.js` – a valódi Water-v2 helyi tárolási műveletei natív hitelesített subjecthez kötve. Új, fiókonkénti helyi kulcs `grapes-water-v2:<subject>`. Az A fióknál megnyitott Water-kontroller *nem követheti* B belépését: a régi kontroller érvénytelenné válik. `read`/CAS-`save` megőrzés, kijelentkezéskor hozzáférés elutasítva.
3. `src/android-mobile-shell.js` Water főnézet: a fenti TEST flag hatására elindítja az owner-kötött Water-profilt, az új fiók először üres víznaplót lát; víz hozzáadás, törlés, célmódosítás, mentés és visszaállítás előtt a natív subjectet újra ellenőrzi. Automatikus Food/Health → Water adatátvitel letiltva. A régi, profil nélküli Water-átvétel nem látható/engedélyezett. A saját profilos JSON-visszaállításnál a régi, tulajdonos nélküli v1 mentés nem engedélyezett.
4. A közös `grapes-projects` és Drive projektek helyett a projektlista TEST módban kizárólag **statikus, adatmentes modulparancsikonokat** mutat; előtte ellenőrzi a natív Grapes subjectet. Az új `src/storage/grapes-test-fresh-owner-access.js` kizárólag a korábbi v27-ben PASS-ra tesztelt tulajdonosi IndexedDB partícióból adhat új Finance-projektindexet/használati becslést; a normál Finance itt **még nincs bekötve**, ezért semmilyen régi Finance-rekord nem jelenhet meg. A Szinkron képernyő a közös `navigator.storage.estimate()` helyett csak a saját partícióról ad tájékoztatást. Drive továbbra is külön Google-fiók, nincs automatikus hozzárendelés.
5. Valódi Chromium + IndexedDB + localStorage teszt: A Water saját rekord mentése; B először üres Water-tárhelyet lát; A kontroller B belépése után mentést megtagad; B saját adatai megmaradnak; vissza A → eredeti saját rekord; kijelentkezés után minden olvasás tiltva. Régi globális víznapló és Finance-projekt bájtjai változatlanok. B projektlista és tulajdonosi státusza nem mutat A rekordot.
6. **Nincs APK és nincs engedélyezett készülékes funkció.** A v28 telepített binárisa, PROD, távoli Supabase TEST/PROD, Drive, helyi szintetikus QA-adatok változatlanok.

## NO-GO – ez még NEM teljes többfiókos adatvédelem

- Food: a normál `food-mobile.js` továbbra is Drive-profil alapú, külön mentési sorral és automatikus importtal. Egész olvasás/írás/Drive szinkron átállítás szükséges.
- Finance: külön natív Auth-alapú `finance-current` adapter már létezik, de a normál `finance-tracker.js` a régi `finance-tracker-current` ID-t és Drive-útvonalat használja. Natív TEST navigációs útvonalat is át kell tekinteni.
- E-book: olvasási haladás `grapes-ebook-reading-progress-v1` és Drive-könyvtár külön, nem az új Grapes Auth account. Átállítás előtt fiókhoz kötött E-book kulcs/Drive boundary kell.
- House/Home és Health számos további helyi útvonala, Food/Health/Samsung import és backup/export szintén külön teljes felülvizsgálatot igényel.
- Ez az első modul csak strukturális, **QA flag OFF** a szokásos TEST/PROD-ban. Nem állítható, hogy a teljes Grapes A/B adatvédelme már PASS. A QA-szintetikus A→B→A és SAF v28 PASS továbbra is érvényes a saját, korábbi korlátozott körére.
- Nincs legacy migration, törlés vagy adat-clear még akkor sem, ha a user most üres appot jelzett.

**Következő lépések:** teljes Finance, Food és E-book be-/kimeneti utak fiókhoz kötése, a teljes TEST-szintű védelem bekapcsolása csak ezek és a normál modulok egytelefonos A/B/A tesztje után. A Water és a tulajdonosi projektindex önmagában nem elég a közös telefonos app-adatvédelemhez.
