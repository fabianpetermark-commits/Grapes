# Grapes / Food / Étrendtervező – elfogadott családi UX (2026-10-26)

**Státusz: jóváhagyott interaktív HTML/CSS/JS dizájn + folyamatszerződés.** Nem valós Android/TEST/PROD megvalósítás; nincs éles adatmentés vagy kiadás.

A felhasználó a 2026-10-26-i chatben bemutatott **„Grapes – családi Étrendtervező”** prototípusra azt válaszolta: **„Szerintem tökéletes! Mehetünk tovább”**.

## Elfogadott működés
- **Egyetlen aktív Otthon** közös családi heti étkezésterve, a Home-nál jóváhagyott egyetlen háztartásadatmodellhez kötve. Nincs külön „saját vs közös” kapcsoló/adattár, a családtagok ugyanazt a heti tervet látják az Otthon-jogosultságuk szerint.
- Hétfőtől vasárnapig **egy sorban hét nap**, naponta Reggeli/Ebéd/Uzsonna/Vacsora, mindegyik opcionális; teljesen üres napok és hetek megengedettek. Előző/következő hét, nap kiválasztása és napi tervezett étkezések száma.
- Egy nap teljes tervezett étkezéseit azonnal megmutató rövid lista, közvetlen `+`/szerkesztés/törlés. Recept kiválasztása a meglévő Receptek könyvtárból vagy szabad ételmegnevezés.
- **Személyenként eltérő adagok**; a prototípusban `Te` és `Családtag`, az éles appban a tényleges Otthon-tagokhoz kötve, saját egységekkel, célokkal, hozzáféréssel és egyéni tápértékekkel. Napi összesítés a kiválasztott napra személyenként.
- A hét egészének **összevont bevásárlási javaslata** az összes személy összes adagjából, egységtudatos mennyiségekkel. Kiválasztott (vagy teljes heti) lista csak **felhasználói megerősítéssel** kerüljön a Home közös bevásárlólistájára; sem vásárlást, sem készletbe vételezést nem végez automatikusan. Meglévő készlet levonása csak tényleges megbízható, azonos egységű és azonosított készlettel, külön jóváhagyott szabály alapján történhet. Kettős felvétel, párhuzamos módosítás, fiók-/hétváltás elleni védelem szükséges.
- **Tervezés ≠ tényleges étkezés**: a Food tényleges fogyasztásnaplója csak külön, explicit elfogyasztás és jóváhagyás után módosulhat. Ételt tervezni, ételt ténylegesen naplózni és bevásárlólistára tenni három külön művelet.
- Egységes Brand Guide v1.2 sötét/neon, feliratmentes hatikonos felső Health-nav, **egy** `Étrendtervező` főcím, kompakt információs widgetek, alsó Health Quick Action.
- A chatprototípus minta `Te`/`Családtag` és fiktív recepteket, kalóriákat tartalmazott; valódi Family/Recipe/Food/backend/szinkron integráció még nincs.

## Következő ellenőrzés
A Health / Food / Víz / Receptek / Statisztika / Étrendtervező jóváhagyott képernyői után a **Finance / Pénzügy** következik a referencia `design/references/candidates/finance.html` öt belső nézetével: Áttekintés / Tranzakciók / Megtakarítások / Előrejelzés / Importálás, plusz közös hatodik Beállítások.
