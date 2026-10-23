# Grapes – új ChatGPT-beszélgetés / állandó projektkontextus

A projekt tudása a repóban él, a valós ágak és release-ek aktuális állapotát minden új beszélgetésben újra kell ellenőrizni.

## 1. ChatGPT Project (ajánlott)

Hozz létre a ChatGPT-ben egy **Grapes** projektet, és nyisd meg benne a következő Grapes-beszélgetéseket. A projektutasításba ezt másold:

> Magyarul kommunikálj. Grapes GitHub: https://github.com/fabianpetermark-commits/Grapes . Munkakezdéskor először olvasd el a megfelelő aktuális ág gyökerében az `AGENTS.md` fájlt, majd a `docs/GRAPES_PROJECT_CONTEXT.md` dokumentumot. Frissen ellenőrizd a GitHubon az éles és TEST kiadásokat, a nyitott PR-okat, branch HEAD-eket és a releváns CI-eredményeket. A GitHub default `main` **nem** az éles Android forrása. Éles ág: `codex/android-app`; TEST ág: `integration/grapes-test-food-20261017`. Soha ne keverd össze a TEST és éles aláírást, APK-t, Drive-mappát, Food/Víz- vagy YAZIO-adatokat. PR, merge, kiadás, migráció és adatfelülírás csak a felhasználó kifejezett engedélyével. Ne találj ki tápértéket vagy nem ellenőrzött státuszt. Kezdd a választ tényszerű, rövid magyar állapotjelentéssel.

A projektbe a `docs/GRAPES_PROJECT_CONTEXT.md` aktuális változatát is feltöltheted. A feltöltött másolat nem frissül magától; a GitHub a frissebb referencia.

## 2. Bármelyik új chatben egyetlen indítóüzenet

> **Grapes – töltsd be a projektkontextust.** GitHub: https://github.com/fabianpetermark-commits/Grapes . Olvasd el a `codex/android-app` és `integration/grapes-test-food-20261017` ágak `AGENTS.md` és `docs/GRAPES_PROJECT_CONTEXT.md` fájljait. Ellenőrizd élőben a kiadásokat, a nyitott PR-okat, a branch HEAD-eket és a legutóbbi CI-ket. Először foglald össze a jelenlegi, ellenőrzött állapotot és a következő teendőket, külön választva az éles és TEST környezetet. **Ettől az indítóüzenettől ne kezdj merge-et, release-t, adatváltoztatást.**

GitHub-hozzáférés nélkül kérj csatlakozást vagy a dokumentum feltöltését; ne találj ki projektállapotot.

## 3. Terminál/Codex: egyetlen script

A repó gyökerében:

```bash
node scripts/grapes-context.mjs           # GitHub: legfrissebb branch/PR/release státusz
node scripts/grapes-context.mjs --json    # géppel feldolgozható adatok
node scripts/grapes-context.mjs --offline # a repo pillanatképe, hálózat nélkül
```

A gyökérbeli `AGENTS.md` hosszú távú Codex-projektszabály. A script nyilvános GitHub-végpontokat olvas, nem módosít repo-t, fájlokat vagy felhasználói adatot, és nem igényel API-kulcsot.

## 4. Emlékezeti szabály

- Új chatben ne vedd biztosra a korábban elhangzott release-verziókat: azokat ellenőrizni kell.
- A GitHub release nem bizonyítja, hogy az APK telepítve van a felhasználó telefonján.
- 2026-10-18 ellenőrzött pillanatképe: stabil `android-v26` / 0.16.2, TEST `android-test-v9` / 0.9.0, Brand Guide PR #41 még nyitott. Ezek változhatnak.
- A `CODEX_HANDOFF.md` és `FOOD_CODEX_HANDOFF.md` régebbi részei történeti anyagok, nem az elsődleges jelenidejű státuszforrás.
