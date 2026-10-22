package hu.grapes.healthconnect

import android.content.SharedPreferences

/**
 * Fail-closed production Auth access gate. WebView localStorage, Food, Water,
 * Finance and Drive are NOT scoped by Supabase Auth user ID. The app MUST NOT
 * associate existing local records with the first account to sign in.
 *
 * A separately reviewed migration/ownership confirmation must pin owner-uid
 * before enabling production login; this class does NOT write that key.
 * Accounts with any other UUID cannot unlock the old Android app profile.
 * The OAuth JS client independently verifies getUser() before this handoff.
 */
internal class ProdAuthGate(
    private val enabled: Boolean,
    private val ownerPreferences: SharedPreferences,
) {
    private var authorized = false
    private val uuid = Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")

    fun initialUrl(appUrl: String, authUrl: String): String =
        if (enabled) authUrl else appUrl

    fun canDisplayApp(): Boolean = !enabled || authorized

    fun allowApp(fromTrustedAuthPage: Boolean, verifiedUserId: String): Boolean {
        if (!enabled || !fromTrustedAuthPage || !uuid.matches(verifiedUserId)) return false
        val owner = ownerPreferences.getString("owner-uid", null)
        if (owner.isNullOrBlank() || owner != verifiedUserId) return false
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
