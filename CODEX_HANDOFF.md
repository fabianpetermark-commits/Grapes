# Codex Handoff — Grapes E-book Library

Repo: fabianpetermark-commits/Grapes
Branch: main
Live: https://fabianpetermark-commits.github.io/Grapes/

## Goal
Finish and debug the E-book Library.

## Current design
- Frontend: Vite, main module: src/ebook-library.js
- UI: index.html
- OAuth scope must stay: https://www.googleapis.com/auth/drive.file
- Google Drive API enabled
- Google Picker integration added
- Picker API key comes from GitHub Actions secret VITE_GOOGLE_API_KEY
- Transfer broker: apps-script/ebook-transfer/Code.gs
- Pages workflow: .github/workflows/deploy-pages.yml

## Current bugs
1. Files manually uploaded from phone do not appear automatically. This is expected with drive.file. Intended fix is explicit selection with Google Picker.
2. Uploading a new book directly from Grapes currently fails.
3. Picker flow has not yet been validated end-to-end.

## First thing to inspect
Check uploadBook() in src/ebook-library.js.

The multipart upload body currently uses escaped separators like:
\\r\\n

Verify whether these become literal backslash characters instead of real CRLF line endings. This is a likely cause of the failed Drive multipart upload.

Prefer either:
- correct multipart/related with real CRLF, or
- a more robust Drive upload flow.

Do not broaden Drive scope.

## Picker validation
Verify:
- gapi picker loading
- PickerBuilder
- OAuth token
- developer key
- app ID
- origin
- selected file access under drive.file
- files.get/files.copy
- useful errors in #ebook-status

If a selected file is outside Grapes E-book Library, copy it into the folder. Do not move or delete the original.

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
- Picker import works
- Existing original file is untouched
- E-reader transfer still works
- npm run build succeeds
- no secrets in diff

## Task
Audit the e-book module, fix direct upload first, then Picker import, then transfer flow. Make the smallest safe changes and report root causes, files changed, test/build results, and any remaining manual Google Cloud steps.
