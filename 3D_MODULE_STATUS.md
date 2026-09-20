# 3D Studio – állapot és roadmap

> Frissítve: 2026-09-20  
> Aktuális alap: `main` / `9d9bc13`  
> Cél: egy fokozatosan felépített, használható 3D modellező modul. A print-prep funkciók tudatosan a végére maradnak.

## ✅ Elkészült

### Alap 3D környezet
- Three.js alapú 3D viewport
- Orbit kamera / navigáció
- TransformControls
- Elölnézet / hátulnézet / izometrikus nézet
- Fókusz kijelölt elemre
- Keretbe illesztés
- Összes objektum keretbe illesztése
- Drótváz mód
- Reszponzív Studio layout

### Alap primitívek
- Kocka
- Henger
- Gömb
- Kúp
- Gúla

### Transzformációk
- Mozgatás
- Forgatás
- Méretezés
- Numerikus X/Y/Z pozíció
- Numerikus forgatás
- Numerikus méretek
- W / E / R gyorsbillentyűk
- F = keretbe illesztés
- Nyilakkal mozgatás
- Page Up / Page Down függőleges mozgatás
- Shift = nagyobb mozgatási lépés

### Kijelölés
- Egy objektum kijelölése
- Több objektum kijelölése Ctrl/Cmd + kattintással
- Több kijelölt objektum közös transzformációja
- Csoporttudatos kijelölés
- Kijelölési állapot a réteglistában

### Csoportosítás
- Csoportosítás
- Szétbontás
- Közös mozgatás / forgatás / méretezés
- Csoportok megőrzése Undo/Redo során
- Csoportok duplikálása külön csoportként

### Igazítás és Snap
- X/Y/Z tengely szerinti igazítás
- Bal / közép / jobb jellegű tengelyigazítás
- Snap ki/be
- 1 / 5 / 10 / 25 mm snap méret
- Alapértelmezett snap: 5 mm

### History
- Undo
- Redo
- Legfeljebb 50 history állapot
- Transzformációk egy lépésként kerülnek historyba
- Csoportműveletek history-támogatása
- Boolean eredmények history-támogatása
- STL geometria history-támogatása

### Duplikálás
- Ctrl/Cmd + D
- Több kijelölt objektum duplikálása
- Ismételt duplikálásnál automatikus eltolás
- Csoportos objektumok külön csoportként másolódnak

### Build plate
- Virtuális nyomtatóasztal
- 180 / 220 / 256 / 300 / 320 / 400 mm-es méretek
- Objektum asztalra helyezése
- Objektum középre helyezése

### STL
- STL import
- STL export
- Importált modell réteglistás kezelése
- Háromszögszám megjelenítése
- Méretinformáció
- STL egység: mm
- Nyomtathatósági alapellenőrzések:
  - lelóg az asztalról
  - beleér az asztalba
  - lebeg az asztal felett
  - nyomtatható pozíció

### 3MF
- 3MF export
- Egyszerű 3MF import
- Több objektum kezelése
- Milliméter alapú modellkezelés
- Saját minimális ZIP/XML alapú 3MF implementáció

### Geometriai műveletek
- Kihúzás / Extrude – jelenleg kockán és hengeren
- Vágás / Cut – jelenleg kockán és hengeren, felső részből
- Mirror / Tükrözés X/Y/Z tengelyen
- Boolean:
  - Unió
  - Kivonás
  - Metszet
- Boolean műveletek valódi mesh CSG-alapon

### UX
- Kontextusmenü a 3D nézetben
- Fókusz / keretbe illesztés / duplikálás / csoport / szétbontás / törlés
- Objektumlista és kijelölési darabszám
- Inspector szekciók
- Billentyűparancs-hint
- Toast értesítések
- Mobil inspector / overlay támogatás

---

## 🚧 Hátralévő / tervezett

### 1. Pattern / Array
**Következő fejlesztési blokk.**
- Több példány létrehozása egy objektumból
- X / Y / Z irány
- Darabszám
- Példányok közötti távolság
- Több kijelölt objektum mintázása
- Csoportok kezelése
- Egyetlen Undo lépésként kezelni

### 2. Alakmódosítók
- Bevel / lekerekítés
- Chamfer / letörés jellegű művelet
- Primitive paraméterek további bővítése
- Robusztusabb geometria-frissítés

### 3. Sketch rendszer
**Nagyobb mérföldkő.**
- XY / XZ / YZ sík választása
- 2D sketch mód
- Vonal
- Téglalap
- Kör
- Alapvető szerkesztés
- Sketch lezárása
- Sketchből 3D geometria létrehozása

### 4. Sketch → Extrude
- Sketch profilból térbeli test
- Pozitív / negatív kihúzás
- Kihúzás mélysége
- Alapvető profilvalidáció

### 5. Haladó modellezés
- Többféle profilművelet
- Loft jellegű műveletek
- Sweep / pálya menti kihúzás
- További mesh műveletek
- Geometriai hibakezelés

### 6. Mesh szerkesztés
- Vertex / edge / face szintű kijelölés
- Face extrude
- Face inset
- Face offset
- Edge/face törlés
- Normálok kezelése
- Mesh javítás

> Ez már egy külön technikai szint, mert a jelenlegi Studio elsősorban mesh-alapú. A valódi CAD-szerű face-parametrikus működéshez komolyabb geometriai kernel / B-Rep irány lehet szükséges.

### 7. Modellinformáció és ellenőrzés
- Részletes bounding box
- Térfogat
- Felület
- Tömeganyag alapú számítás
- Objektumonkénti statisztikák
- Geometriai hibák részletesebb jelzése

### 8. Print Prep
**Tudatosan a végére.**
- Orientáció javaslatok
- Overhang elemzés
- Falvastagság ellenőrzés
- Support-előkészítés
- Layer preview
- Szeletelő-integráció
- G-code workflow

### 9. Későbbi kényelmi funkciók
- Mentett kameraállások
- Objektumnevek szerkesztése
- Objektum lock/hide
- Grid beállítások
- Mértékegység / precision beállítások
- Projekt mentés / betöltés
- Többféle export/import bővítése

---

## 🧭 Fejlesztési sorrend

1. **Pattern / Array**
2. **Bevel / Chamfer**
3. **Sketch alapok**
4. **Sketch → 3D**
5. **Haladó modellezési műveletek**
6. **Mesh / face szerkesztés**
7. **Részletes modell-ellenőrzés**
8. **Print Prep**
9. **Integrációk és kényelmi funkciók**

---

## ⚠️ Fontos technikai megjegyzések

- A Studio jelenlegi geometriai rendszere Three.js mesh-alapú.
- Az Extrude jelenlegi verziója nem általános CAD face-extrude: kocka és henger magasságát módosítja.
- A Cut jelenlegi verziója felső részből történő primitív-vágás.
- A Boolean műveletek valódi mesh CSG műveletek.
- A Mirror a geometriát tükrözi, nem negatív objektum-skálát használ.
- A Print Prep nincs még kész, és szándékosan nem előzzük meg vele a modellezési alapokat.
- Nagy STL-eknél a historyban tárolt geometria memóriaigénye később optimalizálható.

## 📌 Aktuális állapot

**3D Studio: modellezési alapok → működőképes, következő nagy blokk: Pattern / Array.**

A további fejlesztéseket ebből a fájlból kell folytatni, és minden nagyobb új funkció után frissíteni kell a kész / hátralévő listát.
