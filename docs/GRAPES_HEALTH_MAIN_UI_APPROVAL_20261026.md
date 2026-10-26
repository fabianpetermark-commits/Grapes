# Grapes Health – jóváhagyott főoldali UX finomítás (2026-10-26)

**Dizájn státusz:** a felhasználó az interaktív Health v1.2 főoldali áttekintőt **elfogadta az alábbi kötelező javításokkal**. Ez továbbra is **vizuális/UX döntés**, nem Android / TEST / PROD implementáció, kiadás vagy valódi adatszinkron.

## Elfogadott módosítások
1. Az egységes Grapes v1.2 **hatikonos felső kapszula** marad: Food / Víznapló / Receptek / Statisztika / Vonalkód / Beállítások. Pontos, körvonalas 22×22px / 20×20px ikonok, jó érintési cél.
2. A **Beállítások fogaskerék ikon a korábbi torzított / elnyújtott SVG helyett szabályos, középre illesztett, 24×24 viewBox-al** készüljön. Nincs transform/scale/translate a glyph-en.
3. **Ne ismétlődjenek a modul- és képernyőnevek.** Oldalanként egyetlen főcím: `Food`, `Víznapló`, `Receptek`, `Statisztika`, `Vonalkód` vagy `Beállítások`. Az oldal alatti widgetek címei tartalomorientáltak (például `Mai összesítés`, `Mai folyadék`, `Étkezések`), **ne még egyszer a modul neve**. Fejlécek mellett nincs szükség újabb azonosító ikonra; a felső ikonrail elegendő. Kártyákban nincs redundáns `Statisztika` link, ha ugyanez a felső railben közvetlenül elérhető.
4. **Statisztika** különálló, részletes elemzési nézet marad, nem kell újabb összefoglaló választópanel vagy második képernyőcím. A napi Food/Víz értékek azonnal láthatók az adott nézetben.
5. **Beállítások tartalma kizárólag:** `Napi célok` és `Adatkapcsolatok`. A célok szerkeszthetők, adatkapcsolatok olvashatók/kezelhetők jogosultsággal, de a demó nem ígér valódi Health Connect/Samsung Health/YAZIO működést. Az egyéb ad hoc magyarázó szekciók, dummy gombok és ismételt `Beállítások` címek nem részei a jóváhagyott elrendezésnek.

## Megvalósítási kapuk
- Egységes Brand Guide: #090E14 / #101821 / #3BDCF2, csak rövid és halk neon él, nincs ikon vagy szöveg duplikáció.
- A korábban jóváhagyott Health widgetes dashboard érték- és gyorsművelet sűrűsége marad; Home-nál elfogadott `azonnali információ / minimális magyarázat` szemléletet kövesse.
- Régi `design/references/approved/health-minimal.html` és a belső `candidates/food.html`, `water.html`, `recipes.html` még tartalmazhatja a korábbi megnevezéseket/ikonokat; ezek **implementáció előtt összehangolandók**. Nem állítható késznek a kód vagy PROD.
- A meglévő Food/Water/Health Connect/YAZIO/Samsung Connect napló, szinkron, tulajdonosi elkülönítés és biztonsági szemantika nem sérülhet puszta UI átvezetés miatt.

**Következő sorrendi elem:** Food (Ételnapló) belső képernyő teljes átnézése.
