# Grapes TEST – Food Design 2.0 / QA és átadási jegyzet

**2026-10-19 • Implementációs jelölt, nincs még készüléken ellenőrizve.**

## Hatókör

- A `design/android-mobile-preview.html` Food-specifikus CSS-e kapott egységes Grapes-vizuális réteget.
- A meglévő HTML szekciók, azok sorrendje, a `data-*` eseményvezérlő hookok és a `src/food/food-mobile.js` JavaScript **változatlanok**.
- Nem lépett be a 2. ütem (Ma / Ételek / Receptek / Statisztika új belső navigáció). Az öt receptfül, a globális alsó navigáció és minden meglévő folyamat maradt.
- A részletnézet képei a **valós receptfotókat** mutatják; fotó híján nem szúrunk be kitalált ételképet. A Home intelligens ajánlórendszere nem része a módosításnak.
- A napi gyűrű üres trackje sötét; csak az aktív progress íven marad rendkívül enyhe cyan fény.

## Érintett megjelenések

1. Napi áttekintés: dátumválasztó, energia / makró progress, napi célok, statisztika gomb.
2. Víz gyors kártya.
3. Kompakt receptlista és étkezési kártyák.
4. Étkezési részletek / naplózott étel sorok / megosztás.
5. Receptlista és meglévő receptadatlap (kép, összetevők, elkészítés, szerkesztés/törlés).
6. Ételkeresés, vonalkód, kedvencek, saját étel és egyéb Food-űrlapok.
7. Ötfüles receptszerkesztő: Alapadatok / Felvétel / Összetevők / Kép / Importálás.
8. Statisztikai és napi célok képernyő.
9. Food megosztás, bejövő elemek és Health import Food-dialógusai.

## Ellenőrzési terv (még elvégzendő)

### Automatizált

- `npm test` – benne az új `tests/food-design-2-visual.test.js`, amely megőrzi az alap szekciósorrendet, az öt tabot, a fontos hookokat, és dokumentálja az új stílusok jelenlétét.
- `npm run build:android-web`.
- `npm run test:android:shell` – Playwright + Chrome, ha helyben rendelkezésre áll.
- Célzott screenshot: 320 / 360 / 390 / 412 px; 100% / 150% rendszerfont; rövid és nagyon hosszú magyar receptnevek.
- Kalóriagyűrű: cél nélkül, 0%, 50%, 100%, cél fölött, hiányzó tápanyag; soha ne világítson a passzív ív.

### Kézi TEST-app ellenőrzés

- Kezdőlap: a dátum, makrók, víz, receptek és az **öt** étkezés azonos sorrendben marad; nincs eltűnő vagy egymást fedő gomb.
- Ételkeresés: normál találat, online/offline, saját étel, kedvenc, szöveges forrás és fotón szereplő **vonalkód**, nem ételfelismerés.
- Receptlétrehozás az öt meglévő füllel; hozzáadás, szerkesztés, kép betöltése/eltávolítása, receptimport, leírásformázás, mentés, visszalépés.
- Étkezés szerkesztés/törlés/újrafelvétel, napváltás, megosztás és beérkező elemek.
- Statisztika összes időszakválasztóval, saját periódus, tápanyagválasztó, visszalépés; napi célok módosítása.
- Növelt Android betűméret, billentyűzet és safe-area, TalkBack fókusz és csökkentett mozgás.
- Health Connect/YAZIO és a meglévő Drive/backup kapcsolatok regressziós ellenőrzése; ne kerüljön személyes adat a screenshotokra.

## Release-kapu

A feature branch önmagában **nem TEST APK**. Először kódreview és tesztek, aztán **külön felhasználói jóváhagyás** szükséges a TEST-ágba integráláshoz / TEST-buildhez. A PROD (`codex/android-app`) és a TEST (külön csomag, signing, Drive-gyökér) elkülönítése sérthetetlen. Az élesítés még egy külön döntés.

## Kapcsolódó tervek

- [Brand Guide](../docs/GRAPES_BRAND_GUIDE.md) (a külön dokumentációs PR-ben)
- [Food Design 2.0 / két ütem](../docs/GRAPES_FOOD_DESIGN_2_0.md) (a külön dokumentációs PR-ben)
- [Food áttekintés vizuális mintalap](../docs/GRAPES_FOOD_DESIGN_2_0_MA_REVIEW.html) (a külön dokumentációs PR-ben)

*Figyelem: a relatív dokumentációs hivatkozások addig nem érhetők el ezen a TEST feature ágon, amíg a dokumentációs PR nincs integrálva. A két feladatot ettől függetlenül külön kell review-zni.*
