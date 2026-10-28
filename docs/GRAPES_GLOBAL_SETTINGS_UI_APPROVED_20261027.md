# Grapes – központi Beállítások jóváhagyott UI/UX (2026-10-27)

**Állapot: APPROVED DESIGN / INTERAKTÍV TERV.** A felhasználó a teljes, gördíthető központi Beállítások dizájnon egyetlen korrekciót kért: az „Ellenőrizetlen” státuszszövegek helyett figyelmeztető háromszögben felkiáltójel legyen. A javított megoldásra: **„Tökéletes”**. Ezzel a központi beállítási képernyő vizuális iránya jóváhagyott; nem Android/TEST/PROD-implementáció.

## Felület
- A Grapes Brand Guide v1.2 szerinti **egyetlen hatikonos, feliratmentes felső gyökérsáv** (Kezdő, Home, Health, Tools, Pénzügy, Beállítások), a jóváhagyott Health-beli fogaskerék SVG-vel; nincs külön Vissza/Home-felsőgomb.
- Pontosan egy **Beállítások** nézetcím; sötét #090e14 háttér, #101821 kártyák, diszkrét neon-cián peremszakasz, egységes sorikonok.
- A **teljes beállításlista függőlegesen végiggörgethető**, **nincs zárt, fix magasságú belső telefon-/scrollkonténer**, amely megakadályozhatja az utolsó Adatkezelés blokk elérését. Az egyes beállítások teljes képernyőn vagy jól görgethető részletpanelben nyithatók. Mobilon 320/360/390/412 px nézetek tesztelendők.
- Profilkártya és szerkeszthető megjelenített név (meglévő Grapes-profilhoz kötve, nem azonosításmódosításként).
- **Fiók és Otthon:** Fiókom; Otthon kezelése, tagok és jogosultságok.
- **Adatkapcsolatok:** Google Drive; Health Connect; Samsung Health; YAZIO-import.
- **Biztonság és adatvédelem:** alkalmazászár/PIN; személyes és közös adatok láthatósága.
- **Megjelenés és értesítések:** kijelzőmód; fontos figyelmeztetések, növény- és bevásárlási értesítések.
- **Adatkezelés:** Mentés és exportálás; Az alkalmazásról.
- A modulok saját specifikus opciói a megfelelő modulban maradnak, a központi Beállítások összefogja a kereshető fontos kapcsolatokat.

## Kötelező utolsó ikonkorrekció (jóváhagyott)
- A **Google Drive, Health Connect és Samsung Health** sor jobb oldalán a hosszú **„Ellenőrizetlen” felirat helyett egyetlen egységes, jól felismerhető borostyánsárga, felkiáltójeles figyelmeztető háromszög** (`triangle-alert`, 24×24 SVG-rendszer szerint) jelenik meg.
- Az ikon `aria-label`/tooltip szövege pl. **„Kapcsolat állapota még nem ellenőrzött”**, így a képernyőolvasó és érintéssel megnyitott részletes állapot továbbra is elmagyarázza a helyzetet; az ikon nem puszta dekoráció.
- A háromszög **ellenőrzés hiányát, nem bizonyított kapcsolatvesztést, nem hibát** jelent. Amikor élő állapotlekérdezés megvalósul, az ikon jelentését az ellenőrzött állapotokhoz kell igazítani; **sosem találunk ki kapcsolódási állapotot**.
- A YAZIO-import sor nem kapcsolatállapot-jelző, ezért automatikusan nem kap ugyanilyen ikont.
- A felhasználó kérte, hogy a többi elem ne változzon.

## Minta és éles app elhatárolása
Az interaktív chat-bemutató kizárólag a kinézetet és demó-interakciót adja. PIN/Auth, Drive, Samsung Health/Health Connect, YAZIO, adatmentés/export/restore és jogosultság valós működése az eredeti, tesztelt Grapes-folyamatokhoz kötendő. Valódi felhasználói adatot, háztartást, tokent, PIN-t vagy háttérszinkront nem módosítottunk; nincs kiadási vagy merge-felhatalmazás.

## Következő fejlesztési kapu
Az eddig elfogadott UI-referenciák (Kezdő, Home, Health/Food, Finance, Tools, QR Stúdió, Outdoor stb.) összefésülése az egységes Android navigációval és az elfogadott grafikai szabályokkal; az E-book jelenleg **PROVISIONAL**, későbbi finomítás szükséges. Külön review/CI/fizikai telefonos teszt és felhasználói GO kell minden éles integráláshoz.
