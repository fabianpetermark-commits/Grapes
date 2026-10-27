# Samsung Water PROD integration (#208)

Implemented on `codex/android-app` source, independent of the release candidate/#209.

* Cherry-picked #173 native fixes: `8f8290f` (permission status) and `4769291` (SDK 1.1.0 pagination, bounded and stable IDs). The interface and stub were extended to match. Broad TEST Auth/Food/SQL/release changes from #173 were deliberately excluded because they conflict with the current production architecture. The CSV parser comes from #171/#173 (`80451354` tree).
* Only `WATER_INTAKE` / `AccessType.READ`. Manual permission request is distinct from the never-prompting silent path. Native code pins/rechecks the active Grapes subject before permission, after permission and after the SDK read. PROD uses the already authorized, device-confirmed `ProdAuthGate` owner; TEST uses its existing native gate. No owner is inferred from a Drive email, JWT metadata or an untrusted JS argument. Auth-disabled legacy builds cannot do direct Samsung import.
* Existing `grapes-water-v1` remains the only Water data store. Samsung entries add `samsungOwnerId`; existing manual and Health Connect entries are unchanged. Rendering and exports filter Samsung entries by the checked owner. Saves/restores retain the other owners' hidden Samsung entries. Foreign-owner Samsung backups are rejected. Existing manual/HC profile remains subject to the existing single-owner PROD gate; this PR does not migrate or claim old data.
* Stable Samsung external IDs deduplicate both CSV and SDK imports. Whole malformed batches fail before writes. Owner checks, compare-before-write and read-back verification guard the local commit. No Samsung deletion/update reconciliation or two-way writes.
* Foreground auto-refresh is OFF by default, explicitly opted into per Grapes UUID, silent, 90-day window, at most once per 30 minutes in a running app. New foreground sessions may recheck immediately; duplicate IDs stay idempotent. Revoked permission never triggers a prompt. User can switch the preference off even when permission/SDK is unavailable.
* Water, Sync and Health Data connections open the working panel. CSV still works for a verified native owner without the AAR. Health Connect and YAZIO continue to use their existing implementation and routes.

## Licensed SDK and registration gates

Official distribution: https://developer.samsung.com/health/data/overview.html . Expected local file:
`android-health-connect-poc/app/libs/samsung-health-data-api-1.1.0.aar`.

The AAR is proprietary and ignored by Git. Neither this PR nor the workflow uploads it. The checksum from the verified #173 distribution is
`f5d3d83cf00b97d0bb1b1db4da076e861eb1c3e6e704d89a34e68909d2f38654`.
Gradle verifies this whenever an AAR is supplied. `GRAPES_REQUIRE_SAMSUNG_SDK=true` prevents a stub compile from masquerading as direct integration.

The new PR-only CI runs npm/browser regression and native stub tests, then decodes `SAMSUNG_HEALTH_DATA_SDK_AAR_BASE64` privately if available, verifies checksum/ZIP and compiles the real adapter plus release Kotlin. Missing SDK intentionally FAILS the licensed check with an explicit BLOCKED message. It also requires `SAMSUNG_HEALTH_REGISTERED_PACKAGE=hu.grapes.healthconnect` and `SAMSUNG_HEALTH_REGISTERED_CERT_SHA256` repository variables, and compares the existing private PROD signing certificate to that registered digest. Missing registration evidence intentionally fails this gate. A configured registration declaration is not proof that Samsung has approved it.

No APK assembly/publication, Release, Play, PROD SQL or v52 cycle is performed. Workflow cleans up the AAR and temporary signing material. It cannot grant Samsung licenses or partner approval.

## Verification and remaining external requirements

Local: `npm test`, Android web build, native-mock Samsung Water A→B→A/CSV/permission tests, existing Home/Health/Food/YAZIO regressions. Native gate tests are extended in `ProdAuthGateTest` and scheduled in CI. The execution environment has no Gradle/Android SDK or licensed AAR, so local Android unit execution and licensed compilation are blocked; CI results must be reported separately.

A successful direct production integration additionally requires the licensed AAR, Samsung's registration of the actual production package/signing certificate, a supported Samsung Health installation and a physical-device permission + real water-record readback. None can be proved by JS/native mocks. Until these pass, direct Samsung sync is **not production-certified**. The existing Health Connect route and verified-owner CSV alternative remain available.
