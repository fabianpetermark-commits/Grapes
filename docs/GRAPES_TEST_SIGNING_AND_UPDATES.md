# Grapes TEST — állandó aláírás és önálló frissítések

**Állapot: előkészítve, de NEM publikált TEST-kiadás.** Nem érinti a `main`, `develop`, `codex/android-app` ágakat vagy az éles Android APK aláírását.

## Mi változik?

Az eddigi `grapes-test-preview-apk` GitHub Actions artifactok a futtatók saját debug-kulcsával készültek. Az Android csak az **azonos csomagnévvel ÉS azonos tanúsítvánnyal** aláírt új verziót engedi egy meglévő appra telepíteni.

Az új, külön TEST kulcs mostantól hosszú távú aláírásra alkalmas, és csak a `hu.grapes.healthconnect.test` csomaghoz használjuk. A stabil Grapes csomagneve `hu.grapes.healthconnect`; sem a stabil APK, sem az éles `release-android.yml` workflow nem módosul.

A TEST-aláíró **nyilvános** tanúsítványlenyomatai (ellenőrzéshez; nem a privát kulcs):
- SHA-256: `CC:9D:C9:97:FA:4B:FF:38:45:88:4A:FD:2F:01:1E:FE:93:9C:02:80:6F:91:39:3A:1D:DB:04:55:B6:A2:FF:33`
- SHA-1: `12:8E:E9:DE:3D:44:25:87:13:E4:94:78:44:B0:53:58:4D:D4:FD:C8`

## 1. A privát TEST aláírókulcs biztonságos megőrzése

A kulcs külön, egyszeri privát csomagban lett létrehozva és átadásra előkészítve (nem a repositoryban). **Ebből a ZIP-ből MINDEN jövőbeli aláírt TEST-verzióhoz szükség van a `grapes-test-release.p12` fájlra vagy a négy beállított GitHub secretre.** Készíts róla biztonságos, titkosított biztonsági mentést.

A `github_actions_test_secrets.env` fájl ugyanolyan érzékeny: benne van az aláírókulcs teljes Base64-tartalma és a jelszavak. Soha ne töltsd fel issue/PR megjegyzésbe, nyilvános Drive-ba, GitHub commitba, vagy chatbe.

## 2. A négy GitHub Actions Repository Secret feltöltése (egyszeri, felhasználói művelet)

Nyisd meg (a repository tulajdonosaként):

`https://github.com/fabianpetermark-commits/Grapes/settings/secrets/actions`

`New repository secret` → az alábbi neveket a privát `github_actions_test_secrets.env` fájl pontos értékeivel rögzítsd, egymás után:

1. `ANDROID_TEST_KEYSTORE_BASE64` — a .p12 fájl Base64 tartalma, egyetlen sorban.
2. `ANDROID_TEST_KEYSTORE_PASSWORD` — a PKCS#12 tár jelszava.
3. `ANDROID_TEST_KEY_ALIAS` — `grapes-test`.
4. `ANDROID_TEST_KEY_PASSWORD` — a kulcs jelszava (ebben az esetben megegyezik a tár jelszavával).

PC-n, bejelentkezett GitHub CLI-val elég egyetlen parancs a privát csomag kicsomagolási könyvtárából:

```bash
gh secret set -f github_actions_test_secrets.env -R fabianpetermark-commits/Grapes
```

A Repository Secrets értékeit GitHub utólag nem mutatja meg, csak a neveket. **Nem tudom a jelenlegi GitHub-csatlakozáson keresztül közvetlenül feltölteni ezeket a titkokat.** Ne másold be őket ChatGPT-be.

## 3. Aláírt TEST-kiadás létrehozása (külön későbbi jóváhagyással)

A `.github/workflows/release-android-test.yml` workflow csak egy **új `android-health-connect-poc/test-release.json` commitra** fut az `integration/grapes-test-food-20261017` ágon, miután a workflow integrálva van ebbe az ágba.

A release-kérést ezen a mintán kell felvenni (a fájl jelenleg szándékosan **nem létezik**, nehogy idő előtt kiadás induljon):

```json
{
  "versionCode": 2,
  "versionName": "0.2.0",
  "notes": "Grapes TEST: aláírt alapverzió és javított Food receptkereső."
}
```

Minden későbbi frissítésnél `versionCode` szigorúan növekszik, pl. 3, 4, 5. A GitHub Actions ellenőrzi:
- az új verziószámot és `android-test-vN` tag egyediségét;
- az összes JavaScript-regressziós és receptes böngészőtesztet;
- a `:app:assembleQa` aláírt Android buildet;
- az APK `hu.grapes.healthconnect.test` csomagnevét, pontos `versionCode`-ját és a **fenti TEST-tanúsítvány SHA-256** egyezését.

Csak ezek után készít külön `android-test-vN` **GitHub prerelease**-t, amelyhez `grapes-test-vN.apk` és `grapes-test-vN.apk.sha256` asset tartozik. **Soha nem állítja be legfrissebb éles kiadásnak.** A stabil `/releases/latest` csatorna változatlan.

A TEST app csak a `/releases?per_page=100` végponton szereplő `android-test-vN` prerelease és a pontos `grapes-test-vN.apk` fájlnév esetén ajánl frissítést; letöltés után SHA-256-t, telepítés előtt csomagazonosítót ellenőriz.

## 4. Átállás a korábbi debug-aláírt TEST alkalmazásról

**Ez egyszeri átállás.** A már telefonon lévő, CI által debug-aláírt `Grapes TEST` alkalmazás valószínűleg **nem frissíthető rá** az új, állandó kulccsal aláírt TEST APK-val. Az Android `INSTALL_FAILED_UPDATE_INCOMPATIBLE` vagy hasonló üzenetet adhat.

- Az első aláírt verzió telepítése ELŐTT exportáld a korábbi TEST alkalmazásban lévő fontos Food-adatokat és víznaplót a rendelkezésre álló alkalmazáson belüli mentési lehetőséggel, ha vannak fontos helyi adataid.
- Ezután, ha a telefon nem engedi az új aláírással telepíteni, a régi **TEST** alkalmazást kell eltávolítani, majd az aláírt TEST-kiadást telepíteni. A régi TEST alkalmazás lokális adatai eltávolításkor elvesznek; export nélkül nem állíthatók helyre.
- A **rendes Grapes** ettől független másik alkalmazás; ne távolítsd el.
- Miután a tartósan aláírt TEST v2 települt, a jövőbeli **ugyanazzal a kulccsal**, magasabb `versionCode`-dal kiadott TEST verziók elvileg felültelepíthetők adatmegőrzéssel és az app saját TEST frissítője is képes felajánlani azokat.
- A TESThez nem szükséges külön Google OAuth, ha most csak Food- és helyi funkciókat tesztelünk.

## Biztonsági korlátok

- A TEST release buildben a kulcs csak a szükséges Gradle lépéshez kerül a futtatóra, és a lépés után törlődik. Nem szerepel npm-futtatási környezetben, kimeneti artifactban vagy repository fájljaiban.
- Nincs `pull_request` titkos signing workflow: egy nyitott külső PR nem kérheti a privát kulcsot.
- A release csak a külön `integration/grapes-test-food-20261017` ágról és explicit `test-release.json` verzióváltozásra indul.
- Ha az aláírókulcs elveszik vagy lecserélődik, a későbbi TEST APK már nem tud frissítésként rátelepülni a korábbi azonos csomagnevű appra.
