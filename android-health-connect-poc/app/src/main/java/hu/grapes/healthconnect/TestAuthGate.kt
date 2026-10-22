package hu.grapes.healthconnect

/**
 * QA-only navigation gate. This never owns credentials: the isolated
 * Supabase TEST client must verify a user before calling allowApp().
 * Authentication state is rechecked on every new Activity instance.
 */
internal class TestAuthGate(private val enabled: Boolean) {
    private var authorized = false

    fun initialUrl(appUrl: String, authUrl: String): String =
        if (enabled) authUrl else appUrl

    fun canDisplayApp(): Boolean = !enabled || authorized

    fun allowApp(fromTrustedAuthPage: Boolean): Boolean {
        if (!enabled || !fromTrustedAuthPage) return false
        authorized = true
        return true
    }

    fun startLogout(fromTrustedAppPage: Boolean): Boolean {
        if (!enabled || !authorized || !fromTrustedAppPage) return false
        authorized = false
        return true
    }

    fun lock() { authorized = false }
}
