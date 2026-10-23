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
        return prefs.edit().clear().putString("state", state).putLong("started", now()).commit()
    }

    fun accept(uri: Uri?): Boolean {
        if (uri == null || uri.scheme != "hu.grapes.healthconnect" ||
            uri.host != "auth" || uri.path != "/callback" || uri.port != -1 ||
            uri.userInfo != null) return false
        val state = uri.getQueryParameter("state") ?: return false
        if (!STATE.matches(state) || state != prefs.getString("state", null) ||
            !fresh()) return false
        if (prefs.getString("result", null) != null) return false // replay or second callback
        val names = uri.queryParameterNames
        val code = uri.getQueryParameter("code")
        val error = uri.getQueryParameter("error")
        if (uri.getQueryParameters("state").size != 1) return false
        if (code != null && uri.fragment == null && names == setOf("state", "code") &&
            uri.getQueryParameters("code").size == 1 && CODE.matches(code)) {
            return prefs.edit().putString("code", code).putString("result", "code").commit()
        }
        if (error == "access_denied" && names.containsAll(setOf("state", "error")) &&
            names.all { it in setOf("state", "error", "error_description", "error_code") } &&
            names.all { uri.getQueryParameters(it).size == 1 } && matchingCancellationFragment(uri)) {
            return prefs.edit().putString("result", "cancel").commit()
        }
        return false
    }

    // Supabase mirrors denial details into query AND fragment. Accept only
    // identical cancellation fields; never permit a fragment carrying a code.
    private fun matchingCancellationFragment(uri: Uri): Boolean {
        val fragment = uri.encodedFragment ?: return true
        val details = Uri.parse("https://callback.invalid/?$fragment")
        val names = details.queryParameterNames
        return details.fragment == null && names.contains("error") &&
            names.all { it in setOf("error", "error_description", "error_code") } &&
            names.all { details.getQueryParameters(it).size == 1 &&
                details.getQueryParameter(it) == uri.getQueryParameter(it) }
    }

    fun consume(): JSONObject {
        val state = prefs.getString("state", null)
        val result = prefs.getString("result", null)
        val code = prefs.getString("code", null)
        val fresh = fresh()
        val output = JSONObject().put("status", "none")
        if (!fresh || state == null) {
            prefs.edit().clear().commit()
            return output
        }
        if (result == null) return output // browser is still open; keep transaction
        if (!prefs.edit().clear().commit()) return output // never return a replayable code
        if (result == "cancel") return output.put("status", "cancel").put("state", state)
        if (result == "code" && code != null) {
            return output.put("status", "code").put("state", state).put("code", code)
        }
        return output
    }

    fun cancel() { prefs.edit().clear().commit() }

    private fun fresh(): Boolean {
        val age = now() - prefs.getLong("started", 0)
        return age in 0..MAX_AGE_MS
    }
}
