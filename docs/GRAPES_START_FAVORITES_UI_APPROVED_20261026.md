# Grapes Kezdő – jóváhagyott személyre szabható gyakori funkciók (2026-10-26)

**Állapot:** a chatben bemutatott önálló interaktív Kezdő UI/UX **APPROVED DESIGN**, a tényleges Android/TEST/PROD megvalósítás ettől még külön tesztelendő.

A felhasználó a „Grapes Kezdő – interaktív kedvencek és ajánlások” élő HTML/CSS/JS bemutatójára ezt válaszolta: **„Szerint még teljesen jó!”**

## Elfogadott nézet
- Az alkalmazás indulásakor a **Kezdő / Gyakran használt** saját kezdőoldal nyíljon meg, a Grapes Brand Guide v1.2 szerinti sötét/cián felülettel és hatikonos, feliratmentes **Kezdő / Home / Health / Tools / Pénzügy / Beállítások** felső navigációval. A Kezdő nem ugyanaz, mint a Home háztartásmodul.
- A nézet **nem modulválasztó menü**, hanem közvetlenül használható, tömör, élő kedvencwidgetek: pl. Home bevásárlás (készletet nem módosító megvett-jelölés), Food kalóriák és naplózás, víz, E-book olvasás folytatása, QR, Pénzügy stb.
- **Rögzített kedvencek** elöl, kézzel és kereshető összes elérhető funkcióból hozzáadhatók, eltávolíthatók és egymás közt rendezhetők. A felhasználó kézi sorrendjét automatikus algoritmus **soha nem írja felül**.
- **Automatikus ajánlások** külön, világosan jelölten, személyes használati gyakoriság alapján rangsorolva; csillaggal rögzíthetők, X-szel elrejthetők. Elrejtett elemek listázhatók és visszaállíthatók; elrejtés csak a Kezdő ajánlásból tünteti el a funkciót, maga a modul továbbra is elérhető.
- Tiszta üres állapot rögzített widgetek és ajánlások nélkül; első használatkor a hozzáadás világosan elérhető.
- Alsó **Quick Action** a saját Kezdő-kontextushoz: `Rendezés / Elrejtettek / Frissítés` a kapszulában, külön kiemelt `+` kedvenc-hozzáadás gomb. Az akciók közvetlenül végrehajthatók.
- Minden widgetben felhasználói interakciók vannak; érzékeny személyes Finance/Health adatok nem válnak a Home háztartásmegosztás által közössé.

## Technikai és adatbiztonsági határ
A chat prototípus **kitalált adatokat**, memóriabeli rögzítési és használati mutatókat használ; nem ment profilt, nem végez tényleges navigációt, Food/Health/Finance/Drive/Supabase műveletet. Az Android-megvalósításhoz a modulregiszter, a profilhoz kötött kezdőkonfiguráció, használatszámláló, jogosultság- és cacheizoláció, valamint valós widgetadat-források bekötése szükséges. A meglévő `design/references/candidates/main-shell-tools.html` forrás a korábbi jelölt; a pontosan elfogadott chat UI-t még át kell vezetni a verziózott HTML referenciafájlba. Nem jelent automatikus merge-et vagy APK-kiadást.

**Következő részletes review:** Outdoor / Növények az elfogadott koncepció szerint: Növényeim, Növénykatalógus, integrált helyi időjárás-hatások és növényspecifikus aktuális teendők, locsolási/teleltetési/érésnapló.
