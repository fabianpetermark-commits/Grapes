# Grapes TEST — fiókonkénti Food adatmag (nincs régi adatköltöztetés)

**Állapot: első Food owner-local repository elkészült, normál mobil Food-UI még NEM csatlakozik.** A felhasználó szerint a régi Grapes alkalmazásban nincs megőrzendő valódi adat, ezért a régi globális projektadatbázis régi rekordjait nem kell fiókhoz rendelni. Fizikailag változatlanul megmaradnak; nincs automatikus törlés vagy data-clear.

## Elkészült

- `src/food/grapes-test-fresh-food.js`: natív Grapes TEST Auth-höz kötött, fiókonként külön IndexedDB-partícióban tárolt teljes Food-projekt: napi étkezések, tápérték-pillanatképek, saját ételek, receptek, napi célok és beállítások. Az első `load()` kizárólag az aktuális hitelesített fiók számára hoz létre memóriabeli, üres `createEmptyFoodProject()` példányt; nem ír a régi helyi adatbázisba.
- `normalizeFoodProject(..., owner)` és további fiókkonzisztencia-ellenőrzés: idegen `diaryEntries.profileId` vagy `recipes.ownerProfileId` elutasítva.
- Rendszeres natív Auth alanyellenőrzés betöltés előtt/után és minden CAS mentésnél; A-ban megnyitott munkamenet nem írhat B-be és fiókváltáskor hibával leáll. Soros, snapshot-alapú CAS revíziómentés megakadályozza a felülírást; ütközés/munkamenet-hiba után a vezérlő *poisoned* és nem jelenti magát helyreállítottnak.
- YAZIO / Health Connect / Drive / megosztott receptkönyvtár / függő import batch továbbra is **szigorúan tiltott** ezen a repository interfészen: addig nem használható, amíg külön, teljes, fiókhoz kötött import-szinkron útvonalakat nem készítünk. Nincs személyes import vagy felhőírás.
- Valódi Chromium/IndexedDB szintetikus A → B → A teszt: A üres naplóból étkezést, 100 g-os Food-tápértéket és saját receptet ment, B üresen indul, B saját ételt rögzít, visszatéréskor A adatai megvannak; B nem örökli A profilját; idegen napló/recept és import elutasítva, elavult munkamenet nem menthet; CAS-ütközés és kijelentkezés fail closed. A régi közös `food-tracker-...` mentés bájtszinten érintetlen marad.
- CI tartalmazza a már működő **normál Finance képernyő** és **Water fiók A/B/A** regresszióit is, hogy egy Food változtatás ne törhesse el őket.

## Korlát / NO-GO

1. A Food UI (`src/food/food-mobile.js`), `src/food/food-app.js` még a régi/Drive-alapú útvonalakat használják, ezért az új Food repository **nem szerepelhet mint kész, rendes modul**. Jelen opt-in `FRESH_OWNER_MODULES` navigáció változatlanul zárolja a Food modult.
2. A `src/food/food-mobile.js` korábbi globális helyi mentési sorai/YAZIO-journalja, Health/Water átemelés, Drive-szinkron és sharing inbox mind külön felülvizsgálatot és teljes account ownership enforcementet igényelnek.
3. Nincs APK; a telefonon lévő TEST v28 érintetlen, TEST projekt alapértelmezetten OFF; PROD és Supabase/Google Drive érintetlen; nincs PR merge/release/éles adat.
4. A böngészős teszt szimulált hitelesített Grapes-subjectet használ. Valódi natív Auth alanykötést már a v27 szintetikus adatpróba igazolt, **de a normál Food mobil UI és közös telefonos használat még nem volt tesztelve**.
5. A közös tárhelyben korábban létező rekordokat nem követi és nem migrálja; új fiók esetén kizárólag az üres saját partíció látható.

**Következő PR:** a Food mobilnézet megfelelő `load / persistLocal / scheduleSave / flush` útját a fenti repository-hoz csatlakoztatni, a régi/Drive/YAZIO/Health/megosztási ágakat előbb teljesen zárolni, és azt *valódi normál UI-t nyitó* A/B/A böngészős teszttel igazolni. Utána tovább az E-book felé.
