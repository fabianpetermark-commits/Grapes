# Grapes Android kiadási folyamat

Ez a rövid leírás a bevált GitHub-feltöltési és APK-kiadási folyamatot rögzíti.

## Elsődleges ág

- Az Android build és release forrásága: `codex/android-app`.
- A `release-android.yml` workflow ezt az ágat veszi ki akkor is, ha más ágról indítják el.
- Release előtt mindig ellenőrizni kell, hogy a kívánt commit már ezen az ágon van.

## Feltöltés

1. Friss távoli állapot lekérése: `git fetch origin --prune`.
2. Ellenőrzés: a helyi commit a távoli `codex/android-app` közvetlen folytatása legyen.
3. Feltöltés: `git push origin HEAD:codex/android-app`.
4. Ellenőrzés: `git ls-remote --heads origin codex/android-app`.

## GitHub CLI hitelesítés

Az alkalmazás futtatókörnyezete hordozható GitHub CLI-t használhat. Ha a Git hitelesítője egy már törölt `%TEMP%\grapes-gh-*\bin\gh.exe` fájlra mutat, a Git látszólag megállhat vagy `No such file or directory` hibát adhat.

Ilyenkor:

1. A hivatalos GitHub CLI ZIP-et kell visszatölteni a GitHub Releases oldaláról.
2. A korábban beállított TEMP-útvonalra kell kibontani, vagy új hely után futtatni kell a `gh auth setup-git` parancsot.
3. Bejelentkezés: `gh auth login --hostname github.com --git-protocol https --web`.
4. Ellenőrzés: `gh auth status --hostname github.com`.

A felhasználó végzi el a GitHub eszközkód böngészős jóváhagyását. Jelszó vagy kétlépcsős kód nem kerül a repositoryba.

## Aláírt APK kiadása

1. A legutóbbi verzió lekérése: `gh release list --repo fabianpetermark-commits/Grapes`.
2. A `version_code` mindig legyen nagyobb az előzőnél.
3. A workflow indítása:

   `gh workflow run release-android.yml --repo fabianpetermark-commits/Grapes --ref codex/android-app -f version_code=<szám> -f version_name=<verzió> -f release_notes="<rövid leírás>"`

4. A futás figyelése: `gh run watch <run-id> --repo fabianpetermark-commits/Grapes --exit-status`.
5. Siker után ellenőrizni kell, hogy az új GitHub Release tartalmazza a névre átírt, aláírt APK-t.

Az aláíróadatokat kizárólag a GitHub Actions Repository Secrets tárolja; ezeket nem kell és nem szabad helyi fájlba írni.
