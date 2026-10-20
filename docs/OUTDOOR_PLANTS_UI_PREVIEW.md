# Grapes Outdoor — Növényeim és növényadatlap (UI előnézet)

Állapot: kizárólag mintafelület, **nincs felhasználói adatmentés**, katalógus-API, időjárás-kérés, háttérfeladat vagy értesítés.

## Jóváhagyott képernyőirány
- Outdoor főképernyő: az időjárás integrált információ a fejléc alatt, **nem** külön navigációs kártya. Fagy / hőség / eső: jelenleg kategóriamegjelölés, nem valós figyelmeztetés.
- Két navigációs cél: **Növényeim** és **Növénykatalógus**. Az alsó **Aktuális teendők** dinamikus panel majd a növényállapotból, évszakból, időjárásból és gondozási naplóból képződik.
- Növényeim: egy fajnak több külön példánya lehet, saját azonosítóval, saját hellyel, ültetési móddal, fotóval, állapottal és gondozási naplóval.
- Kártyák → egyedi növényadatlap, fülek: **Áttekintés / Gondozás / Napló / Képek**. Android visszalépés: adatlap → Növényeim → Outdoor → főmenü.
- Grapes Android vizuális tokenek, elsődleges cyan `#3BDCF2`, visszafogott fény, mobilon 320–412 px és billentyűzetről is használható fülek.

## Jelenlegi illusztratív tartalom
Három statikus **minta**: Csili #1, Csili #2, Bazsalikom #1. Az azonos fajhoz tartozó két csili külön kártyaként és külön adatlappal nyílik. Helyszín és cserépérték kizárólag minta. Nem valós lokális növénylekérdezés.
- Ismeretlen adatok (fajta, öntözés, állapot, teleltetés stb.) nem kapnak kitalált értéket, illetve későbbi gondozási ajánlásnak nincsen tényként előadott eredménye.
- Nincs mentés / import / export / profil-összefésülés / Drive-beavatkozás.

## Következő elkülönített, még NEM elkészült fejlesztési szakasz
1. Valódi növénypéldány létrehozása/szerkesztése és biztonságos, profilhoz kötött adatmodell; megkülönböztetni a taxont és az egyedi példányt.
2. Saját képek kiválasztása/mentése és fotókhoz kötött idővonal; engedélyek és méretkorlát.
3. Egyedi gondozási események: öntözés, tápoldat, átültetés, megfigyelés, érés, szüret, teleltetés.
4. Jogtiszta kereshető növénykatalógus, külön jelzett hiányos/ellenőrizetlen mezőkkel.
5. Helyhez kötött időjárás és növényspecifikus teendőszabályok (bizonytalanság jelzése, értesítési zaj minimalizálása).

## Biztonsági és tesztelési elvárás
Az itt bemutatott mintaadatoknak nem szabad sem Food/Víz, sem Outdoor, sem Drive tárolóba írniuk. Az Outdoor UI-t külön branch/PR-ben teszteljük; TEST APK / éles kiadás csak külön felhasználói jóváhagyással.
