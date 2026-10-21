# Grapes TEST isolated web OAuth smoke preview (22 October 2026)

**Authorized:** user explicitly approved publishing a separate WEB-only TEST login page to validate Google OAuth. Not an Android TEST APK, Health migration, data sync, or PROD update.

## Pinning and site preservation
- The existing GitHub Pages site is deployed from `main` at `2fe7ad5990245c3b63ebef755ac5dbdf0bb381fc`, last successful `Deploy to GitHub Pages` run `38495301744`. That exact commit is used to re-create the current Pages output (including its separate E-book pilot) with the original build environment variables.
- TEST Auth source is fixed PR #102 HEAD `8b6fa16ec23702a1bbc2a0f467ce79a70202cb84` and will be checked out separately; #102 stays draft. The user-facing Android v16 still comes from `ec8e7fa08f86967afc75f495e5fc82b62a5c4a97`, which is not merged or deployed.
- The TEST login is built into a separate, auth-only bundle, not the ordinary Grapes web or Android app. Only the new `login-auth-test.html` and hashed `test-auth-assets/` files are copied into the original Pages `dist/`.
- A manifest verifies the original baseline build files remain byte-identical before and after copying the new files.
- No PROD/main branch push or merge. Published Pages endpoint may be replaced by a subsequent authorized `main` Pages deploy, removing this temporary add-on; re-adding later requires a new review.
- This Pages deployment does temporarily replace the *hosting artifact* with an additive superset of the currently deployed main build. Review the workflow and status before inferring any public live availability.

## Security and authentication boundaries
- Expected URL: `https://fabianpetermark-commits.github.io/Grapes/login-auth-test.html`.
- Only dedicated Supabase TEST project `aighqtqjlzirlokxwupt`; only its `sb_publishable_...` **public** key is embedded. No Google client secret, database or service-role keys.
- `VITE_GRAPES_TEST_AUTH_ENABLED=true` applies **only** to the isolated web bundle; `VITE_GRAPES_TEST_HEALTH_SYNC_ENABLED=false`.
- Existing Grapes app, E-book/Drive scopes, PROD Auth and TEST APK untouched. No Food/Water/Finance/Health data access and no Supabase SQL migration.
- Google OAuth redirect from Google must be `https://aighqtqjlzirlokxwupt.supabase.co/auth/v1/callback` and Supabase's own allowed redirect must be the exact GitHub Pages test login path. OAuth testing requires a user sign-in in their browser; CI cannot impersonate one.
- Hosted OAuth provider setup is managed separately by owner; Google secret must only be in Supabase Dashboard.
- Release workflow is one-shot, reviewed commit-only and deploys only after `npm ci`, Auth regression and existing Pages build gates pass.

## Release gates
1. Current `main` SHA still equals the prior Pages release `2fe7ad...`.
2. Phase 2 Auth source still equals `8b6fa16...`.
3. Unit, isolated Auth and web builds green.
4. Only the allowlisted login HTML and isolated auth assets are additive.
5. Pages deployment job succeeds and hosted link returns HTTP 200 with the intended page. A successful workflow is not by itself proof of a user completing Google OAuth.
6. No Health sync or remote migration.

## Rollback
The project owner may rerun the existing `Deploy to GitHub Pages` workflow on `main` to restore the original Pages deployment without the TEST login add-on. This doesn't alter databases, Android APKs or Drive.
