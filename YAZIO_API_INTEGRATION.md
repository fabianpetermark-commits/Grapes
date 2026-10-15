# Android YAZIO API import

The Sync → YAZIO card opens an email/password and date-range form. Android sends
the credentials directly over HTTPS to `yzapi.yazio.com`; there is no Grapes proxy.
Credentials are not persisted, and the password field is cleared immediately.
The access token remains native-only, in memory, and is discarded after the read
or failure. Each new read requires login. Google/Apple sign-in is not implemented.

Protocol reference (unofficial, not a YAZIO-supported public API):
https://github.com/funmelon64/Yazio-Exporter/blob/master/pkg/yzapi/api.go
Data shape reference:
https://github.com/funmelon64/Yazio-Exporter/blob/master/README.MD

Supported operations: password login, consumed-items by date, product lookup.
Only fixed endpoints on the YAZIO host are callable; redirects are disabled.
HTTP errors do not expose response bodies, credentials or tokens to logs/UI.
The source project's public client identifiers are used for compatibility; no
third-party code is copied. API changes or access restrictions can break login.

Date range: 1–31 days, default last seven local calendar days. Products are cached
within one import. Per-gram/ml nutrients are multiplied by consumed amount; absent
nutrients stay unknown. Unsupported units or malformed records abort before any
diary write. Recipe portions, simple products, and other unsupported collections
are explicitly reported as omitted and retained in the source archive. Water,
weight, automatic background sync and recipe conversion are not implemented.

The existing YAZIO preview, selection, local backup, batched commit and undo are
reused. Stable source entry IDs preserve duplicate detection across reads and
matching file imports. File import and undo remain available as secondary actions.

Validation: `node --test tests/yazio-api-import.test.js tests/food-yazio-import.test.js`
and `node tests/android-yazio-api.browser.mjs` (simulated native API, not real login).
Real-account login must be verified in the APK by the account owner; never ask for
their password in chat. A successful build or simulated test is not live API proof.
