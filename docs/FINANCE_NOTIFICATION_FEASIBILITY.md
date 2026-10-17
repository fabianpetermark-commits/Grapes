# B8.3 — Android banki és Wallet-értesítések: megvalósíthatóság

## Döntés
**Technikailag lehetséges, de a tényleges értesítésfigyelés még nincs bekapcsolva.** Az Android `NotificationListenerService` csak akkor olvashat más alkalmazások értesítéseiből, ha a felhasználó a rendszerbeállításokban kifejezetten hozzáférést ad. A banki alkalmazások és a Google Wallet értesítései nem stabil vagy teljes tranzakciós API-k: hiányozhat az összeg, a pénznem, a kereskedő, illetve a bevétel/kiadás iránya.

## Elkészült prototípus
A `src/finance-notification-parser.js` kizárólag átadott szöveget dolgoz fel; a `tests/finance-notification-parser.test.js` az egyértelmű EUR/HUF összegeket, kiadásokat, bevételeket és a bizonytalan adatok elutasítását ellenőrzi. **Nem** olvas értesítéseket a készülékről, és **nem** ment automatikusan pénzügyi tételt.

## Android implementáció elfogadási feltételei
1. Az értesítésfigyelés alapértelmezés szerint kikapcsolt; külön kapcsoló, tájékoztató és Android-rendszerengedély szükséges.
2. Kizárólag a felhasználó által engedélyezett konkrét alkalmazáscsomagok értesítései dolgozhatók fel. A teljes értesítéstartalom nem kerül szerverre, Drive-ra vagy naplófájlba.
3. A feldolgozás eredménye helyi, ideiglenes, szerkeszthető **tranzakciójavaslat**, nem könyvelési tétel. Külön jóváhagyás után kerülhet a naplóba.
4. Egyértelműen hiányos, maszkolt, többértelmű vagy hibás pénznemű értesítésből nem keletkezhet tétel.
5. Ismételt értesítés, blokkimport és kézi bevitel közötti duplikációvédelem; a felhasználó törölheti az összes javaslatot és az engedélyt.
6. A megoldás működése csak valós, önkéntesen megosztott és személyes adatoktól megtisztított mintákkal validálható. A Google Wallet értesítései nem garantálnak minden tranzakcióról értesítést.
7. Az engedélyezés és a tranzakció jóváhagyása két külön felhasználói művelet.

## Státusz
Megvalósíthatóság igazolt Android-architektúra alapján; parser és unit tesztek elkészültek. A natív listener, alkalmazás-engedélylista, javaslat-UI és készülékteszt még nyitott. A v22 kiadást nem érinti.
