# Grapes TEST — natív kamerás vonalkódolvasó

## Scope and source
- Staged from signed TEST v15 baseline integration branch, **not PROD or main**.
- CameraX preview + bundled ML Kit EAN/UPC analyzer on a separate **private Android Activity**.
- Dark Grapes interface, thin neon-cyan scan corners/line, live continuous camera and LED torch toggle.
- Back/cancel, manual EAN/UPC entry, pinch-to-zoom, checksum validation and two consecutive matching detections.
- Returns only a validated code via the existing origin-locked WebView bridge; **no images uploaded or stored**.
- The Food screen continues to call the same Open Food Facts lookup, with the existing editable save flow.
- The original web scanner and photo/manual modes are retained, including for non-Android browsers.
- No Food/Water/recipe records, Google Drive profiles, backup formats or Supabase tables are migrated.

## Release and data safety
- Draft PR; isolated TEST source only. No direct merge to PROD, signed APK, release, forced phone update, or storage reset.
- ML Kit is bundled so the first use does not depend on Play Services model download.
- CameraX/ML Kit may make the TEST binary larger; validate size and performance before an APK.
- A new TEST APK must be generated separately with historical QA certificate and a higher version code **after** this PR is reviewed and manually tested.
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
The originally requested AGENTS.md and docs/GRAPES_PROJECT_CONTEXT.md were not present on the inspected main and TEST branches. The existing TEST baseline and PR release rules were inspected instead. Native Gradle QA compilation and physical device UAT are not established by merely writing this code. Neither a passing CI job nor this draft PR is a release approval.
