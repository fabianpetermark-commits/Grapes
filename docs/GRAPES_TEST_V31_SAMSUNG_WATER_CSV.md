# TEST v31 – Samsung Health water export into owned Water

The Samsung Health native button formerly showed “Ez az importkapcsolat még
nincs Grapes-fiókhoz kötve” because it entered the old unscoped Food import
panel and was deliberately denied in fresh-owner mode.

## What this PR actually adds

- In native Grapes TEST fresh-owner mode only, Samsung Health's action is now
  **CSV-import**. Its own bottom-sheet says **Samsung Health · Vízexport** and
  opens the Android file picker. No Google Drive, Samsung OAuth, background
  sync or legacy record ownership is involved.
- User selects **only** the downloaded Samsung Health personal-data water
  export file **com.samsung.health.water_intake…csv**. No ZIP or unrelated
  Samsung Health account dump.
- Strict local CSV parser looks for the official fields `start_time`,
  `amount` (milliliters) and `datauuid`, including fully-qualified
  header names. Invalid file schemas, missing record IDs, invalid amounts,
  malformed timestamps, oversized files or any malformed row reject the whole
  file; it makes no write. Max 15 MB / 50k data rows.
- Converts the selected file to the same normalized bridge export used by the
  existing `prepareFreshOwnerWaterHydration` preview. All writes still go
  via `confirmFreshOwnerWaterHydration` with verified native Grapes Auth,
  original owner Water CAS, explicit selected checkboxes and stable
  `samsunghealth:` record IDs for duplicate checking.
- A→B→A browser test opens the **real mobile screen**, chooses a CSV using
  the file picker and imports one of two rows. Switching to B shows two new
  rows; returning to A marks one duplicate. Full Food/Finance/Home/E-book/
  Health/YAZIO regression suite remains in the v31 workflow.
- CSV parsing doesn't store the original Samsung Health export, only the
  selected hydation entries with provenance. Original local/legacy Water and
  other accounts are not touched.

## What is NOT claimed

**This is a file-import alternative, not live Samsung SDK access.**
The existing Samsung SDK adapter is disabled in the signed TEST APK because
the proprietary `samsung-health-data-api-1.1.0.aar` is **not in source**.
Do not claim the button directly reads the Samsung Health app or advise
linking a different Grapes/Google account. The official SDK can read Water
but needs the correctly licensed SDK and access authorization.

The CSV was tested with a strict simulated Samsung Health header, not yet
with the user's actual export. If the real file's schema differs, the app
must show a descriptive rejection rather than import wrong values. In that
case, inspect only its filename + CSV column names (not a full health export)
and update the mapping.

## Installation

Candidate only, no release/merge/PROD, no automatic update.
The CI workflow creates **signed TEST v31**, same
`hu.grapes.healthconnect.test` package and SHA256 signer as v28-v30.
Install over v30 without uninstall or data clear. A new real-phone import
from actual Samsung-exported CSV still needs confirmation before declaring
Samsung Water PASS.
