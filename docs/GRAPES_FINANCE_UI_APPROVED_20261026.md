# Grapes Finance – jóváhagyott mobil UI (2026-10-26)

**Státusz:** felhasználó által elfogadott interaktív HTML/CSS/JS dizájn és működési követelmény. Nem Android/TEST/PROD implementáció. Mintaadatok.

## Alapstruktúra
- Brand Guide v1.2: egyetlen feliratmentes hatikonos felső kapszula, **Áttekintés / Tranzakciók / Megtakarítások / Előrejelzés / Importálás / Beállítások**; nézetenként pontosan egy látható címsor, nincs redundáns ikon a widgetfejlécek előtt, enyhe neon-cián peremfény.
- Áttekintés: havi egyenleg = bevétel mínusz **tényleges** kiadás, tervezett költségek ettől elkülönülnek; 6 havi grafikon, kategóriák, megtakarítás és legutóbbi tételek.
- Tranzakciók: hónap/típus/keresés, új kiadás/bevétel/tervezett tétel, törlés + visszavonás.
- Megtakarítások: egyéni célok, célösszeg/félretett összeg/progress, félretétel és kivét külön eseményként. Ne duplán könyvelődjön automatikus havi bevétel/kiadás.
- Előrejelzés: többhavi alapidőszakra épülő **becslés**, választott időtávval és jól látható bizonytalansággal; ne nevezzük garantált egyenlegnek.
- Importálás: CSV/Excel/XLSM felismerés, oszloptérképezés, előnézet, hibák/duplikátumok kiszűrése és **külön jóváhagyás** után alkalmazott tétel.
- Quick Action: **Kiadás / Bevétel / Félretétel** a kapszulában és elkülönülő **Importálás** főgomb. Pénzügy-adatok személyesek; a Home egyetlen megosztott Otthona nem jelent Finance-megosztást.

## Felhasználó által utoljára kért, kötelező ikonkorrekciók
- **Megtakarítások** felül **malacpersely**; a malac tetején **egy jól felismerhető kis pénzérme**. Ugyanez a piktogram a félretétel gyorsműveleténél is. Nem kör alakú céltábla.
- **Importálás** felül és a gyorsgombon **lefelé mutató nyíl**, tálcába érkezéssel (nem feltöltés/felfelé nyíl).
- **Beállítások**: az elfogadott Health felület **pontosan ugyanazon, szabályos 24×24-es SVG-pathja**, elnyújtás, skálázás és torzítás nélkül.
- A felhasználó 2026-10-26-án jóváhagyta a három ikon javítását, és végleges módosításként az érmét kérte a malac tetejére, majd: „Mehetünk tovább”.

## Elhatárolás
A jóváhagyott interaktív terv a chatben jelent meg. Az ellenőrizhető korábbi belső forrás a `design/references/candidates/finance.html`, az ikonok változata a #178-as Draft PR-ágra került. A teljes chat-demó megjelenésére és az éles Android implementációjára még külön paritás- és adatregressziós teszt kell. Nincs háttérbanki integráció és nincs kiadás. A másik háztartástaghoz tartozó Finance adat nem szivároghat.

**Következő modul:** Tools (E-book + QR Stúdió).
