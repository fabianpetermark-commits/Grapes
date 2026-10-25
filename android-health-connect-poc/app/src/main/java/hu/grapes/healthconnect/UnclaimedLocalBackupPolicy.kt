package hu.grapes.healthconnect

/**
 * Extra gate for an explicitly requested, UNCLAIMED local-data backup only.
 * This gate does NOT authorize assigning legacy records to the active account.
 * Both the Android TEST build flag and the trusted, verified app session
 * are required before opening the user-controlled Storage Access Framework.
 */
internal object UnclaimedLocalBackupPolicy {
    private val fileName = Regex("^grapes-helyi-adatok-\\d{4}-\\d{2}-\\d{2}\\.json$")

    fun allow(
        qaBuild: Boolean,
        featureEnabled: Boolean,
        trustedAppPage: Boolean,
        verifiedSubject: String?,
        filename: String,
    ): Boolean = qaBuild && featureEnabled && trustedAppPage &&
        !verifiedSubject.isNullOrBlank() && fileName.matches(filename)

    fun requiresIndependentReadback(filename: String): Boolean = fileName.matches(filename)
}
