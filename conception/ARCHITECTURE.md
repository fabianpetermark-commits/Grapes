# Grapes – közös architektúra és modulkapcsolatok

**Státusz:** irányelvek és tervezési keret. Nem a jelenlegi rendszer teljes technikai specifikációja.

## 1. Alapelv: modulok, közös platform

A Grapes hosszabb távú célja több, egymással együttműködő modul:
- Home – háztartási központ.
- Food – étkezés, élelmiszer, receptek és tervezés.
- Health – egészségadatok és kapcsolódó dokumentumok.
- Finance – pénzügyi nyilvántartás és dokumentumok.
- Tools – általános segédeszközök.
- E-book – könyvtár és olvasási funkciók.
- Media – saját médiakönyvtár és streaming.
- Növények / Outdoor – növények és gondozás.

A modulok közös navigációt és fiók-/háztartási alapot használhatnak, de nem szükséges minden modult egyetlen telepíthető komponensbe kényszeríteni.

## 2. Adatvédelmi határok

- Health és Finance adatok alapértelmezetten személyesek.
- A háztartási tagság nem ad automatikus hozzáférést ezekhez.
- A megosztás célhoz és erőforráshoz kötött, visszavonható engedély legyen.
- A szerveroldali hozzáférés-ellenőrzés kötelező.
- Naplózni kell a kritikus jogosultság- és megosztásváltozásokat, a szükséges adatminimalizálás mellett.

## 3. Helyi és felhőszolgáltatások

A helyi eszköz és a felhő eltérő feladatokra alkalmas:
- Helyi eszköz: offline adatkezelés, telefonos egészségintegrációk, helyi médiaforrások.
- Otthoni szerver/NAS: nagy fájlok, médiaállományok, otthoni streaming.
- Felhő: fiók, családi tagság, szinkronizálás, jogosultságok és opcionális dokumentumtárolás.

A nagy videófájlok ne kerüljenek automatikusan a Supabase adatbázisába vagy a Grapes általános dokumentumtárába. A Media forrásfájlok maradjanak a felhasználó által választott tárolón; a Grapes a szükséges metaadatokat és hozzáférési kapcsolatokat kezelje.

## 4. Backend és hordozhatóság

A Supabase jelenlegi/tervezett szerepét a tényleges kód és környezet alapján kell ellenőrizni. Hosszabb távon:
- PostgreSQL-alapú relációs adatok és RLS használata indokolt lehet.
- A családi jogosultságok és megosztások szerveroldali ellenőrzést igényelnek.
- A fájltároló és médiaszerver ne legyen összekeverve az üzleti adatbázissal.
- Legyen dokumentált export, mentés és visszaállítás.
- A TEST és PROD backend, kulcsok, adatok és migrációk teljesen különüljenek el.
- Backend- vagy tárhelyszolgáltató-váltásnál az adatmodell és fájlmetaadatok legyenek hordozhatók.

## 5. Integrációs szerződések

Minden modulkapcsolatnál dokumentálni kell:
- ki az adat tulajdonosa;
- melyik modul hozza létre és módosítja az adatot;
- milyen adatot oszt meg más modulokkal;
- milyen jogosultság szükséges;
- mi történik offline módban;
- hogyan kezelendő a törlés, visszavonás és szinkronütközés.

## 6. Fejlesztési és kiadási fegyelem

- Minden új modul előtt read-only kódbázis- és architektúra-audit.
- Külön feature branch és PR.
- Kisebb, visszakövethető commitok.
- Build és releváns automatikus tesztek.
- Kritikus folyamatoknál valós eszközös QA.
- Nincs automatikus merge vagy élesítés explicit jóváhagyás nélkül.
- A sikeres build önmagában nem bizonyítja a funkcionális helyességet.
- Meglévő, elfogadott funkciók regressziós forgatókönyveit meg kell őrizni.

## 7. Dokumentumstátusz

A conception mappa terméktervezési alap. Ha egy koncepció implementációvá válik, külön műszaki specifikáció, adatmodell, biztonsági terv, tesztterv és elfogadási kritérium készüljön. Az implementáció állapotát ne ebből a mappából következtessük ki.
