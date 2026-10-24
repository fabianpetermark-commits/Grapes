package hu.grapes.healthconnect

/**
 * QA-only navigation gate. This never owns credentials: the isolated
 * Supabase TEST client must verify a user before calling allowApp().
 * Authentication state is rechecked on every new Activity instance.
 */
internal class TestAuthGate(private val enabled: Boolean) {
    private var authorized = false
    private var verifiedSubject: String? = null
    private val subjectPattern = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    fun initialUrl(appUrl: String, authUrl: String): String =
        if (enabled) authUrl else appUrl

    fun canDisplayApp(): Boolean = !enabled || authorized

    fun allowApp(fromTrustedAuthPage: Boolean, subject: String): Boolean {
        if (!enabled || !fromTrustedAuthPage || !subjectPattern.matches(subject)) return false
        verifiedSubject = subject.lowercase()
        authorized = true
        return true
    }

    fun subject(fromTrustedAppPage: Boolean): String? =
        if (enabled && authorized && fromTrustedAppPage) verifiedSubject else null

    fun startLogout(fromTrustedAppPage: Boolean): Boolean {
        if (!enabled || !authorized || !fromTrustedAppPage) return false
        authorized = false
        verifiedSubject = null
        return true
    }

    fun lock() { authorized = false; verifiedSubject = null }
}
