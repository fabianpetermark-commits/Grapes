# Grapes TEST v15 — Food usability and USDA Hungarian dictionary bugfix

Source: signed published TEST v15 `e968dc16dfb14fc4e1c7d9efba24b63795412746`, user Android screenshots from Oct 21. **No PROD change, no Health v16 unfinished data migrations.**

## Fixed in this isolated review

- In breakfast/lunch/dinner detail, remove duplicate full-width `+ Étel hozzáadása` button and keep existing floating FAB, 58→66 px. The legacy click hook tolerates absent button.
- During remote Food search, immediately show `Keresés folyamatban…` instead of prematurely claiming zero results while debounce/network still pending. Reduce debounce from 1550ms to 350ms. Results from already saved local/verified USDA remain visible.
- Do not print confusing `Nincs további találat.` after successful empty remote provider when local foods are already displayed.
- USDA query dictionary: Hungarian `hagyma`, `vöröshagyma`, `lilahagyma`, `zöldhagyma`, `újhagyma`, `póréhagyma`, `fokhagyma` and spaced aliases. Extend preparation modifiers to `főtt/sült/pirított/nyers`, translate into real English USDA query terms.
- Extend safe human-readable Hungarian names for clearly identifiable raw USDA descriptions; prefer real onion vs flavoring/ready-to-eat product when scoring results. Always retain original unmodified USDA description, true FDC ID and nutrient values, never invent an identity or translate an unknown product with guesses.
- Add USDA dictionary + raw/cooked/roasted ranking unit tests and Playwright reproduction for duplicate action / in-progress search / Hungarian onion result.

## Still unconfirmed / separate issues from on-device review

- The user reported previously visible Food data absent; the screenshot displays **September 28**, which may be another selected day, but the reason is **not proven**. Preserve current local/Drive data byte-for-byte; do not reimport/overwrite or infer a migration success.
- Food reload starts on Home rather than the last meal/detail view. Resume-state restoration needs its own regression-tested navigation feature and should not disturb Drive/profile identity.
- Some OFF brands simply are not provided in source API payload; do not fabricate brand.
- Missing nutrients: the accepted rule is that an absent field shows an explicit unavailable indicator, not measured 0. Ask the user to confirm preferred display and show example cases before another change.
- Actual external API latency and USDA rate limits cannot be fully proven in synthetic CI. Verify on an Android device over real connection.

## Release gate

No direct publish until complete CI + native QA plus reconfirmation that previously missing data is safe, with an explicit user-data backup. The owner authorizes automatic TEST publication **only after data integrity is safe**. Do not mix with Health v16 #94/#95 unfinished live save/Drive safeguards.
