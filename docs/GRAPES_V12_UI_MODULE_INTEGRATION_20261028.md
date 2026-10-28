# Grapes v1.2 UI / module integration review — 2026-10-28

This document records the approved-design integration work in PR #216. It is not a release sign-off and does not claim a physical-device PASS.

## Accepted navigation and layout

- The main capsule has six module destinations only: Home, Health, Tools, Finance, Outdoor and Settings.
- “Gyakran használt” is the landing/favorites page, not a seventh module. The Grapes brand button returns to that page.
- The Home screen contains the three live sections Bevásárlás, Készlet and Javaslatok. Its compact quick-action dock contains Bevásárlás, Készlet, Megosztás and the add action. Outdoor is a main module, not a duplicate Home quick-navigation button.
- Health uses its accepted six-action contextual rail on the Health dashboard; the six-module root capsule is hidden there to avoid stacking two navigation capsules. The app brand remains available to leave Health.
- Tools uses the current icon-first module hub rather than the legacy mosaic. Finance is opened through the actual Android module route and is expected to render its five existing views.

## Regression fixes in this branch

- Removed the extra Start/Kezdő icon from the main capsule.
- Removed the redundant Outdoor action from the Home dock while preserving the Outdoor main-menu destination.
- Kept the brand button as an accessible route back to Favorites.
- Preserved the Health dashboard origin while the Food controller opens/updates its Stats subview, so Back returns to Health rather than stranding the user on Food.
- Added a dedicated Finance Android-shell browser test for the five views and 320/360/390/412 px layouts.
- Added a single no-release live module integration workflow for the six-icon rail, favorites, Home, Health, Tools, Outdoor, Finance, existing Food/settings regressions and Android WebView build.

## Release boundaries

- No production Supabase schema has been changed. Family Home cloud sync remains TEST-only until the separate PROD migration has completed Supabase-specific security/RLS/CAS review and received explicit deployment approval.
- The direct Samsung Water adapter has a licensed-SDK compile path, but production certification still requires the actual registered package/certificate evidence and physical-device permission + water-record readback.
- Browser/CI evidence is not a substitute for a signed TEST APK installed over the existing app and a real-device smoke test.
- Do not publish or merge a release candidate solely because unrelated unit checks are green. The exact latest commit's UI regressions and the signed TEST APK must both be checked first.

## Current status

UI source changes are in the PR branch and have not been merged into `codex/android-app`. CI is still running against the latest edits. Physical-device validation and production Supabase deployment are NOT RUN / NOT AUTHORIZED.
