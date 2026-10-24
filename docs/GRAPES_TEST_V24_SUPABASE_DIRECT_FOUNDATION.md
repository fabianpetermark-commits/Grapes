# Grapes TEST v24: direct Supabase foundation

Base: draft #128, commit `49393ca7ca4db39766ddb3885cb296e9bb00a98c`. The SQL proposal and isolated local verification are carried forward from draft #125 (`30ad0ffbba89e1378e42a65b1414ac841398de79`). This branch does not deploy SQL or change the released TEST or PROD app.

## Scope after the Drive decision

New Health, Food, Water and YAZIO cloud records may start empty in a Grapes account. There is no automatic Google Drive discovery, claim, import or deletion in this route. Existing local records remain local until a separately reviewed user action can preserve and import them safely. The user may manage their own old data; this branch deletes none. Existing Health/Food/Water Drive code remains in the app until a separate, tested removal can be made. E-book Google Drive authentication, permissions, discovery, books and reading data are a permanent independent service and must remain functional.

## What this branch adds

`poc/supabase-phase2/schema-proposal.sql` proposes private owner/profile-scoped documents, immutable revisions and CAS attempts, a privileged implementation in an unexposed schema, and explicitly granted invoker RPC wrappers in `api`. The companion local Supabase CLI workflow applies it only to an ephemeral runner stack. It uses real local Auth JWTs, two user identities, two PostgreSQL connections, SQL/RLS assertions and a rollback probe. The SQL has **not** been applied to the hosted Grapes Supabase TEST project.

`src/sync/grapes-supabase-test-gateway.js` is an isolated TEST adapter for a pre-existing Supabase Auth client. It validates `getUser()` immediately before and after each RPC, binds itself to one verified user ID, accepts only server-created profile IDs, and rejects malformed success responses. A lost response requires retry with the **same** operation ID. Stale writes return a conflict snapshot ID; the caller must retrieve and preserve the rejected candidate. Synthetic tests cover lost responses, retries, conflict and account switching. The gateway is deliberately not imported by Food, Water or Health yet.

## Remaining release gates

1. The Android app asset currently receives only an authenticated user UUID from the isolated Auth asset. It has no Supabase session and cannot use the gateway safely. A reviewed, short-lived session handoff or another same-origin authenticated execution path is required, with logout and account-switch tests.
2. Durable, account- and profile-scoped IndexedDB outbox and readback verification must be integrated with the actual Food/Water local stores. The current Water v2 localStorage write is still not atomic across simultaneous tabs; the generic Health backup excludes it.
3. The hosted TEST schema requires separate approval, application, security verification with two real TEST accounts, and explicit PostgREST `api` exposure. A local CLI PASS is not hosted verification.
4. Actual app paths need browser, Android device, offline/restart and interruption tests. The known six unrelated full-browser failures remain visible. Health stays **NO-GO**; there is no APK or release from this branch.

## Required Dashboard/Google Cloud settings before a real TEST save

Only the dedicated Grapes TEST project `aighqtqjlzirlokxwupt` may be used. Supabase Dashboard must explicitly expose `api` and keep `grapes_private` unexposed; Auth email confirmation and redirect URLs must match the approved TEST routes. The TEST publishable key is client-side configuration; service-role credentials must never enter the app. Google OAuth needs a configured Google Cloud client and Supabase Auth provider redirect for sign-in without Drive scopes. No Google Drive permission changes are needed for E-book.

The next concrete milestone is one **new synthetic Food record** saved from an authenticated TEST app session through `api.compare_and_swap`, read back with `api.read_document`, then retried offline with the same operation ID. Real user data stays out of that trial.
