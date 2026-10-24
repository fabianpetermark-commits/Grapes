# Grapes TEST v24: Auth subject and profile scoped Water prototype

Base: draft #127. Trace: #95, #94 and TEST Auth #86–#90. This is a separate QA-only review branch. Health remains **NO-GO**.

## Auth boundary

On Android TEST, the isolated Supabase Auth page calls `getUser()` before handing off the user UUID. The QA native gate accepts it only from the exact Auth asset URL, holds it in memory, and returns it only to the exact TEST app asset URL while that gate is unlocked. Logout and Activity restart clear it. It is an identifier, not a token; the E-book Google Drive authorization and storage remain separate. PROD still has the Auth gate disabled. A local browser QA run uses one fixed synthetic UUID and never contacts Supabase.

## Water QA path

`VITE_GRAPES_TEST_WATER_PROFILE_ENABLED=true` requires `VITE_GRAPES_TEST_CHANNEL=1`; it is **off by default**. With it enabled, Water reads and writes `grapes-water-v2:<verified UUID>`. No old data is assigned automatically. The UI previews the unscoped `grapes-water-v1` source and asks before copying it. An IndexedDB readwrite transaction reserves the source for one UUID; a failed copy may be retried by that UUID. The original v1 bytes are never modified or deleted. A second UUID cannot claim them. V2 JSON exports include the UUID; another UUID cannot import them. Legacy v1 backup import remains available with an explicit warning because its source has no owner identifier.

The earlier Water strict reader, readback verification and recovery checkpoints remain active. A generic Health migration backup now fails closed if v2 Water exists, so it cannot falsely claim to include every local source. The profile bound Water export is available separately. Profile v2 backup must be integrated into the verified Health backup before real data is permitted.

## Verification and limits

Synthetic unit and Chromium checks cover two UUIDs, cross-profile read denial through the adapter, immutable v1 bytes, retry after failed copy, V2 backup identity, concurrent claims from two independent browser pages and the generic backup blocker. Native gate tests cover trusted origin, valid UUID and logout clearing. CI runs clean `npm ci`, the complete unit and browser suites, web build and Android QA compile on the exact PR HEAD.

This QA path still uses localStorage for Water v2 writes. The byte comparison catches sequential stale edits, **not truly simultaneous writes from two tabs**. No Supabase database write, hosted RLS check, real account test, real user migration or Android device navigation test is claimed here. #95 needs transactional Water writes and a profile bound verified backup before the flag can be enabled for real data. The baseline six browser failures remain a separate release gate. Do not merge or publish an APK from this PR.
