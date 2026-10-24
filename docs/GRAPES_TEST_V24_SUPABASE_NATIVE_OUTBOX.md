# TEST v24: native bearer boundary and durable Supabase outbox

Base: draft #129, commit `b86bb328ad8d199435eec7a1936702531703a6d3`. This is an isolated QA development branch. Health remains **NO-GO**.

## Authentication boundary

`VITE_GRAPES_TEST_DATA_ENABLED=true` requires the existing TEST Auth configuration and is **off by default**. On that QA build only, the isolated Auth asset reads its SDK access token after `getUser()` and sends it to Android native memory. Native checks the JWT through the pinned Grapes TEST Supabase `/auth/v1/user` endpoint before unlocking the app. The app asset sees only its verified user ID and may ask native to execute one of eight named `api` RPCs. Native checks `/auth/v1/user` again on each request. The bearer is never returned to app JavaScript, stored in app-origin localStorage/IndexedDB, or passed to E-book Google Drive. Logout, account switch and Activity destruction clear native memory. Android restart returns to the Auth asset; a fresh token handoff is required. Token expiry causes subsequent cloud requests to fail closed; the user must re-enter the Auth flow to resume.

This is a narrow **transport foundation**. The native code does not assume a user ID supplied by app JavaScript is sufficient authorization. The server still enforces user/profile RLS and CAS. The TEST publishable key is the only client key. `api` is explicit; `grapes_private` is never exposed. No hosted migration is applied by this branch.

## Durable outbox

`grapes-test-supabase-outbox-v1` is a separate IndexedDB database. Each JSON candidate is inserted in a readwrite transaction before a network attempt. The operation ID is immutable: a different candidate under the same ID is rejected, including a two-tab race. The outbox lists only the selected user and Grapes profile. An interrupted RPC or missing recovery read leaves the operation pending. On retry, the same ID is sent; the server attempt must be read back and match before IndexedDB records `committed` or `conflict`. The candidate remains locally available for both outcomes. Conflict recovery also remains in the server attempts history. Account switching never drains another account's queue.

The module is currently isolated: Food, Water and Health UI do not import it. Existing local writes, recovery and E-book Google Drive remain unchanged. Browser tests use real IndexedDB with two tabs and synthetic RPC behavior; they do not prove an actual hosted TEST save.

## Remaining gates

1. Apply and verify the proposed SQL **only after separate approval** on the dedicated Grapes TEST project. The prior local Supabase CLI Auth/RLS/CAS proof is not hosted verification.
2. Add an explicit QA-only first synthetic Food write and readback through the native proxy and outbox, then test interruption and two accounts on a physical Android TEST device.
3. Integrate real Food/Water records only after #95 local durability and profile-bound recovery gaps are resolved. No automatic Drive import or deletion. E-book stays on Google Drive permanently.
4. Resolve the six known full-browser baseline failures separately before any release decision. No APK is published from this branch.
