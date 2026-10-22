# Grapes TEST — natív kamerás vonalkódolvasó

## Scope and source
- Staged from exactly published signed TEST v16 source `ec8e7fa08f86967afc75f495e5fc82b62a5c4a97`, **not PROD/main**.
- CameraX preview + bundled ML Kit EAN/UPC analyzer on a separate **private Android Activity**.
- Dark Grapes interface, thin neon-cyan scan corners/line, live continuous camera and LED torch toggle.
- Back/cancel, manual EAN/UPC entry, pinch-to-zoom, checksum validation and two consecutive matching detections.
- Returns only a validated code via the existing origin-locked WebView bridge; **no images uploaded or stored**.
- The Food screen continues to call the same Open Food Facts lookup, with the existing editable save flow.
- The original web scanner and photo/manual modes are retained, including for non-Android browsers.
- No Food/Water/recipe records, Google Drive profiles, backup formats or Supabase tables are migrated.

## Release and data safety
- Draft PR, signed candidate for manual TEST only; no production merge, release, forced phone update, or storage reset.
- ML Kit is bundled so the first use does not depend on Play Services model download.
- CameraX/ML Kit may make the TEST binary larger; validate size and performance before an APK.
- Candidate uses the historic TEST signing certificate and versionCode 17. User data backup and manual device checks are still mandatory before using it.
- Export TEST Food/Water/Finance/E-book backups and verify the existing package identity before any installation.

## Acceptance checks (pending real hardware)
1. Galaxy S22 Ultra: first launch asks for camera permission once; denial shows manual entry; retry works after Settings permission change.
2. Preview matches accepted dark/cyan design; torch on/off illuminates constantly and resets when closing/back or backgrounding.
3. Focus and pinch zoom; glossy, tiny, tilted, partly obscured and low-light EAN/UPC codes.
4. Compare at least 20 products against the previous scanner: success rate, wrong-code rate, time; checksum and two-frame checks reject spurious scans.
5. Correct product lookup, unknown-product fallback, nutrition preview/edit, recipe-ingredient flow, existing-food deduplication.
6. Verify no camera preview survives Activity closing, app background, permission denial, or rotation handling.
7. Test TEST account storage remains isolated, older Food diary and family recipes persist after a supported signed upgrade.
8. Web desktop/non-Android barcode and photo/manual fallbacks are unaffected.

## Boundaries
The originally requested AGENTS.md and docs/GRAPES_PROJECT_CONTEXT.md were not present on the inspected main and TEST branches. The existing TEST baseline and PR release rules were inspected instead. A signed build and physical device UAT are not established by merely writing this code. Neither a passing CI job nor this draft PR is a release approval.
