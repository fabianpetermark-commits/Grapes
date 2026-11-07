# Grapes Home – háztartási és családi központ

**Státusz:** korábbi termékdöntésekből összeállított koncepció-összefoglaló. A jelenlegi implementációs állapotot külön kell ellenőrizni.

## 1. Cél

A Home a Grapes családi/háztartási központja: egy közös háztartás tagjai megoszthatják a mindennapi működéshez szükséges adatokat és feladatokat, miközben a személyes adatok és modulok privátak maradnak.

A modell alapja egyetlen közös háztartás, amelyhez tagok csatlakoznak. Kerülendő a párhuzamos „saját otthon” és „megosztott otthon” felület, ha ugyanazt a háztartást duplikálná.

## 2. Háztartás és tagság

Tervezett képességek:
- Háztartás létrehozása.
- Tagok meghívása és csatlakoztatása.
- Tagsági szerepek és jogosultságok.
- Meghívás elfogadása/visszavonása.
- Tag eltávolítása és hozzáférés visszavonása.
- A háztartási adatok tulajdonosi és megosztási szabályainak egyértelmű kezelése.

A háztartás tagsága önmagában nem adjon hozzáférést minden személyes Food, Health vagy Finance adathoz.

## 3. Közös bevásárlólista

- Több tag által szerkeszthető közös lista.
- Elem hozzáadása, módosítása, kipipálása és törlése.
- Kategóriák és mennyiségek.
- Szinkronizálás több eszköz között.
- Ütközések és párhuzamos módosítások kezelése.
- A lista összekapcsolható a készletkezeléssel és a heti étkezéstervezéssel.

## 4. Háztartási készlet

- Otthon található termékek és alapanyagok nyilvántartása.
- Mennyiség és mértékegység, ha ismert.
- Termékkategóriák használhatók, de ne legyen szükségtelen tárolásihely-kategória-rendszer.
- A bizonytalan mennyiséget a rendszer ne kezelje biztos hiányként.
- A felhasználó által elhalasztott javaslat („most nem”) tűnjön el a javaslatok közül.
- A készlet változásai kapcsolódhatnak a bevásárlólistához és a tervezett étkezésekhez.

## 5. Automatikus bevásárlási javaslatok

- A rendszer a készlet és a tervezett étkezések alapján javasolhat beszerzést.
- Bizonytalan vagy hiányzó mennyiségből ne következtessen automatikusan biztos hiányra.
- A javaslat legyen elfogadható, módosítható, elhalasztható vagy elutasítható.
- A „nem most” művelet ne törölje a készletadatot; csak a javaslatot kezelje.
- Az automatikus javaslat ne adjon hozzá észrevétlenül tételeket a közös listához.

## 6. Kapcsolat más modulokkal

### Food és étkezéstervező
- A heti családi menü közös lehet.
- A családtagok adagjai és tápanyagadatai személyenként különbözhetnek.
- Nem szükséges minden étkezést előre megtervezni.
- A tervezett étkezés nem kerülhet automatikusan elfogyasztott ételként a naplóba.
- A tervezett ételek hozzávalói összesíthetők a közös bevásárlólistához.

### Finance
- A háztartás közös pénzügyi feladatai és dokumentumai csak explicit megosztás esetén legyenek láthatók.
- Személyes pénzügyi adatok alapértelmezetten privátak.
- A Home és Finance közötti kapcsolatot külön üzleti szabályokkal kell meghatározni; a háztartási tagság nem jelent automatikus pénzügyi hozzáférést.

### Health
- Egészségügyi adatok személyesek és alapértelmezetten privátak.
- Egészségügyi dokumentum vagy adat csak kifejezett, visszavonható megosztással válhat elérhetővé más családtagnak.
- Gyermekek vagy gondviseltek adatkezeléséhez külön szerep- és hozzájárulási szabályok szükségesek.

### Növények / Outdoor
- A háztartás közös növényei és gondozási feladatai megoszthatók.
- A növényekhez tartozó teendők és emlékeztetők a Home feladatnézetéhez kapcsolódhatnak.

## 7. Jogosultsági alapelvek

- A háztartási tagság és az egyes modulok adat-hozzáférése külön jogosultsági réteg.
- Alapértelmezett privát hozzáférés a Health és Finance adatokhoz.
- A megosztás legyen konkrét, átlátható és visszavonható.
- A jogosultságot a szerveroldalnak is ellenőriznie kell, nem elegendő a kliensoldali UI-elrejtés.
- A hozzáférés-visszavonás a korábbi sessionökre és megosztott erőforrásokra is terjedjen ki.

## 8. Korábbi elfogadott használati tesztforgatókönyv

A korábbi Home-validáció alapvető útvonala:
1. Alkalmazás telepítése és bejelentkezés.
2. Háztartás létrehozása.
3. Közös bevásárlólista és készlet használata.
4. Második családtag csatlakoztatása.
5. Ellenőrizni, hogy mindkét tag a megfelelő közös adatokat látja és módosítja.
6. Ellenőrizni, hogy a privát adatok nem válnak automatikusan láthatóvá.

Ezt a forgatókönyvet a Home későbbi fejlesztéseinél regressziós tesztként érdemes megőrizni.

## 9. Nyitott kérdések

- Háztartás létrehozásának és tulajdonosváltásának szabályai.
- Szerepek részletes jogosultságmátrixa.
- Gyermekprofilok és gondviselői jogosultságok.
- Offline mód és konfliktuskezelés.
- Finance/Home tranzakciós és dokumentumkapcsolatok.
- Háztartás megszüntetése, tag kilépése és adatexport.
