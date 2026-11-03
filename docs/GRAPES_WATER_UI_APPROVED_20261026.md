# Grapes Health / Víznapló – elfogadott interaktív dizájn (2026-10-26)

**Állapot: FELHASZNÁLÓ ÁLTAL JÓVÁHAGYOTT VIZUÁLIS / UX TERV.** A 2026-10-26-i, a chatben beágyazott `Grapes Víznapló – interaktív terv` felületre a felhasználó: „Szerintem perfekt, mehetünk tovább”.

## Végleges Víznapló UX
- Az egységes Health v1.2 **hat felirat nélküli, egyforma felső ikongombja**: Food, Víznapló, Receptek, Statisztika, Vonalkód, Beállítások. A Víznapló aktív, szabályos fogaskerékkel.
- Csupán egyszer jelenik meg a `Víznapló` főcím; ezen a fejlécen rövid előző/következő napvezérlés és dátum. Nincs kétszeres `Víznapló` cím vagy dekoratív ikon a kártyacímeknél.
- `Mai folyadék` (régebbi napnál `Napi folyadék`) widget: kerekített vízgyűrű, rögzített ml, célhoz viszonyított százalék, hiányzó mennyiség, kitöltött progress, **+150/+250/+500 ml egyérintéses** mennyiségek.
- `Heti áttekintés` közvetlenül látható 7 oszloppal; az oszlopra koppintás ténylegesen kiválasztja a megtekintett napot és ennek a bejegyzéseit. Nincs belső navigációs tab vagy újabb időszakválasztó ablak.
- `Bejegyzések` kártya időponttal és ml-lel, soronként valódi visszavonási művelettel.
- Külön **egyedi mennyiség és időpont felvétele**, gyorsműveletként a Health közös alsó `Fotó / Étel / Víz` + külön nagy vonalkódgomb mellett, nem új tab.
- `Beállítások` kizárólag **Napi célok / Adatkapcsolatok**. A vízcél ezek között szerkeszthető, de nem kerül egy harmadik „Víz beállítások” panel a Víznapló főoldalára.
- Üres nap, 100%-ot meghaladó fogyasztás, törlés, dátumváltás és offline/dupla írás kezelendő.

## Megvalósítás és kockázat
A chat-demó adatai kizárólag memóriában éltek; az elfogadás **nem bizonyít éles Water napi napló, Google Drive backup, Health Connect, Samsung Health, YAZIO, távoli profil és Android-telepítés működést**. A régi `design/references/candidates/water.html` csak egy korábbi terv, a felhasználó által jóváhagyott elrendezéshez frissíteni kell. A tényleges eseményazonosítók/undo, személyes profilhatár, Health Connect deduplikáció és teljes regresszió külön implementációs kapu. Nem készül ebben a döntésben PROD APK.

**Következő a sorban:** Receptek – áttekintő lista és az ötfüles Alapadatok / Összetevők / Elkészítés / Kép / Import szerkesztő.
