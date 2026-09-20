# E-book debugging report

Inspected `main` at `fac8277` after reading `CODEX_HANDOFF.md`.

## Findings and changes

- `src/ebook-library.js`: multipart separators were literal backslash-r/backslash-n bytes. Replaced them with real CRLF and a unique boundary, preserving binary file content. Successful upload refreshes the library immediately.
- Picker already used the OAuth token, developer key, project number and page origin, and correctly copied external files into the library. Preserved that behavior and `drive.file`. A rejected loader promise previously prevented retries; it is now reset after failure. Picker error callbacks now report configuration guidance.
- Drive errors now expose HTTP status and Google's message. HTTP 401 clears the token and enables reconnect. Failed post-import refresh no longer becomes a misleading success message. Library listing now follows pagination.
- `index.html`: removed empty local QR/code placeholders; explains that the broker page provides the code and QR. Documents the existing public-link sharing behavior.
- `apps-script/ebook-transfer/Code.gs`: reserves codes under a script lock, removes expired records on creation, and rechecks public-link sharing when resolving a code. Kept six-character codes, 20-minute expiry and the existing Grapes return URL restriction. No private bytes are served by the broker; it only links to Google's public download endpoint.
- `tests/ebook-library.test.js`, `package.json`, `.github/workflows/deploy-pages.yml`: added a dependency-free regression suite and run it before the Pages build.

## Verification

- `npm run test:ebook`: 12 tests passed. Covers consent configuration, pagination, actual multipart bytes, immediate rendering, copy-only import and existing-parent handling, expired tokens, refresh errors, Picker retry/configuration/errors, transfer QR/link setup and stable receiver routing, and broker private-file rejection/expiry/sharing revocation.
- `npm run build`: passed with Vite 8.3.0. Existing large editor/studio chunk warnings remain.
- `npm ci`: succeeded; npm reported zero vulnerabilities.
- `git diff --check`: passed. Reviewed changed files for secrets; no credentials or tokens added. Test credentials are placeholders.
- Tests simulate browser, Google and Apps Script boundaries. They do not establish real Google consent, Picker grants, Apps Script deployment behavior or physical e-reader compatibility. The local build ran without production credentials.

## Remaining deployment and Google Cloud checks

1. In project `991532871119`, confirm both Google Drive API and Google Picker API are enabled. The OAuth web client, Picker key and project number must belong to the same project.
2. Keep OAuth scope `https://www.googleapis.com/auth/drive.file`. Set the OAuth authorized JavaScript origin to `https://fabianpetermark-commits.github.io`; include local development origins only if needed. If consent is in Testing, add the testing account.
3. Confirm Actions secret `VITE_GOOGLE_API_KEY` exists. For a website-restricted Picker key, Google's current guide specifies the app website and `https://docs.google.com/*`; restrict API use to the required Google APIs. Vite embeds the browser key in the built application, so key restrictions matter. Do not commit its value.
4. Publish the frontend changes through the existing Pages workflow. Update the existing Apps Script deployment to a new version containing `Code.gs`; merely saving the script does not update a versioned deployment. Preserve the configured `/exec` URL, or update the workflow if it changes.
5. The existing broker manifest uses `drive` under the deploying account; this audit did not add or broaden it. The browser still requests only `drive.file`. The broker's public-sharing checks must remain because the web app executes as its deployer.

Google reference: [Picker setup, credentials, key restrictions and project number](https://developers.google.com/workspace/drive/picker/guides/web-picker), [Drive multipart upload requirements](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Live acceptance walkthrough

1. Connect Drive with a test account. Upload a small PDF and a binary EPUB; confirm each appears immediately and its download matches the original bytes.
2. Upload a book manually from a phone to Drive. Select it explicitly in Picker. Check that a copy appears in Grapes while the original ID, parent and content remain unchanged. Select an existing Grapes book and confirm no duplicate is created.
3. Send a test book. On the broker page confirm the six-character code and QR appear. Open the QR link and enter the code on an e-reader; download and open the book. Check popup-blocked fallback and sharing-denied errors.
4. Revoke public sharing and verify the code no longer produces a download link. Verify expiry after 20 minutes. The pairing expiry does not revoke the underlying public Drive permission; remove that permission in Drive when testing is complete.

No live account mutations, commits, pushes or deployments were performed during this local debugging run.

## Follow-up: transfer display and reusable receiver

- Fixed undefined CSS token names across the e-book screen. The card now uses the existing opaque surface token and the overlay uses the existing scrim. Added scoped hidden-state handling because button display styles overrode HTML hidden attributes.
- Sender now generates its QR locally with the installed qrcode package. It encodes the direct public download URL; it is not a 20-minute pairing URL. The separate code-request link opens the broker explicitly. Removed obsolete duplicate sender functions.
- Added `?ebook-reader=1` as a permanent bookmarkable receiver entry point. It requires no Drive connection; users enter a fresh six-character code for each transfer. Input errors appear inside the receiver panel. Incoming pairing URLs prefill the code.
- Browser screenshot confirmed the receiver card is opaque and readable. Twelve automated tests passed, including stable receiver and QR-failure fallback. The production build passed after stopping the preview and limiting Rayon to one thread; the first concurrent attempt ran out of memory.
- Frontend changes still require Pages deployment. Broker changes from the earlier audit additionally require Apps Script redeployment. Live Google/device validation remains outstanding.

## Live return URL fix

Apps Script deployment version 2 now replaces unsupported new URL() validation with an exact comparison to the canonical Grapes return URL. Verified live code creation, visible QR, and code submission through the permanent receiver page to the correct download link. This deployment applies only the return URL fix to the previously deployed source; repository-only locking/cleanup/revocation enhancements remain pending a separate broker update. No sharing or OAuth settings changed.
