package hu.grapes.healthconnect

import android.content.SharedPreferences

/**
 * Fail-closed production Auth access gate. WebView localStorage, Food, Water,
 * Finance and Drive are NOT scoped by Supabase Auth user ID. The app MUST NOT
 * associate existing local records with the first account to sign in.
 *
 * Only explicit on-device confirmation and screen-lock verification may pin
 * owner-uid before enabling production login; this class does NOT write that key.
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

    /**
     * New accounts cannot implicitly claim the pre-existing unscoped WebView
     * records. Binding is offered ONLY after a deliberate on-device consent
     * and a successful Android device-credential challenge in MainActivity.
     */
    fun canOfferBinding(fromTrustedAuthPage: Boolean, verifiedUserId: String): Boolean {
        return enabled && fromTrustedAuthPage && uuid.matches(verifiedUserId) &&
            ownerPreferences.getString("owner-uid", null).isNullOrBlank()
    }

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

    // Read-only identity handoff; never authorizes or binds a new account.
    fun subject(fromTrustedAppPage: Boolean): String? =
        if (enabled && authorized && fromTrustedAppPage)
            ownerPreferences.getString("owner-uid", null)?.takeIf { uuid.matches(it) }
        else null

    fun lock() { authorized = false }
}
