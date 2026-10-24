# Grapes TEST v24: unapplied Supabase SQL foundation

Stacked on draft #124. This copies the four SQL verification files from Phase 2 draft #102 at `8b6fa16ec23702a1bbc2a0f467ce79a70202cb84`, without merging its old TEST v16 application code. The schema proposal blob is identical to #102 (`44bc566ac01d3e709df4044de1026397d9c90622`). No Supabase project was contacted or modified by this port.

The proposal contains owner-scoped Grapes profiles, Food/Water/YAZIO/Health record kinds, immutable revisions and rejected attempts, private server-side CAS, owner-only reads and explicit function privileges. E-book remains outside Supabase. The `api` entrypoints invoke privileged functions in the unexposed `grapes_private` schema; the former are invokers, the latter derive their user from Auth rather than a supplied owner ID. This is a database proposal, not a running application provider.

The local CI workflow starts a disposable Supabase CLI stack on a GitHub-hosted runner, applies the proposal there, runs security assertions, two synthetic Auth identities and two independent PostgreSQL CAS connections, then asks local database advisors. It also runs clean npm install, unit and E-book Drive boundary tests and a web build. The exact result must be read from the PR workflow; #102's successful TEST v16 verification does not by itself prove this v24 stack.

Before any hosted action, review this exact SQL and the CI logs, obtain separate approval for the **dedicated Grapes Supabase TEST project only** (`aighqtqjlzirlokxwupt`), configure only `api` as exposed, and repeat real hosted two-user RLS/CAS tests. A first hosted write must be a synthetic profile and record. No legacy or personal Health data may be sent until account claim, source backup, local durability and #94/#95 recovery gates are complete.

The schema is not auto-applied. The feature flags for migration preview and Health sync remain OFF by default. No PROD, E-book, Drive permissions, APK or release changes are part of this draft.
