# Grapes Health v15 — TEST-only Food search, locale and Statistics

**Base:** exactly published Grapes TEST v14 source commit `49f6aa53157fd9461b8657698055ebe64290b280`. Health audit source #57 (draft), forward-ported without merging its older TEST branch. Target a dedicated frozen v14 baseline, **not** main, production or the old TEST v13 branch.

## Included from the existing #57 Health patch

- Search Open Food Facts by selected country `hu/sk/at/de/cz/pl/ro/gb/us/all`, using Search-a-licious query field `countries_tags`, legacy endpoint filter and client-side evidence checks; search request is retriggered when region changes.
- Explicitly preserve real Hungarian name when provided, otherwise preserve the source name with language-state notification; **do not machine-translate unsupported labels**. Include brand on results and persist it in the Food data model.
- OFF missing nutrient fields are unknown, not zero; measured kJ is converted to kcal only from real data, sodium/salt fallbacks and missing macro notices.
- Validate country selection in JS and Android `FoodApiBridge.kt`: the country is the fifth native argument. Barcode lookup stays globally available; this country preference applies to name searches.
- For USDA Foundation/SR Legacy records, accept real partial macro results and both `nutrientId/value` and nested `nutrient.id/amount` payloads; reject unknown identity or completely unmeasured main macro set; preserve `null` unknowns.
- Health → Statistics: preload Food without first exposing Food overview, open Statistics in one UI turn, and assert no overview flash.

## Explicitly not included

- No Health audit #59–#73 changes to Water, Drive conflict resolution, YAZIO migration or profile write logic.
- No Supabase/Auth #86–#90, Outdoor, experimental Food rehydration branch #84, Home M2, Finance, production release or altered TEST/PROD Drive folder. The existing native Android TEST signing and updater source remain from signed v14.
- No new persistent credential or backend token in the APK. Online USDA DEMO_KEY public quota limits still apply, and real OFF API rate limits must be honored.
- No merge, signed APK, new versionCode, TEST prerelease, user-data migration or PROD change in this draft.

## Verification required before a v15 APK

1. Exact v14 base ancestry, Node 24 `npm ci`.
2. Source-level OFF/USDA/region native bridge and actual Food data model tests including old product compatibility and nutrient unknowns.
3. Complete `npm test`, both Vite builds, menu/stats, Food/reviews, Home, E-book, and responsive browser regressions with isolated TEST Drive fixture.
4. Android SDK 36 native QA compilation on CI, no signed release.
5. Device acceptance on the signed v14 TEST: searching Hungarian and English names, switching country, barcode global lookup, Foundation/SR Legacy partial results, Statistics no flash, recipes and backup export. **Do not publish v15 before user explicitly approves and device data protection is checked.**
