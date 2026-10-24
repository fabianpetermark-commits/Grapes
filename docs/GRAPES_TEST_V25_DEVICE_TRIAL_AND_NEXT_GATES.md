# Grapes TEST v25 – first real Android → Supabase Food proof and next gates

**Status: synthetic QA path PASS on one device; real Food migration / sync remains NO-GO.**
This document records observed evidence, not permission to enable user-data migration.

## Verified on 2026-10-24

- Signed Grapes TEST v25 was tested by the owner on an Android phone. The Settings QA panel displayed **`PASS: a külön szerveroldali Food-visszaolvasás egyezik (rev. 1).`** after all three explicit steps. This is a **real device** observation, not only a mocked browser test.
- A separate read-only hosted Grapes TEST Supabase query returned a `food_diary` record with `syntheticQA: true`, fixture `grapes-test-food-one-entry-v1`, `schema_version=1`, `revision=1`, `grams=100`, `kcal=123` and the correct synthetic label.
- A separate hosted attempt read returned `outcome=committed` and `resulting_revision=1` for a synthetic candidate. One dedicated synthetic profile and one attempt were observed in count checks. No private user identifiers, credentials, tokens or screenshots are committed to this repository.
- The TEST Data API now exposes `api`; `grapes_private` remains unexposed. The successful v25 candidate workflow is [Actions 40124199006](https://github.com/fabianpetermark-commits/Grapes/actions/runs/40124199006), SHA `fea0d58ce066b28daf47c24ae3c051c0e96bb978`. The historical TEST Android signing certificate was verified.
- NO PROD changes, NO real Food record, NO Drive/E-book migration, NO Android app data deletion.

## Safety hardening in this successor Draft PR

- Outbox settles an operation only if the separately fetched immutable server attempt matches **profile, kind, record, candidate, status, expected revision, schema version and resulting revision**. Wrong/missing revision or schema remains pending and raises a verification error.
- Browser verification covers missing response after server commit, unavailable attempt readback, altered revision, altered expected revision, altered schema version, deduplicated retries, conflicts, and owner isolation. The native RPC test fixture now returns the actual hosted SQL `read_attempt` response contract.
- Settings synthetic Food QA buttons use full-width text layout instead of the standard 42px settings icon-column grid; pending, fail and independently verified PASS messages are visually distinct.
- CI includes full Node unit suite, targeted Chromium/IndexedDB tests and native Android QA compilation; **no signing, publishing, install or artifact upload in this PR**.

## Still blocked – before any real Food synchronization

1. **Real two-account Auth/RLS proof** with independently signed-in TEST users, including unauthorized cross-account read/write attempts; a simulated JWT SQL test is *not* equivalent. No second account is created by this PR.
2. **Phone offline/reconnect proof** using a fresh *synthetic* attempt and explicit action. Re-using the existing successful trial must not silently create a second profile or overwrite the previous candidate.
3. **Verified local backup and restoration**, conflict review, retry audit and account separation before linking real Food/Water/Health data. The local IndexedDB outbox is durability, not a general encrypted vault.
4. **Data policy** for eventual Google Play: explicit opt-in, minimal collection, retention, export/deletion, privacy notice and age/health data scope. Health migration and automatic cloud sync remain OFF.
5. Resolve six known historical full-browser regression failures; targeted suites passing does not imply full regression is green.

**Do not merge into PROD, publish a TEST update, install a new APK, delete any data or activate real Food sync as part of this PR.**
