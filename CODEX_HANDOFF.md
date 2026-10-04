# Codex Handoff — Grapes E-book Library

Repo: fabianpetermark-commits/Grapes
Branch: main
Live: https://fabianpetermark-commits.github.io/Grapes/

## Goal
Finish and debug the E-book Library.

## Current design
- Frontend: Vite, main module: src/ebook-library.js
- UI: index.html
- Default OAuth scope: https://www.googleapis.com/auth/drive.file
- The user explicitly authorized an optional full-Drive read mode. Its separate button requests `https://www.googleapis.com/auth/drive.readonly` alongside `drive.file`; project writes remain limited to app-authorized files. The restricted read scope must be configured and verified in Google Cloud before production use.
- Google Drive API enabled
- The user confirmed that the full-Drive scan works and requested removal of the manual Google Picker import. The Picker button, loader, copy flow and browser API key configuration were removed.
- Transfer broker: apps-script/ebook-transfer/Code.gs
- Pages workflow: .github/workflows/deploy-pages.yml

## Current behavior
- `drive.file` remains the default scope for Grapes project writes and uploads.
- The optional `drive.readonly` consent scans recognized e-book formats throughout Drive and all non-hidden binary files in Grapes E-book Library folders.
- Books found only through read-only access can be downloaded. The app does not expose Send for those files because it cannot change their sharing permission.
- The manual Picker import was removed at the user's request. Keep write access limited to `drive.file`.

## Security constraints
- Public repository
- Keep drive.file
- Do not commit secrets
- Broker must not expose arbitrary private Drive files
- Pairing codes are 6 chars, 20 minute TTL
- Broker return URL restricted to Grapes GitHub Pages

## Acceptance criteria
- Connect Drive works
- Direct upload works
- Uploaded book appears immediately
- Full-Drive scan works after separate Google consent
- Existing Drive books remain untouched by scanning
- E-reader transfer still works
- npm run build succeeds
- no secrets in diff

## Release check
Run `npm run test:ebook` and `npm run build`, then confirm the scan and manual upload buttons on the Pages deployment.
