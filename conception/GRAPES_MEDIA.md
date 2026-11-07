# Grapes Media – otthoni médiaközpont és streaming

**Státusz:** termékkoncepció / előzetes terv. Nem implementációs ígéret.

## 1. Cél

A Grapes Media célja, hogy egy háztartás saját eszközein tárolt videóit – filmeket, sorozatokat és személyes felvételeket – egységes, kényelmes médiakönyvtárból lehessen böngészni és lejátszani Androidon, böngészőben, számítógépen és később televízión.

A rendszer ne követeljen meg feltétlenül külön NAS vásárlását. Egy meglévő, bekapcsolva hagyott asztali számítógép is lehet médiaszerver. Emellett támogatható lehet router USB-portjára kötött, hálózaton megosztott SSD/HDD, illetve dedikált NAS.

## 2. Felhasználási módok

### 2.1. Otthoni lejátszás

- A médiaszerver és a lejátszó eszköz ugyanazon a helyi hálózaton van.
- A felhasználó a Grapes webes vagy Android-felületén böngészi a médiakönyvtárat.
- A videó a helyi forrásról közvetlenül a lejátszó eszközre streamelhető.
- A házon belüli lejátszáshoz ne legyen szükség arra, hogy a teljes videóállomány felhőbe kerüljön.
- A szervernek nem kell internetkapcsolat a már indexelt helyi tartalom alapvető lejátszásához; metaadat-szolgáltatásokhoz és távoli eléréshez viszont szükség lehet rá.

### 2.2. Távoli lejátszás

- A felhasználó otthonról távol, mobilinterneten vagy más Wi-Fi-hálózaton keresztül is elérheti a saját médiakönyvtárát.
- Az otthoni médiaszervernek bekapcsolva és hálózaton elérhetőnek kell lennie.
- A távoli kapcsolat hitelesített és titkosított legyen.
- Ne legyen alapértelmezett megoldás a médiaszerver vagy SMB-megosztás közvetlen, védelem nélküli internetre publikálása.
- Vizsgálandó megoldások: VPN (például WireGuard/Tailscale), illetve biztonságos relay vagy kontrollált reverse-proxy architektúra.
- Figyelembe kell venni az otthoni feltöltési sávszélességet, adatforgalmat, CGNAT-ot és a szerver energiafogyasztását.

## 3. Források

Lehetséges médiatárolók és források:

- Windows vagy Linux asztali számítógép kijelölt mappái.
- Router USB-portjára csatlakoztatott SSD/HDD, ha a router ténylegesen megosztja a tárhelyet a hálózaton.
- NAS-eszközök, például Synology vagy QNAP.
- SMB/Samba hálózati megosztás.
- WebDAV, ha a forrás ezt támogatja.
- USB-s külső háttértár a médiaszervert futtató géphez csatlakoztatva.
- Későbbi bővítésként több forrás egyetlen logikai médiakönyvtárba rendezése.

**Korlát:** az USB-port önmagában nem garantál hálózati fájlmegosztást vagy médiaszerver-funkciót. A router firmware-ének és beállításainak támogatnia kell a megosztást. Az Android nem tud minden hálózati meghajtót automatikusan, univerzálisan felderíteni; a protokoll, a hitelesítés és a felhasználói engedélyezés szükséges.

## 4. Javasolt komponensek

### Grapes Media kliens
- Közös webes és Android-élmény.
- Könyvtárböngészés, keresés, szűrés és adatlapok.
- Lejátszás, folytatás, kedvencek és felhasználói előzmények.
- Felirat- és hangsávválasztás, ha a szerver/lejátszó támogatja.

### Grapes Media Server
Külön telepíthető, kezdetben Windowsra és később Linuxra szánt szolgáltatás.

Feladatai:
- Felhasználó által kijelölt könyvtárak olvasása.
- Médiatartalom indexelése és változások követése.
- Korlátozott, hitelesített API és stream végpontok biztosítása.
- Jogosultságok ellenőrzése.
- Közvetlen lejátszás kiszolgálása, és ahol szükséges, transzkódolás egy meglévő médiaszerver-motor segítségével.
- Szerverállapot és elérhetőség jelzése.

A szolgáltatás kizárólag az explicit módon engedélyezett mappákhoz férhet hozzá. Nem végezhet teljes lemezindexelést vagy tetszőleges fájlrendszer-hozzáférést.

### Külső médiaszerver-integráció
Első prototípushoz érdemes megvizsgálni a Jellyfin integrációját, ahelyett hogy a Grapes saját maga implementálná a teljes transzkódolási és médiaszerver-funkciókészletet.

Lehetséges szereposztás:
- Jellyfin vagy más kompatibilis motor: médiaindexelés, streamelés, transzkódolás.
- Grapes: egységes felhasználói felület, családi profilok, integráció és navigáció.

A közvetlen SMB/WebDAV lejátszás külön, egyszerűbb forrásintegrációként vizsgálható. A Jellyfin-integráció és a saját Grapes Media Server két alternatív architekturális út; a végleges döntés előtt prototípus és összehasonlítás szükséges.

## 5. Könyvtár és felhasználói élmény

Tervezett funkciók:
- Filmek, sorozatok, saját videók és családi felvételek külön nézete.
- Borító, cím, év, leírás és egyéb metaadatok.
- Legutóbb hozzáadott tartalmak.
- Folytatás ott, ahol a felhasználó abbahagyta.
- Kedvencek és keresés.
- Több tárhelyforrás közös könyvtárban.
- Több családtag saját megtekintési előzménye és folytatási pozíciója.
- Opcionális szülői hozzáférési korlátozások, külön megtervezett jogosultságokkal.

A metaadatok külső katalógusokból származhatnak. A forrás, licencfeltételek, adatvédelmi következmények és API-korlátok vizsgálandók. A Grapes ne töltsön le és ne terjesszen jogvédett videót; a felhasználó saját, jogszerűen hozzáférhető médiájának kezelésére készüljön.

## 6. Biztonság és adatvédelem

- A szerverhez csak hitelesített felhasználó férhessen hozzá.
- Minden médiatárhoz explicit hozzáférési engedély kell.
- A családi megosztás ne jelentsen automatikus hozzáférést minden személyes videóhoz.
- A szerver ne szolgáltasson ki tetszőleges fájlútvonalat.
- A külső hozzáférés titkosított legyen; a titkokat ne tárolja a webes kliensben.
- A helyi hálózati automatikus felfedezés csak opt-in módon, jól látható beállítással működjön.
- Legyen lehetőség szerverkapcsolat visszavonására, eszköz kijelentkeztetésére és hozzáférés megszüntetésére.

## 7. Javasolt MVP

1. Windowsos Grapes Media Server telepítő vagy egyszerű telepíthető szolgáltatás.
2. Felhasználó által kiválasztott egy vagy több videómappa.
3. Alapvető indexelés fájlnévvel, mérettel, időtartammal és bélyegképpel.
4. Helyi hálózati hozzáférés a Grapes webes felületéről.
5. Böngészőben és Androidon kompatibilis videók közvetlen lejátszása.
6. Alapvető feliratkezelés, ahol támogatott.
7. Egy felhasználó vagy családi háztartás jogosultságai.
8. Szerver állapotjelzés és egyértelmű hibaüzenetek.

Az MVP-ből maradjon ki:
- internet felőli automatikus portnyitás;
- saját, teljes transzkódoló motor;
- komplex több-NAS automatikus felderítés;
- felhőbe történő videófeltöltés;
- nyilvános, jelszó nélküli megosztólink.

## 8. Fejlesztési sorrend

- Megvalósíthatósági prototípus: Windows mappa → helyi API → webes lejátszás.
- Kompatibilitási teszt: MP4/H.264/AAC és néhány eltérő konténer/kodek.
- Felirat- és hangsávkezelés vizsgálata.
- Android kliens integráció.
- Jellyfin-integráció és saját szerver összehasonlítása.
- NAS/SMB/WebDAV források.
- Biztonságos távoli elérés.
- Családi profilok, jogosultságok és TV-kliens lehetősége.

## 9. Nyitott döntések

- Saját Media Server vagy Jellyfin-központú integráció.
- Milyen Windows-verziók és Linux-disztribúciók támogatottak.
- Milyen protokollok legyenek az első verzióban.
- A webes kliens és a szerver közötti párosítás módja.
- Metaadat-szolgáltató kiválasztása.
- Távoli hozzáférés VPN-en keresztül vagy relay szolgáltatással.
- Transzkódolás helye, hardveres gyorsítás és erőforrásigény.
