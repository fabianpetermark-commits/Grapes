# Grapes TEST v29 – unified native Grapes Auth owner modules

**One integrated candidate branch:** `integration/grapes-test-owner-modules-v29-20261025`.

**Base:** signed TEST v28 `feature/grapes-test-v28-synthetic-saf-signed-20261025`.
This branch **inherits the entire 11-PR chain** without cherry-picks, rebases,
parallel partial merges or silent omission:

| PR | Scope |
|---|---|
| #144 | Water owner + projects separation |
| #145 | Finance real UI, private receipts and backups |
| #146 | Food native owner core |
| #148 | Food mobile real diary/recipes |
| #149 | E-book owner core and file bytes |
| #150 | E-book shelf and reader |
| #151 | Home inventory / shopping |
| #152 | Health Connect → Food nutrition |
| #153 | Health Connect → Water hydration |
| #154 | YAZIO JSON and CSV files, confirm and undo |
| #155 | One-shot direct YAZIO API read to an owner preview |

The integration only changes a stale Food status message and adds the
consolidated CI/release-candidate workflow and this documentation.

## Exact signed TEST candidate contract

- Android package: `hu.grapes.healthconnect.test` (never PROD package).
- Version: **29**, `0.9.20-test`, greater than the installed QA v28.
- Signer: existing dedicated TEST certificate SHA256
  `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`.
  Build fails if it is missing or different. **Never use PROD signing secrets.**
- WebView flags: `VITE_GRAPES_TEST_CHANNEL=1`,
  `VITE_GRAPES_TEST_AUTH_ENABLED=true`,
  `VITE_GRAPES_TEST_FRESH_OWNER_MODULES_ENABLED=true`,
  `VITE_GRAPES_TEST_DATA_ENABLED=true` and exact dedicated TEST Supabase URL +
  publishable key, so the native Auth gate can validate TEST sessions.
- Disabled: synthetic demo Food, old local owner QA, unclaimed backup/SAF QA,
  automatic Health import, legacy Food local CAS/Water profile experiments,
  Google Drive writes and unowned project restore. Normal manually approved
  Health Food/Water and YAZIO imports remain available.
- Output artifact: `grapes-test-v29-owner-integrated-signed.apk` + SHA256
  attached **only** to a completed GitHub Actions workflow run for this
  integration branch. Artifact retention 14 days. No GitHub release, no
  in-app update, no automatic installation. **Do not claim an APK is ready
  unless the signed CI job finishes successfully.**

## Verification

- The integration CI checks all 11 exact feature commit SHAs are ancestors of
  the candidate commit before building. This proves that the consolidated
  branch already contains each stacked PR.
- Full unit suite and one consolidated real mobile screen Chromium A→B→A
  regression for Water, Finance, Food, E-book, Home, Health (nutrition + water),
  YAZIO (file and one-shot direct), local owner store and untouched legacy.
- Actual Android native `testQaUnitTest` plus signed `assembleQa`,
  package/version/signature/hash checks. Browser native calls are stubbed;
  external Health Connect/Samsung/YAZIO API cannot be asserted by CI.
- **No new full manual testing cycle is necessary** to accept this as an
  integrated CI candidate; previous phone Auth separation tests remain the
  reference. A small real-phone integration smoke check is useful before
  installing for everyday use, but this PR does not demand repeating every
  earlier test.

## Excluded by decision

Google Drive and multi-device synchronization remain **independent,
disabled future work**: the native Grapes Auth subject UUID is not a verified
identity equivalence with a separate Google Drive credential. Do not assume
email equality or grant cross-account Drive access.

Old unclaimed data remains intact, is never automatically imported or
assigned to any new native Grapes subject. No PROD, default-branch merge,
store publication or backend migrations are part of this candidate.

## Installation guidance

Once the signed artifact is verified, installing the v29 `.test` APK over
the existing v28 `.test` app should retain its Android app data (same
package and same signing certificate). **Do not uninstall v28 or clear app
storage.** The opt-in fresh-owner mode starts with separate, empty private
per-Grapes-account module datasets; it does **not** automatically claim the
older unowned local module data. If a particular older manual workflow
requires data, keep that issue separate from this owner-integrated release.
