# Grapes Android – egyetlen alkalmazás és multi-module Compose architektúra

**Verzió:** 1.0 – célarchitektúra  
**Dátum:** 2026-11-08  
**Státusz:** javasolt stratégiai és technikai döntés; implementáció előtt read-only audit és részletes terv szükséges  
**Hatókör:** Android termékstratégia, Gradle modulhatárok, Jetpack Compose, navigáció, platformintegráció és későbbi bővíthetőség.

> **Fontos:** ez a dokumentum célarchitektúrát rögzít, nem a jelenlegi kódbázis állapotának leírása. Nem jelent engedélyt újraírásra, modulátrendezésre, adatbázis-migrációra vagy kiadásra. A tényleges állapotot először read-only auditban kell felmérni.

## 1. Vezetői döntés

A Grapes elsődleges Android-terméke **egyetlen egységes alkalmazás** legyen, belül Gradle multi-module architektúrával.

A felhasználó egy Grapes alkalmazást telepít, egy fiókkal jelentkezik be, és egységes navigációból éri el a funkcionális modulokat. A fejlesztők ezzel szemben különálló, jól definiált felelősségű modulokban dolgoznak.

A döntés röviden:

- egy Android alkalmazás és egy elsődleges Google Play-adatlap;
- egy közös Auth/Session-kezelés;
- közös helyi adatbázis-infrastruktúra és szinkronizációs motor;
- közös Design System és navigációs keret;
- külön feature modulok, saját domainlogikával és publikus szerződésekkel;
- közös Grapes Core és Family capability;
- nincs induláskor külön Food, Garage, Vault vagy más modul-app.

Ez a megközelítés csökkenti a kiadási, verziózási, CI/CD-, tesztelési és támogatási terheket, miközben a moduláris kódszerkezet fenntartja a belső elkülönítést.

## 2. Miért egyetlen alkalmazás?

A Grapes moduljai nem teljesen független termékek. Több munkafolyamatban közös felhasználói, háztartási és adatkapcsolatok jelennek meg:

- Food és Home: étkezéstervezés, készlet és bevásárlólista;
- Food és Health: étkezési és aktivitási összefüggések, explicit adat-hozzáféréssel;
- Home és Garage: háztartási feladatok és járműfenntartás;
- Vault: dokumentumok, amelyekhez más modulok hivatkozhatnak, de csak engedélyezett módon;
- Family: háztartási tagság, megosztás és jogosultságok több modulon át.

Külön appok esetén több belépési pontot, alkalmazás-életciklust, Play-adatlapot, release-folyamatot, analitikát, hibakezelést és appok közötti navigációt kellene fenntartani. Ez a jelenlegi fejlesztési kapacitás mellett aránytalan komplexitás.

Az egy alkalmazás nem jelenti azt, hogy minden funkció egyetlen képernyőre vagy egyetlen kódmodulba kerül. A felhasználói egyszerűség és a belső modularitás egymást erősítő célok.

## 3. Mikor vizsgálható újra a több alkalmazás?

A külön appok lehetőségét nem kell örökre kizárni, de nem szabad előre megépíteni a hozzá szükséges többletkomplexitást.

Új döntés csak valós bizonyíték alapján indokolt, például ha:

1. egy modul önálló felhasználói piacot és fenntartható üzleti modellt szerez;
2. a modul célcsoportja és felhasználási módja érdemben eltér a Grapes fő közönségétől;
3. jogi, adatvédelmi, biztonsági vagy üzemeltetési követelmény valódi izolációt tesz szükségessé;
4. az önálló kiadás mérhető felhasználói vagy üzleti előnyt ad.

A moduláris kódstruktúra megkönnyítheti a későbbi kiemelést, de a külön alkalmazássá alakítás nem automatikus és nem garantáltan olcsó. Ehhez külön alkalmazás-összeállítás, függőségkezelés, konfiguráció, tesztelés, kiadási és támogatási folyamat szükséges.

## 4. Javasolt Gradle projektstruktúra

Az alábbi célstruktúra kiindulópont, nem azonnali refaktorálási utasítás:

```text
Grapes/
├── app/                         # Egyetlen Android alkalmazás, APK/AAB
├── core/
│   ├── common/                  # Közös, platformközeli segédtípusok
│   ├── auth/                    # Auth és Session integráció
│   ├── database/                # Room, migrációk, DB infrastruktúra
│   ├── network/                 # API kliens és hálózati alapok
│   ├── sync/                    # Szinkronizációs motor és queue
│   ├── family/                  # Household, sharing és permission API-k
│   ├── security/                # Titkosítási és biztonsági absztrakciók
│   ├── navigation/              # Navigációs szerződések és közös segédek
│   └── designsystem/            # Compose komponensek és design tokenek
├── feature/
│   ├── home/
│   ├── food/
│   ├── health/
│   ├── finance/
│   ├── garage/
│   ├── vault/
│   ├── tools/
│   └── ebook/
└── build-logic/                 # Opcionális, csak indokolt build-konvenciók
```

A modulokat nem kell egyszerre létrehozni. Csak akkor érdemes külön Gradle-modult bevezetni, ha világos felelőssége, önálló tesztelési értéke vagy tényleges újrafelhasználási igénye van.

### 4.1 Modulfüggőségi szabályok

- Az `:app` összefogja a szükséges feature és core modulokat.
- A feature modulok nem függhetnek egymás implementációjától.
- A feature modulok a szükséges core API-kra támaszkodhatnak.
- A közös infrastruktúra nem válhat minden domain üzleti logikájának gyűjtőhelyévé.
- Egy feature nem írhatja közvetlenül egy másik feature belső adatbázistábláit vagy repository-it.
- Keresztmodul integráció publikus API-n, alkalmazási szerződésen vagy eseményen keresztül történjen.
- A függőségi irányokat lehetőség szerint build- és architektúratesztek védjék.

A `:core:database` közös infrastruktúra lehet, de nem jelenti azt, hogy minden feature egy közös, korlátlan adat-hozzáférési felületen keresztül dolgozzon. A domainadat és üzleti szabály tulajdonosa az adott feature maradjon.

## 5. Közös platformképességek

Az egy alkalmazás közös képességeket használ:

- Auth/Session: egy hitelesített felhasználói munkamenet;
- Room: közös adatbázis-infrastruktúra, modulonkénti domain-tulajdonlással;
- Sync: egységes hálózati és szinkronizációs életciklus;
- Family: háztartási kontextus, tagság, explicit megosztás és jogosultsági szerződések;
- Design System: közös Compose komponensek és tokenek;
- Navigation: közös alkalmazásszintű navigációs keret;
- Notifications: közös értesítési infrastruktúra, domainenkénti eseményekkel.

A közös infrastruktúra nem jelent korlátlan adatmegosztást. A Health, Finance és Vault személyes adatai alapértelmezetten privátak; a Household-adminisztrátori szerep nem ad automatikus hozzáférést.

## 6. Navigációs architektúra – Type-Safe Navigation

A többmodulos Jetpack Compose navigációban a fő szabály: a feature modulok ne ismerjék egymás belső képernyőit vagy osztályait.

A javasolt minta a Navigation Compose 2.8+ típusbiztos, Kotlin Serialization-alapú útvonalkezelése, feature-szintű NavGraph regisztrációval és lambda callbackekkel.

### 6.1 Felelősségi felosztás

- `:core:navigation`: közös navigációs segédek, interfészek és konvenciók. Ne váljon az összes feature belső route-jának központi gyűjtőhelyévé.
- Feature modul: saját belépési útvonal és belső route-ok, saját NavGraph-bővítmény, UI callbackek.
- `:app`: az egyetlen NavHost és a teljes alkalmazás navigációjának összeszerelése; itt kapcsolódnak össze a feature callbackek.
- Központi alkalmazás-UI: a jóváhagyott Grapes navigációs mintát jeleníti meg.

### 6.2 Route-ok elhelyezése

A feature saját képernyőihez tartozó route maradjon a feature modulban. Például a `RecipeDetail(recipeId)` a Food modul része; a `VehicleDetail(vehicleId)` a Garage modul része.

A központi navigáció csak a feature-ek publikus belépési pontjait ismerje. Ezek lehetnek az adott feature által exportált, szerializálható route-típusok vagy stabil feature-destination szerződések.

Fontos Kotlin-korlát: egy másik Gradle-modulban definiált `sealed` típus közvetlen leszármazottait nem lehet tetszőlegesen szétszórni más modulokba. Ezért ne tervezzünk egyetlen, a `:core:navigation` modulban lévő sealed route-hierarchiát, amelyet minden feature modul közvetlenül bővíteni próbál. A route-típusok elhelyezését a Kotlin sealed-típus szabályaihoz és a Navigation Compose verziójához kell igazítani.

### 6.3 Feature NavGraph bővítmény és callbackek

A feature exportálhat például ilyen szerződést:

```kotlin
fun NavGraphBuilder.foodGraph(
    onNavigateToRecipe: (String) -> Unit,
    onOpenGarage: () -> Unit
) {
    composable<FoodRoute> {
        FoodScreen(
            onRecipeClick = onNavigateToRecipe,
            onOpenGarageClick = onOpenGarage
        )
    }

    composable<RecipeDetailRoute> { entry ->
        val route = entry.toRoute<RecipeDetailRoute>()
        RecipeDetailScreen(recipeId = route.recipeId)
    }
}
```

A példa szemléltető; a konkrét route-típusokat, importokat és API-kat a projektben használt Navigation Compose verzió szerint kell kialakítani.

A feature nem kapja meg a `NavController` példányt. Helyette csak a számára szükséges navigációs callbackeket kapja meg. Ez:
- megőrzi a modulok közötti laza csatolást;
- megkönnyíti a Compose Preview-kat;
- egyszerűsíti a képernyők unit- és UI-tesztelését;
- lehetővé teszi, hogy az `:app` egyetlen helyen határozza meg a keresztmodul útvonalakat.

### 6.4 App-szintű összeszerelés

Az `:app` NavHost-ja regisztrálja a feature gráfokat, és a callbackeket a megfelelő célokra irányítja. Például a Food képernyő `onOpenGarage` eseményét az app a Garage publikus belépési route-jára navigálja.

A feature modulok nem importálhatják egymás route-jait, képernyőit vagy ViewModeljeit.

### 6.5 Globális navigációs UI

A navigációs technológia nem határozza meg a Grapes vizuális navigációját. A már elfogadott Grapes UX az irányadó:

- ikon alapú felső modulsáv;
- legfeljebb hat, jól felismerhető fő ikon a jóváhagyott elrendezés szerint;
- nincs állandó szöveges felirat az ikonok alatt;
- nincs régi alsó navigációs sáv;
- a gyakran használt Home elérhető és könnyen megtalálható;
- a modulok belső képernyői nem építenek saját, egymástól eltérő globális navigációt;
- a Settings és a visszalépés viselkedése konzisztens.

A navigációs sáv aktív állapota a back stack alapján frissül. A top-level navigáció őrizheti az egyes fő modulok állapotát, de a konkrét back stack- és state-restoration szabályokat tesztelni kell.

### 6.6 Deep linkek

A deep linkek az alkalmazás publikus belépési pontjaira és olyan konkrét tartalmakra mutathatnak, amelyek megnyitása biztonságos.

- A deep link paraméterei nem tekinthetők hitelesítési vagy jogosultsági bizonyítéknak.
- A célképernyő betöltésekor a domain és a szerver ellenőrizze a hozzáférést.
- Bejelentkezés hiányában a felhasználó megfelelő hitelesítési folyamatra irányítható, majd visszatérhet a célhoz.
- Érvénytelen, törölt vagy már nem megosztott tartalom esetén érthető hibaállapot szükséges.
- Érzékeny adatok vagy Vault-tartalmak ne kerüljenek nyílt URL-paraméterbe.

## 7. Compose Preview és tesztelhetőség

A képernyőkomponensek ne függjenek közvetlenül a `NavController`-től. A navigációs eseményeket callbackként kapják.

Ez lehetővé teszi:
- Preview futtatását üres vagy teszt callbackekkel;
- ViewModel nélküli, statikus UI-állapotok megjelenítését;
- UI-tesztekben a navigációs események ellenőrzését;
- a feature UI tesztelését a teljes alkalmazás felépítése nélkül.

A callback-alapú navigáció önmagában nem garantál jó tesztelhetőséget: a képernyő állapotát, adatforrásait és üzleti logikáját is megfelelően el kell választani a UI-tól.

## 8. Design System és platformkonzisztencia

A `:core:designsystem` tartalmazza a közös Compose témát, szín- és tipográfiai tokeneket, térközrendszert, alapkomponenseket, ikon- és állapotmintákat.

A modulok használhatnak szemantikus, modulspecifikus akcentusokat, de nem definiálhatnak egymástól független gombokat, kártyákat, mezőket vagy navigációs rendszereket indokolatlanul.

A meglévő Grapes vizuális irány – sötét felület, visszafogott neon-cyan edge/glow, letisztult ikonközpontú navigáció – maradjon az alap.

## 9. Külön alkalmazásként történő későbbi kiadhatóság

A későbbi kiemelhetőség érdekében:
- a feature saját domainlogikával és publikus API-val rendelkezzen;
- ne függjön az `:app` belső osztályaitól;
- ne hivatkozzon más feature privát implementációjára;
- a szükséges core képességeket deklarált interfészeken keresztül használja;
- a külső integrációkat és konfigurációkat injektálható szerződések mögé helyezze;
- a navigációs belépési pontot a befogadó alkalmazás regisztrálhassa.

Ez csökkenti a későbbi leválasztás költségét, de nem teszi automatikussá. Külön alkalmazás csak önálló termékdöntés után készülhet.

## 10. Bevezetési stratégia és védőkorlátok

### 0. fázis – Read-only Android audit

- jelenlegi Android repository és Gradle modulok feltérképezése;
- Compose és Navigation verziók ellenőrzése;
- jelenlegi Activity, NavHost és route-struktúra felmérése;
- Auth/Session, Room, Sync és DI működés feltérképezése;
- meglévő UI-, unit-, integrációs és instrumentációs tesztek listázása;
- webes és Android domainlogika közös, illetve eltérő részeinek feltérképezése;
- működő funkciók és regressziós kockázatok rögzítése.

Ebben a fázisban nincs refaktorálás vagy migráció.

### 1. fázis – Modulhatárok és szerződések

- Gradle függőségi gráf véglegesítése;
- feature API-k és belső implementációk szétválasztása;
- route- és navigációs szerződések;
- közös Design System és platformkomponensek;
- domainadatok tulajdonosi szabályai;
- tesztelési és architektúra-ellenőrzési szabályok.

### 2. fázis – Fokozatos átalakítás

Csak az audit alapján szükséges modulhatárokat kell bevezetni. Egy lépés egyszerre egy körülhatárolt területet érintsen. Minden lépés után build, célzott tesztek és regressziós ellenőrzés szükséges.

### 3. fázis – Modulonkénti integráció és validáció

A feature modulok egyenként kapcsolódjanak az egységes navigációhoz, Design Systemhez, Auth/Session- és Sync-infrastruktúrához. A működő Home és más elfogadott funkciók ne sérüljenek.

### Kiadási kapuk

- külön feature branch és PR;
- TEST és PROD elkülönítése;
- meglévő működő kód védelme;
- adatbázis-migráció csak külön tervvel és teszttel;
- PROD-módosítás csak explicit jóváhagyással;
- nincs automatikus merge vagy kiadás;
- minden elfogadott UI- és designváltozás ellenőrizhető preview-val és verziózott forrással rendelkezzen.

## 11. Nyitott technikai döntések

Az audit és a prototípus során kell lezárni:

1. A jelenlegi Android-kódbázis milyen mértékben alkalmas fokozatos multi-module kialakításra?
2. Mely core modulok léteznek már, és melyek csak logikai felelősségek?
3. A Room adatbázis hogyan biztosít modulonkénti domain-tulajdonlást?
4. Mely DI-megoldás és build-konvenció illeszkedik a jelenlegi projekthez?
5. A Navigation Compose pontos verziója és a route-szerződések elhelyezése.
6. A deep linkek, auth-visszatérés és back stack végleges viselkedése.
7. A központi felső modulsáv pontos megjelenése és state-restoration szabályai.
8. A webes Grapes mely üzleti szerződéseket osztja meg az Android alkalmazással.

## 12. Döntési összefoglaló

**Termékstratégia:** egyetlen Grapes Android alkalmazás.

**Kódarchitektúra:** Gradle multi-module, feature- és core-modulokkal.

**UI:** Jetpack Compose, egységes Grapes Design System.

**Navigáció:** Type-Safe Navigation, feature-szintű NavGraph regisztrációval, callback-alapú keresztmodul navigációval és app-szintű NavHost-tal.

**Adat és munkamenet:** közös infrastruktúra, de domainenkénti adatgazdákkal és explicit jogosultságokkal.

**Későbbi bővítés:** külön app csak bizonyított üzleti vagy technikai indok alapján, nem előzetes célként.

**Bevezetés:** read-only audit, majd kis lépésekben történő, TEST-first átalakítás. A célarchitektúra nem indokolhat működő funkciók öncélú újraírását.
