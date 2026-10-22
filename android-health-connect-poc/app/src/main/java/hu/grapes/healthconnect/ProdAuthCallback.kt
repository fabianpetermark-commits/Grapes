package hu.grapes.healthconnect

import android.content.Context
import android.net.Uri
import org.json.JSONObject

/**
 * PROD-only (disabled by default) OAuth handoff. The browser sees an authorization URL; only the
 * app-private WebView that created Supabase's PKCE verifier may exchange code.
 * Custom schemes can be claimed by other apps, so PKCE and this one-time state
 * are required. A verified owned HTTPS App Link is preferable for release.
 */
internal class ProdAuthCallback(context: Context, private val now: () -> Long = System::currentTimeMillis) {
    private val prefs = context.getSharedPreferences("grapes-prod-oauth-handoff-v1", Context.MODE_PRIVATE)

    companion object {
        const val CALLBACK_BASE = "hu.grapes.healthconnect://auth/callback"
        const val PROJECT_HOST = "yopabovoxyffhokhbgxl.supabase.co"
        private const val MAX_AGE_MS = 5 * 60 * 1000L
        private val STATE = Regex("[a-f0-9]{64}")
        private val CODE = Regex("[A-Za-z0-9._~-]{16,1024}")
    }

    fun begin(authorizeUrl: String, state: String): Boolean {
        if (!STATE.matches(state)) return false
        val uri = runCatching { Uri.parse(authorizeUrl) }.getOrNull() ?: return false
        if (uri.scheme != "https" || uri.host != PROJECT_HOST || uri.port != -1 ||
            uri.path != "/auth/v1/authorize" || uri.userInfo != null || uri.fragment != null) return false
        if (uri.getQueryParameter("provider") != "google" ||
            uri.getQueryParameter("redirect_to") != "$CALLBACK_BASE?state=$state" ||
            (uri.queryParameterNames.contains("scopes") || uri.queryParameterNames.contains("scope")) ||
            uri.getQueryParameters("provider").size != 1 ||
            uri.getQueryParameters("redirect_to").size != 1) return false
        prefs.edit().clear().putString("state", state).putLong("started", now()).apply()
        return true
    }

    fun accept(uri: Uri?): Boolean {
        if (uri == null || uri.scheme != "hu.grapes.healthconnect.test" ||
            uri.host != "auth" || uri.path != "/callback" || uri.port != -1 ||
            uri.userInfo != null || uri.fragment != null) return false
        val state = uri.getQueryParameter("state") ?: return false
        if (!STATE.matches(state) || state != prefs.getString("state", null) ||
            !fresh()) return false
        if (prefs.getString("result", null) != null) return false // replay or second callback
        val names = uri.queryParameterNames
        val code = uri.getQueryParameter("code")
        val error = uri.getQueryParameter("error")
        if (uri.getQueryParameters("state").size != 1) return false
        if (code != null && names == setOf("state", "code") &&
            uri.getQueryParameters("code").size == 1 && CODE.matches(code)) {
            prefs.edit().putString("code", code).putString("result", "code").apply()
            return true
        }
        if (error == "access_denied" && names.containsAll(setOf("state", "error")) &&
            names.all { it in setOf("state", "error", "error_description", "error_code") } &&
            uri.getQueryParameters("error").size == 1) {
            prefs.edit().putString("result", "cancel").apply()
            return true
        }
        return false
    }

    fun consume(): JSONObject {
        val state = prefs.getString("state", null)
        val result = prefs.getString("result", null)
        val code = prefs.getString("code", null)
        val fresh = fresh()
        val output = JSONObject().put("status", "none")
        if (!fresh || state == null) {
            prefs.edit().clear().apply()
            return output
        }
        if (result == null) return output // browser is still open; keep transaction
        prefs.edit().clear().apply() // one-shot after an actual return
        if (result == "cancel") return output.put("status", "cancel").put("state", state)
        if (result == "code" && code != null) {
            return output.put("status", "code").put("state", state).put("code", code)
        }
        return output
    }

    fun cancel() { prefs.edit().clear().apply() }

    private fun fresh(): Boolean {
        val age = now() - prefs.getLong("started", 0)
        return age in 0..MAX_AGE_MS
    }
}
