# Grapes QR Stúdió – elfogadott interaktív UI/UX (2026-10-26)

**Státusz: APPROVED VISUAL / UX CONCEPT.** A „Grapes QR Stúdió – interaktív szerkesztő” című, a chatben bemutatott HTML/CSS/JS-tervre a felhasználó válasza: **„Hibátlan”**.

## Elfogadott dizájn és felépítés
- Grapes Brand Guide v1.2 sötét palettája, matt widgetek rövid finom cián-peremmel; **egyetlen nézetcím** a 6 egyenlő méretű, felirat nélküli ikon alatt.
- Felső ikonsor: **QR tartalom / QR színek / Haladó / Mentett projektek / Előnézet / Beállítások**; ugyanaz a szabályos, jóváhagyott Health-fogaskerék.
- A QR-kód előnézete a szerkesztési szakaszoknál látható, a színválasztás és tartalommódosítás szerint frissül. Lényeges a fehér csendes zóna, az éles négyzetes modulrajzolat és a **valódi kontrasztellenőrzés**; a kódot nem kell neonszínűre erőltetni.
- Tartalom: **Link / szabad Szöveg / Wi-Fi / Névjegy (vCard)**, link esetén opcionális **UTM forrás/médium/kampány**.
- Megjelenés: előtérszín, háttérszín, alapszínek visszaállítása; alacsony kontraszt esetén egyértelmű figyelmeztetés.
- Haladó: QR hibajavítási szint **L / M / Q / H**. Hosszú adatok esetén felhasználóbarát korlátjelzés, ne érvénytelen csendes levágás.
- Mentett QR-projektek: meglévő betöltése és szerkesztése, új projekt és név szerinti demómentés.
- Alsó Quick Action: **Új QR / Mentés / Másolás** egy kapszulában, jobb oldalt külön, hangsúlyos **PNG-export**.
- QR-adat típusának és aktív állapotának akadálymentes címkézése; érinthető ikonok; visszalépési gesztus és bezárás.

## Integrációs óvatosság
A chatprototípus önálló, lokális QR-kódoló logikát mutatott be korlátozott 4/5-ös QR-verzióval; ez **nem a Grapes alkalmazás generátorának helyettesítője**, és a felhasználó „Hibátlan” jóváhagyása **vizuális / UX jóváhagyás**, nem teljes körű dekóderes, hibajavítási vagy minden tartalomhosszra kiterjedő technikai tanúsítás. A valódi Grapesnek továbbra is a meglévő `src/qr-studio.js` QRCode-implementációját, `src/qr-data.js` UTM/vCard/Wi-Fi/kontrasztlogikáját, mentését és Drive-kompatibilitását kell használnia.

A `design/references/candidates/qr.html` régebbi, véletlen mintát ábrázoló jelölt, **nem** az elfogadott interaktív chat-verzió teljes másolata, frissítendő a TEST-implementáció előtt. Sem merge, sem Android-kiadás, sem valódi adatváltoztatás nem történt a vizuális jóváhagyás miatt.
