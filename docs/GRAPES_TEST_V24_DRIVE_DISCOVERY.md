# Grapes TEST v24: read-only Health Drive discovery

Stacked on draft #123 at `0d8d6877dd8466f7a9d5c595e7d608bffcace7d2`. The released TEST v24 and PROD remain unchanged.

This slice adds a separate **Drive Health-fájlok keresése** action after the gated local Health preview. It runs only when the TEST migration preview flag is enabled, native QA Auth remains valid, and the existing Google Drive connection is active. It never starts OAuth, expands scopes, changes the Drive session, creates folders, writes files, or downloads file content. The UI displays a count, not file names or identifiers.

The discovery traverses every visible `Grapes TEST / Projects / Ételnapló` folder using paginated GET requests. It does not call `listGrapesProjects()`, whose folder helper can create missing folders. Missing folders return an empty list without creation. The code checks that the connected Drive identity stays unchanged across requests and rejects broken pagination, invalid metadata or excess results rather than returning a partial inventory. E-book folder discovery, permissions and reading data remain untouched.

**Coverage is limited to files visible under the current Drive grant.** The existing `drive.file` permission may not show every legacy file. The result explicitly says `app-visible-only`, `contentVerified: false` and cannot authorize migration. File bytes, profile IDs, versions and ownership still need a separately reviewed read-only capture and verification step. A connected Google Drive account does not establish ownership by the Supabase account.

Synthetic tests cover duplicate TEST roots, pagination, E-book exclusion, no POST, missing folders, account switching and invalid responses. The settings browser regression tests the explicit action with a fake Drive session and intercepted GET, while ensuring local Water data is unchanged. The CI workflow runs the existing unit, browser, Auth/Drive boundary, web build and Android QA checks without APK upload. Record actual results in the draft PR.

No hosted Supabase project, real user data or Google Drive permissions are changed. The feature flag remains OFF, Health sync remains OFF, and no account claim or import occurs. #94/#95 durability integration, actual Drive content validation, physical device backup verification and hosted TEST RLS/CAS remain release blockers.
