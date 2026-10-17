package hu.grapes.healthconnect

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.time.LocalDate
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/** Unofficial YAZIO API. Credentials and session tokens never enter persistent storage. */
class YazioApi(context: android.content.Context) {
    private val vault = YazioCredentialVault(context.applicationContext)
    private var token = ""
    private var session = ""
    private val mutex = Mutex()

    suspend fun execute(args: JSONArray): String = mutex.withLock {
        withContext(Dispatchers.IO) {
            when (args.optString(0)) {
                "status" -> JSONObject().put("remembered", vault.hasCredentials()).toString()
                "forget" -> { vault.clear(); token = ""; session = ""; "{}" }
                "login", "loginRemembered", "loginSaved" -> {
                    token = ""; session = ""
                    val saved = if (args.optString(0) == "loginSaved") vault.read() else null
                    val email = (saved?.first ?: args.optString(1)).trim()
                    val password = saved?.second ?: args.optString(2)
                    require(email.contains("@") && password.isNotEmpty()) { "Add meg a YAZIO e-mail-címedet és jelszavadat." }
                    // Public mobile client identifiers used by funmelon64/Yazio-Exporter.
                    val body = JSONObject().put("client_id", "1_4hiybetvfksgw40o0sog4s884kwc840wwso8go4k8c04goo4c")
                        .put("client_secret", "6rok2m65xuskgkgogw40wkkk8sw0osg84s8cggsc4woos4s8o")
                        .put("grant_type", "password").put("username", email).put("password", password)
                    val result = request("/v9/oauth/token", body)
                    token = result.optString("access_token")
                    check(token.isNotBlank()) { "A YAZIO nem adott hozzáférést. A belépési mód megváltozhatott." }
                    session = UUID.randomUUID().toString()
                    if (args.optString(0) == "loginRemembered") vault.save(email, password)
                    JSONObject().put("session", session).toString()
                }
                "logout" -> {
                    if (args.optString(1) == session) { token = ""; session = "" }
                    "{}"
                }
                "day", "product" -> {
                    check(token.isNotEmpty() && args.optString(1) == session) { "Jelentkezz be újra a YAZIO-ba." }
                    val value = args.optString(2)
                    val path = if (args.optString(0) == "day") {
                        val date = runCatching { LocalDate.parse(value) }.getOrNull()
                        require(date != null && !date.isAfter(LocalDate.now())) { "Érvénytelen YAZIO-dátum." }
                        "/v9/user/consumed-items?date=$date"
                    } else {
                        require(value.matches(Regex("[a-zA-Z0-9-]{1,128}"))) { "Érvénytelen YAZIO-termékazonosító." }
                        "/v9/products/$value"
                    }
                    request(path).toString()
                }
                else -> error("Ismeretlen YAZIO-művelet.")
            }
        }
    }

    private fun request(path: String, body: JSONObject? = null): JSONObject {
        val connection = URL("https://yzapi.yazio.com$path").openConnection() as HttpsURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000
            connection.readTimeout = 30000
            connection.setRequestProperty("Accept", "application/json")
            if (body == null) connection.setRequestProperty("Authorization", "Bearer $token")
            else {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            check(code in 200..299) {
                when (code) {
                    400, 401 -> "A YAZIO elutasította a belépést vagy lejárt a kapcsolat. Ellenőrizd az e-mailes belépési adataidat."
                    403 -> "A YAZIO nem engedélyezi ezt a hozzáférést."
                    429 -> "A YAZIO túl sok kérést kapott. Próbáld újra később."
                    else -> "A YAZIO-adatlekérés sikertelen (HTTP $code). Nem történt import."
                }
            }
            val bytes = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(output.size() + count <= 4 * 1024 * 1024) { "Túl nagy YAZIO-válasz." }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            return try { JSONObject(String(bytes, Charsets.UTF_8)) }
            catch (_: Exception) { error("A YAZIO válaszformátuma megváltozott. Nem történt import.") }
        } catch (_: java.io.IOException) {
            error("A YAZIO nem érhető el. Ellenőrizd az internetkapcsolatot, majd próbáld újra.")
        } finally { connection.disconnect() }
    }
}
